import prisma from "../config/prisma.js";
import { sendEmail } from "../utils/emailService.js";

// Create or save campaign as draft
export const createCampaign = async (req, res) => {
    try {
        const { title, subject, html_body, body, target_type, target_id, target_role } = req.body;
        const emailBody = html_body || body;

        if (!title || !subject || !emailBody || !target_type) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const campaign = await prisma.campaign.create({
            data: { title, subject, html_body: emailBody, target_type, target_id, target_role, status: "draft" }
        });

        res.json({ success: true, message: "Campaign created", data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// List all campaigns
export const listCampaigns = async (req, res) => {
    try {
        const campaigns = await prisma.campaign.findMany({ orderBy: { created_at: 'desc' } });
        res.json({ success: true, data: campaigns });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get single campaign
export const getCampaign = async (req, res) => {
    try {
        const campaign = await prisma.campaign.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
        res.json({ success: true, data: campaign });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update campaign
export const updateCampaign = async (req, res) => {
    try {
        const { title, subject, html_body, target_type, target_id, target_role } = req.body;
        const campaign = await prisma.campaign.update({
            where: { id: parseInt(req.params.id) },
            data: { title, subject, html_body, target_type, target_id, target_role }
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
        const { force = false } = req.body; // force=true bypasses consent_marketing filter
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
        if (campaign.status === "sent") return res.status(400).json({ success: false, message: "Campaign already sent" });

        // consent filter — bypass if force=true
        const consentFilter = force ? {} : { consent_marketing: true };

        // Get target users based on target_type
        let users = [];

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

        if (users.length === 0) {
            return res.status(400).json({ success: false, message: "No users found matching target criteria" });
        }

        // Send emails
        let sent = 0, failed = 0;

        for (const user of users) {
            // Replace {{name}} placeholder with actual name
            const personalizedHtml = campaign.html_body.replace(/\{\{name\}\}/g, user.name);

            try {
                await sendEmail(user.email, campaign.subject, personalizedHtml);
                sent++;
            } catch (err) {
                console.error(`Failed to send to ${user.email}:`, err.message);
                failed++;
            }
        }

        // Update campaign status
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "sent", sent_count: sent, failed_count: failed, sent_at: new Date() }
        });

        res.json({ success: true, message: `Campaign sent to ${sent} users, ${failed} failed`, data: { sent, failed } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
