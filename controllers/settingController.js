import prisma from "../config/prisma.js";

// Get all settings
export const getSettings = async (req, res) => {
    try {
        const settings = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
        // Return as key-value object for easy frontend use
        const data = Object.fromEntries(settings.map(s => [s.key, s.value]));
        res.json({ success: true, data, raw: settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Update a setting by key (upsert)
export const updateSetting = async (req, res) => {
    try {
        const { key, value, description } = req.body;
        if (!key || value === undefined) return res.status(400).json({ success: false, message: "key and value are required" });

        const setting = await prisma.setting.upsert({
            where: { key },
            update: { value: String(value), ...(description && { description }) },
            create: { key, value: String(value), description: description || null }
        });

        res.json({ success: true, message: "Setting updated", data: setting });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Bulk update settings
export const updateSettings = async (req, res) => {
    try {
        const { settings } = req.body; // [{ key, value }]
        if (!Array.isArray(settings) || settings.length === 0) {
            return res.status(400).json({ success: false, message: "settings array is required" });
        }

        const updates = await Promise.all(
            settings.map(s =>
                prisma.setting.upsert({
                    where: { key: s.key },
                    update: { value: String(s.value) },
                    create: { key: s.key, value: String(s.value), description: s.description || null }
                })
            )
        );

        res.json({ success: true, message: "Settings updated", data: updates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
