import { PrismaClient } from '@prisma/client';
import { sendInstantDayZeroSms, runSmsPipelineScheduler } from '../services/smsScheduler.js';
import { sanitizePhoneNumber } from '../services/gatewaySmsService.js';

const prisma = new PrismaClient();

/**
 * Get all SMS Campaigns with steps and subscriber count
 */
export const getCampaigns = async (req, res) => {
    try {
        const campaigns = await prisma.smsCampaign.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                steps: {
                    orderBy: { dispatch_day: 'asc' }
                },
                _count: {
                    select: {
                        subscribers: true,
                        steps: true
                    }
                }
            }
        });

        // Seed default campaign if none exists
        if (campaigns.length === 0) {
            const defaultCampaign = await prisma.smsCampaign.create({
                data: {
                    name: 'Skolerabat',
                    slug: 'skolerabat-680',
                    discount_type: 'Fixed Amount (DKK)',
                    discount_value: 600.00,
                    expiry_days: 21,
                    is_active: true,
                    steps: {
                        create: [
                            {
                                dispatch_day: 0,
                                message_content: 'Hej {{name}}! Velkommen til StudentLife. Din unikke skolerabatkode vil blive sendt til dig inden for få dage :-)'
                            },
                            {
                                dispatch_day: 5,
                                message_content: 'Hej {{name}}! Husk din rabatkode {{discountCode}} til din studenterhue.'
                            },
                            {
                                dispatch_day: 15,
                                message_content: 'Hej {{name}}! Din rabat {{discountCode}} udløber om 10 dage- {{expiryDate}}.'
                            }
                        ]
                    }
                },
                include: {
                    steps: {
                        orderBy: { dispatch_day: 'asc' }
                    },
                    _count: {
                        select: {
                            subscribers: true,
                            steps: true
                        }
                    }
                }
            });
            return res.json({ success: true, campaigns: [defaultCampaign] });
        }

        res.json({ success: true, campaigns });
    } catch (error) {
        console.error('[Get SMS Campaigns Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create a new SMS Campaign
 */
export const createCampaign = async (req, res) => {
    try {
        const { name, slug, discount_type, discount_value, expiry_days, steps } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Campaign name is required' });
        }

        const generatedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(100 + Math.random() * 900);

        const existing = await prisma.smsCampaign.findUnique({ where: { slug: generatedSlug } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Slug already exists. Please use a unique slug.' });
        }

        const defaultSteps = steps && steps.length > 0 ? steps : [
            { dispatch_day: 0, message_content: 'Hej {{name}}! Velkommen til StudentLife.' },
            { dispatch_day: 5, message_content: 'Hej {{name}}! Husk din rabatkode {{discountCode}}.' }
        ];

        const newCampaign = await prisma.smsCampaign.create({
            data: {
                name,
                slug: generatedSlug,
                discount_type: discount_type || 'Fixed Amount (DKK)',
                discount_value: parseFloat(discount_value || 0),
                expiry_days: parseInt(expiry_days || 21, 10),
                is_active: true,
                steps: {
                    create: defaultSteps.map(s => ({
                        dispatch_day: parseInt(s.dispatch_day || 0, 10),
                        message_content: s.message_content || ''
                    }))
                }
            },
            include: {
                steps: { orderBy: { dispatch_day: 'asc' } },
                _count: { select: { subscribers: true, steps: true } }
            }
        });

        res.json({ success: true, campaign: newCampaign });
    } catch (error) {
        console.error('[Create SMS Campaign Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Update an SMS Campaign and its timeline steps
 */
export const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, discount_type, discount_value, expiry_days, is_active, steps } = req.body;

        const campaignId = parseInt(id, 10);

        // Update main campaign details
        const updatedCampaign = await prisma.smsCampaign.update({
            where: { id: campaignId },
            data: {
                name,
                slug,
                discount_type,
                discount_value: parseFloat(discount_value || 0),
                expiry_days: parseInt(expiry_days || 21, 10),
                is_active: typeof is_active === 'boolean' ? is_active : true,
            }
        });

        // Replace steps if provided
        if (Array.isArray(steps)) {
            // Delete existing steps
            await prisma.smsStep.deleteMany({
                where: { campaign_id: campaignId }
            });

            // Re-create new steps
            if (steps.length > 0) {
                await prisma.smsStep.createMany({
                    data: steps.map(step => ({
                        campaign_id: campaignId,
                        dispatch_day: parseInt(step.dispatch_day || 0, 10),
                        message_content: step.message_content || ''
                    }))
                });
            }
        }

        const fullUpdated = await prisma.smsCampaign.findUnique({
            where: { id: campaignId },
            include: {
                steps: { orderBy: { dispatch_day: 'asc' } },
                _count: { select: { subscribers: true, steps: true } }
            }
        });

        res.json({ success: true, campaign: fullUpdated });
    } catch (error) {
        console.error('[Update SMS Campaign Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Delete an SMS Campaign
 */
export const deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.smsCampaign.delete({
            where: { id: parseInt(id, 10) }
        });
        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error) {
        console.error('[Delete SMS Campaign Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Public Opt-in Signup via QR code or shared link
 */
export const publicOptIn = async (req, res) => {
    try {
        const { slug, name, phone, school_name } = req.body;

        if (!slug || !name || !phone) {
            return res.status(400).json({ success: false, message: 'Name, phone and campaign slug are required' });
        }

        const campaign = await prisma.smsCampaign.findUnique({
            where: { slug }
        });

        if (!campaign || !campaign.is_active) {
            return res.status(404).json({ success: false, message: 'Campaign not found or inactive' });
        }

        const cleanPhone = String(sanitizePhoneNumber(phone));

        // Check if already subscribed
        let subscriber = await prisma.smsSubscriber.findFirst({
            where: {
                campaign_id: campaign.id,
                phone: cleanPhone
            }
        });

        if (!subscriber) {
            const discountCode = `${campaign.slug.toUpperCase().slice(0, 8)}-${Math.floor(1000 + Math.random() * 9000)}`;
            subscriber = await prisma.smsSubscriber.create({
                data: {
                    campaign_id: campaign.id,
                    name,
                    phone: cleanPhone,
                    school_name: school_name || 'STUDENT',
                    discount_code: discountCode,
                    status: 'active'
                }
            });

            // Trigger instant Day 0 SMS in background
            sendInstantDayZeroSms(subscriber.id);
        }

        res.json({
            success: true,
            message: 'Tilmeldt succesfuldt! (Opt-in successful)',
            subscriber
        });
    } catch (error) {
        console.error('[Public SMS Opt-In Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get Public Campaign by Slug (for public signup page)
 */
export const getPublicCampaignBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const campaign = await prisma.smsCampaign.findUnique({
            where: { slug },
            select: {
                id: true,
                name: true,
                slug: true,
                discount_type: true,
                discount_value: true,
                expiry_days: true,
                is_active: true
            }
        });

        if (!campaign || !campaign.is_active) {
            return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get Advanced Dispatch Logs with filters
 */
export const getDispatchLogs = async (req, res) => {
    try {
        const { search, campaign_id, status, order_status, startDate, endDate } = req.query;

        const where = {};

        if (search) {
            where.OR = [
                { recipient_name: { contains: search } },
                { recipient_phone: { contains: search } },
                { school_tag: { contains: search } }
            ];
        }

        if (campaign_id && campaign_id !== 'all') {
            where.campaign_id = parseInt(campaign_id, 10);
        }

        if (status && status !== 'all') {
            where.status = status;
        }

        if (order_status && order_status !== 'all') {
            where.order_status = order_status;
        }

        if (startDate || endDate) {
            where.dispatched_at = {};
            if (startDate) where.dispatched_at.gte = new Date(startDate);
            if (endDate) where.dispatched_at.lte = new Date(endDate);
        }

        const logs = await prisma.smsDispatchLog.findMany({
            where,
            orderBy: { dispatched_at: 'desc' },
            include: {
                campaign: {
                    select: { name: true, slug: true }
                },
                step: {
                    select: { dispatch_day: true }
                }
            },
            take: 200
        });

        res.json({ success: true, logs });
    } catch (error) {
        console.error('[Get SMS Dispatch Logs Error]:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Manually trigger pipeline scheduler execution
 */
export const triggerScheduler = async (req, res) => {
    try {
        const result = await runSmsPipelineScheduler();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
