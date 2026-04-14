import prisma from "../config/prisma.js";

const fontSelect = { id: true, name: true, google_font_url: true, preview: true };

// Admin: list all fonts
export const listFonts = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            status: 0,
            ...(search && { name: { contains: search } })
        };

        const [fonts, total] = await Promise.all([
            prisma.font.findMany({ where, orderBy: { created_at: 'desc' }, select: fontSelect, skip, take: limitNum }),
            prisma.font.count({ where })
        ]);

        res.json({ success: true, data: fonts, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
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

// Admin: delete font (soft) with safety checks
export const removeFont = async (req, res) => {
    try {
        const { id } = req.params;

        const font = await prisma.font.findUnique({ 
            where: { id: parseInt(id) }
        });
        
        if (!font) {
            return res.status(404).json({ success: false, message: "Font not found" });
        }

        if (font.status === 2) {
            return res.status(400).json({ success: false, message: "Font is already deleted" });
        }

        // Check if font is being used by any name lists
        const activeNameLists = await prisma.nameList.count({
            where: { font_id: parseInt(id) }
        });

        if (activeNameLists > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete font. It is currently used by ${activeNameLists} name list(s)` 
            });
        }

        await prisma.font.update({ 
            where: { id: parseInt(id) }, 
            data: { status: 2 } 
        });

        res.json({ 
            success: true, 
            message: `Font "${font.name}" has been deleted` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: permanently delete font (hard delete with confirmation)
export const permanentDeleteFont = async (req, res) => {
    try {
        const { id } = req.params;
        const { confirm } = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({ 
                success: false, 
                message: "Please confirm deletion by sending 'confirm: DELETE' in request body" 
            });
        }

        const font = await prisma.font.findUnique({ 
            where: { id: parseInt(id) }
        });
        
        if (!font) {
            return res.status(404).json({ success: false, message: "Font not found" });
        }

        // Check if font is being used by any name lists
        const anyNameLists = await prisma.nameList.count({
            where: { font_id: parseInt(id) }
        });

        if (anyNameLists > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot permanently delete font. It is referenced by ${anyNameLists} name list(s). Use soft delete instead.` 
            });
        }

        // Delete from database
        await prisma.font.delete({ where: { id: parseInt(id) } });

        res.json({ 
            success: true, 
            message: `Font "${font.name}" has been permanently deleted` 
        });
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
