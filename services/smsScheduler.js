import { PrismaClient } from '@prisma/client';
import { sendGatewaySMS, parseMessageTemplate } from './gatewaySmsService.js';

const prisma = new PrismaClient();

/**
 * Process due SMS pipeline dispatches for all subscribers
 */
export const runSmsPipelineScheduler = async () => {
    console.log('[SMS Scheduler]: Running SMS Drip Pipeline Check...');
    try {
        const activeCampaigns = await prisma.smsCampaign.findMany({
            where: { is_active: true },
            include: {
                steps: true,
                subscribers: {
                    where: { status: 'active' }
                }
            }
        });

        const now = new Date();
        let totalDispatched = 0;

        for (const campaign of activeCampaigns) {
            const stepsByDay = {};
            campaign.steps.forEach(step => {
                stepsByDay[step.dispatch_day] = step;
            });

            for (const subscriber of campaign.subscribers) {
                const createdAt = new Date(subscriber.created_at);
                const diffTime = Math.abs(now - createdAt);
                const daysSinceSignup = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                const matchingStep = stepsByDay[daysSinceSignup];
                if (!matchingStep) continue;

                // Check if this step was already sent to this subscriber
                const existingLog = await prisma.smsDispatchLog.findFirst({
                    where: {
                        subscriber_id: subscriber.id,
                        step_id: matchingStep.id
                    }
                });

                if (existingLog) continue; // Already dispatched for this step

                // Prepare placeholders
                const discountCode = subscriber.discount_code || `${campaign.slug.toUpperCase().slice(0, 8)}-${subscriber.id}`;
                const expiryDateObj = new Date(createdAt.getTime() + (campaign.expiry_days * 24 * 60 * 60 * 1000));
                const expiryDateStr = expiryDateObj.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' });

                const parsedMessage = parseMessageTemplate(matchingStep.message_content, {
                    name: subscriber.name,
                    discountCode: discountCode,
                    expiryDate: expiryDateStr
                });

                // Send via GatewayAPI
                const result = await sendGatewaySMS({
                    recipient: subscriber.phone,
                    message: parsedMessage
                });

                // Create log entry
                await prisma.smsDispatchLog.create({
                    data: {
                        campaign_id: campaign.id,
                        subscriber_id: subscriber.id,
                        step_id: matchingStep.id,
                        recipient_name: subscriber.name,
                        recipient_phone: subscriber.phone,
                        school_tag: subscriber.school_name || 'STUDENT',
                        message_snippet: parsedMessage,
                        status: result.success ? 'sent' : 'failed',
                        order_status: 'NO ORDER',
                        api_response: JSON.stringify(result.response || result.error || {})
                    }
                });

                totalDispatched++;
            }
        }

        console.log(`[SMS Scheduler]: Finished pipeline check. Total SMS sent: ${totalDispatched}`);
        return { success: true, dispatched: totalDispatched };
    } catch (error) {
        console.error('[SMS Scheduler Error]:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send instant Day 0 SMS immediately after opt-in signup
 */
export const sendInstantDayZeroSms = async (subscriberId) => {
    try {
        const subscriber = await prisma.smsSubscriber.findUnique({
            where: { id: subscriberId },
            include: {
                campaign: {
                    include: {
                        steps: {
                            where: { dispatch_day: 0 }
                        }
                    }
                }
            }
        });

        if (!subscriber || !subscriber.campaign) return;
        const dayZeroStep = subscriber.campaign.steps[0];
        if (!dayZeroStep) return;

        // Check if already dispatched
        const existingLog = await prisma.smsDispatchLog.findFirst({
            where: {
                subscriber_id: subscriber.id,
                step_id: dayZeroStep.id
            }
        });
        if (existingLog) return;

        const campaign = subscriber.campaign;
        const discountCode = subscriber.discount_code || `${campaign.slug.toUpperCase().slice(0, 8)}-${subscriber.id}`;
        const expiryDateObj = new Date(new Date().getTime() + (campaign.expiry_days * 24 * 60 * 60 * 1000));
        const expiryDateStr = expiryDateObj.toLocaleDateString('da-DK', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const parsedMessage = parseMessageTemplate(dayZeroStep.message_content, {
            name: subscriber.name,
            discountCode: discountCode,
            expiryDate: expiryDateStr
        });

        const result = await sendGatewaySMS({
            recipient: subscriber.phone,
            message: parsedMessage
        });

        await prisma.smsDispatchLog.create({
            data: {
                campaign_id: campaign.id,
                subscriber_id: subscriber.id,
                step_id: dayZeroStep.id,
                recipient_name: subscriber.name,
                recipient_phone: subscriber.phone,
                school_tag: subscriber.school_name || 'STUDENT',
                message_snippet: parsedMessage,
                status: result.success ? 'sent' : 'failed',
                order_status: 'NO ORDER',
                api_response: JSON.stringify(result.response || result.error || {})
            }
        });

        console.log(`[SMS Instant]: Day 0 SMS sent to ${subscriber.phone}`);
    } catch (error) {
        console.error('[SMS Instant Error]:', error);
    }
};
