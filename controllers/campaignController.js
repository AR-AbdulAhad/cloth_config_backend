import prisma from "../config/prisma.js";
import { sendEmail } from "../utils/emailService.js";


// Create or save campaign as draft
export const createCampaign = async (req, res) => {
    try {
        const { title, name, subject, html_body, body, target_type = 'all', target_id, target_role, template_id } = req.body;
        const campaignTitle = title || name;

        let emailBody = html_body || body;
        let emailSubject = subject;

        // If template_id provided AND no custom body, load from template
        if (template_id && !emailBody) {
            const template = await prisma.emailTemplate.findUnique({ where: { id: parseInt(template_id) } });
            if (!template) return res.status(404).json({ success: false, message: "Template not found" });
            emailBody = template.html_body;
            emailSubject = emailSubject || template.subject;
        }

        if (!campaignTitle || !emailSubject || !emailBody) {
            return res.status(400).json({ success: false, message: "Missing required fields: name, subject, body" });
        }

        const campaign = await prisma.campaign.create({
            data: {
                title: campaignTitle,
                subject: emailSubject,
                html_body: emailBody,
                target_type,
                target_id: target_id ? parseInt(target_id) : null,
                target_role: target_role || null,
                template_id: template_id ? parseInt(template_id) : null,
                status: "draft"
            }
        });

        res.json({ success: true, message: "Campaign created", data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
}

// List all campaigns
export const listCampaigns = async (req, res) => {
    try {
        const campaigns = await prisma.campaign.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                template: {
                    select: { id: true, name: true }
                }
            }
        });

        // Add target object information for each campaign
        const campaignsWithTargets = await Promise.all(campaigns.map(async (campaign) => {
            let targetObject = null;

            if (campaign.target_type === 'school' && campaign.target_id) {
                targetObject = await prisma.school.findUnique({
                    where: { id: campaign.target_id },
                    select: { id: true, name: true }
                });
            } else if (campaign.target_type === 'class' && campaign.target_id) {
                targetObject = await prisma.classes.findUnique({
                    where: { id: campaign.target_id },
                    select: {
                        id: true,
                        name: true,
                        school: { select: { id: true, name: true } }
                    }
                });
            } else if (campaign.target_type === 'individual' && campaign.target_id) {
                targetObject = await prisma.user.findUnique({
                    where: { id: campaign.target_id },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        school: { select: { id: true, name: true } }
                    }
                });
            }

            return {
                ...campaign,
                target_object: targetObject
            };
        }));

        res.json({ success: true, data: campaignsWithTargets });
    } catch (err) {
        console.error('Error in listCampaigns:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get single campaign
export const getCampaign = async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                template: {
                    select: { id: true, name: true }
                }
            }
        });

        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

        // Add target object information
        let targetObject = null;

        if (campaign.target_type === 'school' && campaign.target_id) {
            targetObject = await prisma.school.findUnique({
                where: { id: campaign.target_id },
                select: { id: true, name: true }
            });
        } else if (campaign.target_type === 'class' && campaign.target_id) {
            targetObject = await prisma.classes.findUnique({
                where: { id: campaign.target_id },
                select: {
                    id: true,
                    name: true,
                    school: { select: { id: true, name: true } }
                }
            });
        } else if (campaign.target_type === 'individual' && campaign.target_id) {
            targetObject = await prisma.user.findUnique({
                where: { id: campaign.target_id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    school: { select: { id: true, name: true } }
                }
            });
        }

        const campaignWithTarget = {
            ...campaign,
            target_object: targetObject
        };

        res.json({ success: true, data: campaignWithTarget });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update campaign
export const updateCampaign = async (req, res) => {
    try {
        const { title, subject, body, target_type, target_id, target_role, template_id } = req.body;

        // Use title or for campaign title
        const campaignTitle = title;

        // Use or body for email content
        const emailBody = body;

        // Build update data object, filtering out undefined values
        const updateData = {};

        if (campaignTitle !== undefined) updateData.title = campaignTitle;
        if (subject !== undefined) updateData.subject = subject;
        if (emailBody !== undefined) updateData.html_body = emailBody;
        if (target_type !== undefined) updateData.target_type = target_type;
        if (target_id !== undefined) updateData.target_id = target_id ? parseInt(target_id) : null;
        if (target_role !== undefined) updateData.target_role = target_role || null;
        if (template_id !== undefined) updateData.template_id = template_id ? parseInt(template_id) : null;

        const campaign = await prisma.campaign.update({
            where: { id: parseInt(req.params.id) },
            data: updateData
        });

        res.json({ success: true, message: "Campaign updated", data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete campaign
export const deleteCampaign = async (req, res) => {
    try {
        await prisma.campaign.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true, message: "Campaign deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};


// Send campaign to target audience
export const sendCampaign = async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const { force = false, userId = null } = req.body || {};
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
        if (campaign.status === "sent") return res.status(400).json({ success: false, message: "Campaign already sent" });

        const consentFilter = force ? {} : { consent_marketing: true };

        let users = [];

        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: parseInt(userId) },
                select: { email: true, name: true, status: true, consent_marketing: true }
            });
            if (user && user.status !== 2 && (force || user.consent_marketing)) {
                users = [user];
            } else {
                return res.status(400).json({ success: false, message: "User not found or not eligible for emails" });
            }
        } else {
            // Existing targeting logic
            switch (campaign.target_type) {
                case "all":
                    users = await prisma.user.findMany({ where: { status: { not: 2 }, ...consentFilter }, select: { email: true, name: true } });
                    break;

                case "class":
                    if (!campaign.target_id) return res.status(400).json({ success: false, message: "target_id required for class targeting" });
                    users = await prisma.user.findMany({ where: { class_id: campaign.target_id, status: { not: 2 }, ...consentFilter }, select: { email: true, name: true } });
                    break;

                case "school":
                    if (!campaign.target_id) return res.status(400).json({ success: false, message: "target_id required for school targeting" });
                    users = await prisma.user.findMany({ where: { school_id: campaign.target_id, status: { not: 2 }, ...consentFilter }, select: { email: true, name: true } });
                    break;

                case "role":
                    if (!campaign.target_role) return res.status(400).json({ success: false, message: "target_role required for role targeting" });
                    users = await prisma.user.findMany({ where: { role: campaign.target_role, status: { not: 2 }, ...consentFilter }, select: { email: true, name: true } });
                    break;

                case "individual":
                    if (!campaign.target_id) return res.status(400).json({ success: false, message: "target_id required for individual targeting" });
                    const user = await prisma.user.findUnique({ where: { id: campaign.target_id }, select: { email: true, name: true, status: true, consent_marketing: true } });
                    if (user && user.status !== 2 && (force || user.consent_marketing)) users = [user];
                    break;

                default:
                    return res.status(400).json({ success: false, message: "Invalid target_type" });
            }
        }

        if (users.length === 0) {

            // Debug: Check if there are any users for this school without filters
            if (campaign.target_type === 'school') {
                const allSchoolUsers = await prisma.user.findMany({
                    where: { school_id: campaign.target_id },
                    select: { id: true, name: true, email: true, status: true, consent_marketing: true }
                });
            }

            return res.status(400).json({ success: false, message: "No users found matching target criteria" });
        }

        // Send emails
        let sent = 0, failed = 0;

        for (const user of users) {
            // Replace {{name}} placeholder with actual name
            const personalizedHtml = campaign.html_body.replace(/\{\{name\}\}/g, user.name);

            try {
                await sendEmail(user.email, campaign.subject, personalizedHtml, process.env.SMTP_USER);
                sent++;
            } catch (err) {
                console.error(`Failed to send to ${user.email}:`, err.message);
                failed++;
            }
        }

        // Update campaign status only if not sending to specific user
        if (!userId) {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: { status: "sent", sent_count: sent, failed_count: failed, sent_at: new Date() }
            });
        }

        const message = userId ?
            `Email sent to specific user: ${sent} sent, ${failed} failed` :
            `Campaign sent to ${sent} users, ${failed} failed`;

        res.json({ success: true, message, data: { sent, failed } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// NEW: Send campaign to specific user by userId
export const sendCampaignToUser = async (req, res) => {
    try {
        const campaignId = parseInt(req.params.id);
        const { userId, force = false } = req.body;

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

        // Get user details
        const user = await prisma.user.findUnique({
            where: { id: parseInt(userId) },
            select: { id: true, email: true, name: true, status: true, consent_marketing: true }
        });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.status === 2) {
            return res.status(400).json({ success: false, message: "User is inactive" });
        }

        if (!force && !user.consent_marketing) {
            return res.status(400).json({ success: false, message: "User has not consented to marketing emails" });
        }

        // Personalize email content
        const personalizedHtml = campaign.html_body.replace(/\{\{name\}\}/g, user.name);
        const personalizedSubject = campaign.subject.replace(/\{\{name\}\}/g, user.name);

        // Send email
        try {
            await sendEmail(user.email, personalizedSubject, personalizedHtml, process.env.SMTP_USER);

            res.json({
                success: true,
                message: `Email sent successfully to ${user.name} (${user.email})`,
                data: {
                    user_id: user.id,
                    user_name: user.name,
                    user_email: user.email,
                    campaign_id: campaignId,
                    campaign_title: campaign.title
                }
            });
        } catch (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError.message);
            res.status(500).json({
                success: false,
                message: `Failed to send email to ${user.name}`,
                error: emailError.message
            });
        }

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
