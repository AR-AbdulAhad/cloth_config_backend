import prisma from "../config/prisma.js";

export const createTemplate = async (req, res) => {
    try {
        const { name, subject, html_body, category, is_default } = req.body;
        if (!name || !subject || !html_body || !category)
            return res.status(400).json({ success: false, message: "Missing required fields" });

        const template = await prisma.emailTemplate.create({
            data: { name, subject, html_body, category, is_default: is_default || false }
        });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listTemplates = async (req, res) => {
    try {
        const { category } = req.query;
        const where = { status: { not: 2 }, ...(category && { category }) };
        const templates = await prisma.emailTemplate.findMany({ where, orderBy: { created_at: 'desc' } });
        res.json({ success: true, data: templates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getTemplate = async (req, res) => {
    try {
        const template = await prisma.emailTemplate.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!template || template.status === 2)
            return res.status(404).json({ success: false, message: "Template not found" });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateTemplate = async (req, res) => {
    try {
        const { name, subject, html_body, category, is_default } = req.body;
        const template = await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: { name, subject, html_body, category, is_default }
        });
        res.json({ success: true, data: template });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteTemplate = async (req, res) => {
    try {
        await prisma.emailTemplate.update({
            where: { id: parseInt(req.params.id) },
            data: { status: 2 }
        });
        res.json({ success: true, message: "Template deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
