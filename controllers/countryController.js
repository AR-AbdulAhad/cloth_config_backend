import prisma from "../config/prisma.js";


// ===============================
// LIST COUNTRIES
// ===============================
export const listCountries = async (req, res) => {
    try {

        const {
            page = 1,
            limit = 10,
            search = ''
        } = req.body || {};

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

        const skip = (pageNum - 1) * limitNum;

        const where = {
            status: {
                not: 2
            },

            ...(search && {
                name: {
                    contains: search
                }
            })
        };

        const [countries, total] = await Promise.all([

            prisma.country.findMany({
                where,
                orderBy: {
                    name: 'asc'
                },

                select: {
                    id: true,
                    name: true,
                    code: true,
                    status: true,
                    created_at: true
                },

                skip,
                take: limitNum
            }),

            prisma.country.count({ where })

        ]);

        res.json({
            success: true,
            data: countries,

            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};


// ===============================
// ADD COUNTRY
// ===============================
export const addCountry = async (req, res) => {

    try {

        const { name, code } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Country name is required"
            });
        }

        const existing = await prisma.country.findUnique({
            where: { name }
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                message: "Country already exists"
            });
        }

        const country = await prisma.country.create({
            data: {
                name,
                code: code || null,
                status: 1
            }
        });

        res.status(201).json({
            success: true,
            message: "Country added successfully",
            data: country
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};


// ===============================
// EDIT COUNTRY
// ===============================
export const editCountry = async (req, res) => {

    try {

        const { id } = req.params;
        const { name, code } = req.body;

        const existingCountry = await prisma.country.findUnique({
            where: {
                id: parseInt(id)
            }
        });

        if (!existingCountry) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }

        if (name) {

            const duplicate = await prisma.country.findFirst({
                where: {
                    name,
                    NOT: {
                        id: parseInt(id)
                    }
                }
            });

            if (duplicate) {
                return res.status(409).json({
                    success: false,
                    message: "Another country with this name already exists"
                });
            }
        }

        const updated = await prisma.country.update({
            where: {
                id: parseInt(id)
            },

            data: {
                ...(name && { name }),
                ...(code !== undefined && { code })
            }
        });

        res.json({
            success: true,
            message: "Country updated successfully",
            data: updated
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};


// ===============================
// SOFT DELETE COUNTRY
// ===============================
export const removeCountry = async (req, res) => {

    try {

        const { id } = req.params;

        const country = await prisma.country.findUnique({
            where: {
                id: parseInt(id)
            }
        });

        if (!country) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }

        if (country.status === 2) {
            return res.status(400).json({
                success: false,
                message: "Country already deleted"
            });
        }

        // Check classes
        const activeClasses = await prisma.classes.count({
            where: {
                country_id: parseInt(id),
                status: {
                    not: 2
                }
            }
        });

        if (activeClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete country. ${activeClasses} class(es) are using it`
            });
        }

        // Check designs
        const activeBackDesigns = await prisma.backDesign.count({
            where: {
                country_id: parseInt(id),
                status: {
                    not: 2
                }
            }
        });

        if (activeBackDesigns > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete country. ${activeBackDesigns} back design(s) are using it`
            });
        }

        await prisma.country.update({
            where: {
                id: parseInt(id)
            },

            data: {
                status: 2
            }
        });

        res.json({
            success: true,
            message: `Country "${country.name}" deleted successfully`
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};


// ===============================
// TOGGLE ACTIVE / INACTIVE
// ===============================
export const toggleCountryStatus = async (req, res) => {

    try {

        const { id } = req.params;

        const country = await prisma.country.findUnique({
            where: {
                id: parseInt(id)
            }
        });

        if (!country) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }

        if (country.status === 2) {
            return res.status(400).json({
                success: false,
                message: "Deleted country status cannot be changed"
            });
        }

        const updatedCountry = await prisma.country.update({
            where: {
                id: parseInt(id)
            },

            data: {
                status: country.status === 1 ? 0 : 1
            }
        });

        res.json({
            success: true,
            message: `Country "${country.name}" status updated successfully`,
            data: updatedCountry
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};


// ===============================
// PERMANENT DELETE
// ===============================
export const permanentDeleteCountry = async (req, res) => {

    try {

        const { id } = req.params;
        const { confirm } = req.body;

        if (confirm !== "DELETE") {
            return res.status(400).json({
                success: false,
                message: "Please send confirm: DELETE"
            });
        }

        const country = await prisma.country.findUnique({
            where: {
                id: parseInt(id)
            }
        });

        if (!country) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }

        const anyClasses = await prisma.classes.count({
            where: {
                country_id: parseInt(id)
            }
        });

        if (anyClasses > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete. ${anyClasses} class(es) reference this country`
            });
        }

        const anyBackDesigns = await prisma.backDesign.count({
            where: {
                country_id: parseInt(id)
            }
        });

        if (anyBackDesigns > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete. ${anyBackDesigns} back design(s) reference this country`
            });
        }

        await prisma.country.delete({
            where: {
                id: parseInt(id)
            }
        });

        res.json({
            success: true,
            message: `Country "${country.name}" permanently deleted`
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
};