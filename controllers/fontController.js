import prisma from "../config/prisma.js";

const fontSelect = { id: true, name: true, google_font_url: true, preview: true };

// Admin: list all fonts
export const listFonts = async (req, res) => {
    try {
        const fonts = await prisma.font.findMany({
            where: { status: 0 },
            orderBy: { created_at: 'desc' },
            select: fontSelect
        });
        res.json({ success: true, data: fonts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: add a new font
export const addFont = async (req, res) => {
    try {
        const { name, google_font_url } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "name is required" });

        const existing = await prisma.font.findUnique({ where: { name } });
        if (existing) return res.status(409).json({ success: false, message: "Font already exists" });

        const font = await prisma.font.create({
            data: { name, google_font_url: google_font_url || null, status: 0 }
        });
        res.status(201).json({ success: true, message: "Font added", data: font });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: delete font (soft)
export const removeFont = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.font.update({ where: { id: parseInt(id) }, data: { status: 2 } });
        res.json({ success: true, message: "Font removed" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep / Public: get active fonts
export const getActiveFonts = async (req, res) => {
    try {
        const fonts = await prisma.font.findMany({
            where: { status: 0 },
            orderBy: { name: 'asc' },
            select: fontSelect
        });
        res.json({ success: true, data: fonts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: set font on their name list
export const setNameListFont = async (req, res) => {
    try {
        const { name_list_id, font_id } = req.body;
        if (!name_list_id || !font_id) return res.status(400).json({ success: false, message: "name_list_id and font_id required" });

        const nameList = await prisma.nameList.findUnique({ where: { id: parseInt(name_list_id) } });
        if (!nameList) return res.status(404).json({ success: false, message: "Name list not found" });

        if (req.user.role !== 'admin' && nameList.class_id !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const updated = await prisma.nameList.update({
            where: { id: parseInt(name_list_id) },
            data: { font_id: parseInt(font_id) }
        });

        res.json({ success: true, message: "Font set", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
