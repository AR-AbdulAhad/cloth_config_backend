import prisma from "../config/prisma.js";

// ─────────────────────────────────────────────
// GET all shipping rates (admin + public)
// ─────────────────────────────────────────────
export const listShippingRates = async (req, res) => {
    try {
        const { status } = req.query; // optional: ?status=0 for active only

        const where = {
            ...(status !== undefined && { status: parseInt(status) })
        };

        const rates = await prisma.shippingRate.findMany({
            where,
            orderBy: { country_name: 'asc' }
        });

        res.json({ success: true, data: rates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// GET single shipping rate by ID
// ─────────────────────────────────────────────
export const getShippingRate = async (req, res) => {
    try {
        const { id } = req.params;

        const rate = await prisma.shippingRate.findUnique({
            where: { id: parseInt(id) }
        });

        if (!rate) return res.status(404).json({ success: false, message: "Shipping rate not found" });

        res.json({ success: true, data: rate });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// CREATE shipping rate (admin)
// ─────────────────────────────────────────────
export const createShippingRate = async (req, res) => {
    try {
        const {
            country_name,
            country_code,
            regular_delivery_rate,
            express_delivery_rate,
            currency,
            description
        } = req.body;

        if (!country_name) {
            return res.status(400).json({ success: false, message: "country_name is required" });
        }
        if (regular_delivery_rate === undefined || regular_delivery_rate === null) {
            return res.status(400).json({ success: false, message: "regular_delivery_rate is required" });
        }
        if (express_delivery_rate === undefined || express_delivery_rate === null) {
            return res.status(400).json({ success: false, message: "express_delivery_rate is required" });
        }

        const existing = await prisma.shippingRate.findUnique({
            where: { country_name }
        });
        if (existing) {
            return res.status(409).json({ success: false, message: `Shipping rate for "${country_name}" already exists` });
        }

        const rate = await prisma.shippingRate.create({
            data: {
                country_name,
                country_code: country_code || null,
                regular_delivery_rate: parseFloat(regular_delivery_rate),
                express_delivery_rate: parseFloat(express_delivery_rate),
                currency: currency || 'DKK',
                description: description || null,
                status: 0
            }
        });

        res.status(201).json({ success: true, message: "Shipping rate created", data: rate });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// UPDATE shipping rate (admin)
// ─────────────────────────────────────────────
export const updateShippingRate = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            country_name,
            country_code,
            regular_delivery_rate,
            express_delivery_rate,
            currency,
            description
        } = req.body;

        const existing = await prisma.shippingRate.findUnique({
            where: { id: parseInt(id) }
        });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Shipping rate not found" });
        }

        // Check duplicate name if changing country_name
        if (country_name && country_name !== existing.country_name) {
            const duplicate = await prisma.shippingRate.findUnique({ where: { country_name } });
            if (duplicate) {
                return res.status(409).json({ success: false, message: `Shipping rate for "${country_name}" already exists` });
            }
        }

        const updated = await prisma.shippingRate.update({
            where: { id: parseInt(id) },
            data: {
                ...(country_name                && { country_name }),
                ...(country_code  !== undefined && { country_code: country_code || null }),
                ...(regular_delivery_rate !== undefined && { regular_delivery_rate: parseFloat(regular_delivery_rate) }),
                ...(express_delivery_rate !== undefined && { express_delivery_rate: parseFloat(express_delivery_rate) }),
                ...(currency              !== undefined && { currency }),
                ...(description           !== undefined && { description: description || null })
            }
        });

        res.json({ success: true, message: "Shipping rate updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// TOGGLE active / inactive (admin)
// ─────────────────────────────────────────────
export const toggleShippingRateStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const rate = await prisma.shippingRate.findUnique({ where: { id: parseInt(id) } });
        if (!rate) return res.status(404).json({ success: false, message: "Shipping rate not found" });

        const updated = await prisma.shippingRate.update({
            where: { id: parseInt(id) },
            data: { status: rate.status === 0 ? 1 : 0 }
        });

        res.json({
            success: true,
            message: `Shipping rate for "${rate.country_name}" is now ${updated.status === 0 ? 'active' : 'inactive'}`,
            data: updated
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────
// DELETE shipping rate (admin) — hard delete
// ─────────────────────────────────────────────
export const deleteShippingRate = async (req, res) => {
    try {
        const { id } = req.params;

        const rate = await prisma.shippingRate.findUnique({ where: { id: parseInt(id) } });
        if (!rate) return res.status(404).json({ success: false, message: "Shipping rate not found" });

        await prisma.shippingRate.delete({ where: { id: parseInt(id) } });

        res.json({ success: true, message: `Shipping rate for "${rate.country_name}" deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
