import prisma from "../config/prisma.js";

// List all countries
export const listCountries = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            status: { not: 2 },
            ...(search && { name: { contains: search } })
        };

        const [countries, total] = await Promise.all([
            prisma.country.findMany({
                where,
                orderBy: { name: 'asc' },
                select: { id: true, name: true, code: true },
                skip,
                take: limitNum
            }),
            prisma.country.count({ where })
        ]);

        res.json({
            success: true,
            data: countries,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Add a new country (Admin)
export const addCountry = async (req, res) => {
    try {
        const { name, code } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "name is required" });

        const existing = await prisma.country.findUnique({ where: { name } });
        if (existing) return res.status(409).json({ success: false, message: "Country already exists" });

        const country = await prisma.country.create({
            data: { name, code: code || null, status: 0 }
        });
        res.status(201).json({ success: true, message: "Country added", data: country });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Edit a country (Admin)
export const editCountry = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code } = req.body;

        const updated = await prisma.country.update({
            where: { id: parseInt(id) },
            data: {
                ...(name && { name }),
                ...(code !== undefined && { code })
            }
        });
        res.json({ success: true, message: "Country updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Delete a country (Admin) — soft delete with safety checks
export const removeCountry = async (req, res) => {
    try {
        const { id } = req.params;

        const country = await prisma.country.findUnique({ 
            where: { id: parseInt(id) }
        });
        
        if (!country) {
            return res.status(404).json({ success: false, message: "Country not found" });
        }

        if (country.status === 2) {
            return res.status(400).json({ success: false, message: "Country is already deleted" });
        }

        // Check if country is being used by any classes
        const activeClasses = await prisma.classes.count({
            where: { 
                country_id: parseInt(id),
                status: { not: 2 }
            }
        });

        if (activeClasses > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete country. It is currently used by ${activeClasses} active class(es)` 
            });
        }

        // Check if country is being used by any back designs
        const activeBackDesigns = await prisma.backDesign.count({
            where: { 
                country_id: parseInt(id),
                status: { not: 2 }
            }
        });

        if (activeBackDesigns > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete country. It is currently used by ${activeBackDesigns} active back design(s)` 
            });
        }

        await prisma.country.update({
            where: { id: parseInt(id) },
            data: { status: 2 }
        });

        res.json({ 
            success: true, 
            message: `Country "${country.name}" has been deleted` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Permanently delete a country (Admin) — hard delete with confirmation
export const permanentDeleteCountry = async (req, res) => {
    try {
        const { id } = req.params;
        const { confirm } = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({ 
                success: false, 
                message: "Please confirm deletion by sending 'confirm: DELETE' in request body" 
            });
        }

        const country = await prisma.country.findUnique({ 
            where: { id: parseInt(id) }
        });
        
        if (!country) {
            return res.status(404).json({ success: false, message: "Country not found" });
        }

        // Check if country is being used by any classes (including deleted ones)
        const anyClasses = await prisma.classes.count({
            where: { country_id: parseInt(id) }
        });

        if (anyClasses > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot permanently delete country. It is referenced by ${anyClasses} class(es). Use soft delete instead.` 
            });
        }

        // Check if country is being used by any back designs (including deleted ones)
        const anyBackDesigns = await prisma.backDesign.count({
            where: { country_id: parseInt(id) }
        });

        if (anyBackDesigns > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot permanently delete country. It is referenced by ${anyBackDesigns} back design(s). Use soft delete instead.` 
            });
        }

        // Delete from database
        await prisma.country.delete({ where: { id: parseInt(id) } });

        res.json({ 
            success: true, 
            message: `Country "${country.name}" has been permanently deleted` 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
