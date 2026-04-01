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

// Delete a country (Admin) — soft delete
export const removeCountry = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.country.update({
            where: { id: parseInt(id) },
            data: { status: 2 }
        });
        res.json({ success: true, message: "Country removed" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
