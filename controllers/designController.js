import prisma from "../config/prisma.js";

// export const uploadClassBackDesign = async (req, res) => {
//     try {
//         const classId = req.user.class_id;
//         const { name } = req.body;

//         if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
//         if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

//         const design = await prisma.backDesign.create({
//             data: {
//                 class_id: parseInt(classId),
//                 name: name || `back_design_${Date.now()}`,
//                 file_path: req.file.path,
//                 is_library: false,
//                 process_status: 'uploaded',
//                 status: 1
//             }
//         });

//         res.json({ success: true, message: "Back design uploaded", data: design });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };
export const uploadClassBackDesign = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { name, isFromConfigurator, designColor } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const isConfigurator = isFromConfigurator === 'true' || isFromConfigurator === true;

        // Validate designColor if provided
        if (designColor && !['white', 'black'].includes(designColor.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Invalid design color. Only 'white' or 'black' are allowed."
            });
        }

        // Check agar isFromConfigurator true hai aur already ek design exist karta hai
        if (isConfigurator) {
            const existingDesign = await prisma.backDesign.findFirst({
                where: {
                    class_id: parseInt(classId),
                    isFromConfigurator: true,
                    status: { not: 2 } // rejected designs ko ignore karo
                }
            });

            if (existingDesign) {
                return res.status(400).json({
                    success: false,
                    message: "Configurator back design already exists for this class. Cannot create another one.",
                    existingDesign
                });
            }
        }

        const design = await prisma.backDesign.create({
            data: {
                class_id: parseInt(classId),
                name: name || `back_design_${Date.now()}`,
                file_path: req.file.path,
                is_library: false,
                process_status: 'uploaded',
                status: 1,
                isFromConfigurator: isConfigurator,
                designColor: designColor ? designColor.toLowerCase() : null
            }
        });

        res.json({ success: true, message: "Back design uploaded", data: design });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};
export const reUploadClassBackDesign = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { name, isFromConfigurator, designColor } = req.body;
        const designId = req.params.id;

        if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const isConfigurator = isFromConfigurator === 'true' || isFromConfigurator === true;

        // Validate designColor if provided
        if (designColor && !['white', 'black'].includes(designColor.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Invalid design color. Only 'white' or 'black' are allowed."
            });
        }

        const design = await prisma.backDesign.update({
            where: { id: parseInt(designId) },
            data: {
                class_id: parseInt(classId),
                name: name || `back_design_${Date.now()}`,
                file_path: req.file.path,
                is_library: false,
                process_status: 'uploaded',
                status: 1,
                isFromConfigurator: isConfigurator,
                designColor: designColor ? designColor.toLowerCase() : null
            }
        });

        res.json({ success: true, message: "Back design updated", data: design });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listBackDesigns = async (req, res) => {
    try {
        const { class_id, page = 1, limit = 10, search = '', status: statusFilter } = req.body;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            ...(class_id && { class_id: parseInt(class_id) }),
            ...(statusFilter !== undefined && statusFilter !== '' && { status: parseInt(statusFilter) }),
            ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }] })
        };

        const [results, total] = await Promise.all([
            prisma.backDesign.findMany({
                where, skip, take: limitNum, orderBy: { created_at: 'desc' },
                include: { class: { select: { id: true, name: true } } }
            }),
            prisma.backDesign.count({ where })
        ]);

        res.json({ success: true, data: results, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listMyBackDesigns = async (req, res) => {
    try {
        const class_id = req.user?.class_id;
        if (!class_id) return res.json({ success: true, data: [] });

        const designs = await prisma.backDesign.findMany({
            where: { class_id: parseInt(class_id), status: { not: 2 } },
            orderBy: { created_at: 'desc' }
        });
        res.json({ success: true, data: designs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyClassBackDesign = async (req, res) => {
    try {
        const class_id = req.user?.class_id;
        if (!class_id)
            return res.status(400).json({ success: false, message: "User not assigned to any class" });

        // Use findFirst instead of findUnique
        const design = await prisma.backDesign.findFirst({
            where: {
                class_id: parseInt(class_id),
                isFromConfigurator: true,
                status: { not: 2 } // optional: ignore rejected designs
            },
            orderBy: { created_at: 'desc' } // get the latest design
        });

        if (!design) {
            return res.json({ success: true, data: null, message: "No back design found for this class" });
        }

        res.json({ success: true, data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getConfiguratorBackDesign = async (req, res) => {
    try {
        const classId = req.params.classId || req.user?.class_id;
        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "User not assigned to any class"
            });
        }

        const design = await prisma.backDesign.findFirst({
            where: {
                class_id: parseInt(classId),
                isFromConfigurator: true,
                status: { not: 2 } // rejected designs ko ignore karo
            },
            orderBy: { created_at: 'desc' }
        });

        if (!design) {
            return res.json({
                success: true,
                message: "No configurator back design found",
                data: null
            });
        }

        res.json({ success: true, data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const approveBackDesign = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.backDesign.update({
            where: { id: parseInt(id) },
            data: { process_status: 'approved', status: 0 }
        });
        res.json({ success: true, message: "Back design approved" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const rejectBackDesign = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment, reason } = req.body;
        await prisma.backDesign.update({
            where: { id: parseInt(id) },
            data: { process_status: 'rejected', status: 2, admin_comment: comment || reason || null }
        });
        res.json({ success: true, message: "Back design rejected" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getClassBackDesigns = async (req, res) => {
    try {
        const { classId } = req.params;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "Class ID is required"
            });
        }

        const designs = await prisma.backDesign.findMany({
            where: {
                class_id: parseInt(classId),
                status: { not: 2 } // rejected designs ko exclude karo
            },
            orderBy: { created_at: 'desc' }
        });

        res.json({
            success: true,
            data: designs,
            count: designs.length
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get all available study trip countries from DB
export const getStudyTripCountries = async (req, res) => {
    try {
        const countries = await prisma.country.findMany({
            where: { status: 0 },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true }
        });
        res.json({ success: true, data: countries });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: upload a library design with country_id
export const uploadLibraryDesign = async (req, res) => {
    try {
        const { name, country_id } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
        if (!country_id) return res.status(400).json({ success: false, message: "country_id is required" });

        const country = await prisma.country.findUnique({ where: { id: parseInt(country_id) } });
        if (!country) return res.status(404).json({ success: false, message: "Country not found" });

        const design = await prisma.backDesign.create({
            data: {
                name: name || `library_${country.name}_${Date.now()}`,
                file_path: req.file.path,
                is_library: true,
                country_id: parseInt(country_id),
                process_status: 'approved',
                status: 0
            }
        });

        res.json({ success: true, message: "Library design uploaded", data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get library designs filtered by country_id
export const getLibraryDesignsByCountry = async (req, res) => {
    try {
        const { country_id } = req.query;

        const where = {
            is_library: true,
            status: 0,
            process_status: 'approved',
            ...(country_id && { country_id: parseInt(country_id) })
        };

        const designs = await prisma.backDesign.findMany({
            where,
            include: { country: { select: { name: true, code: true } } },
            orderBy: { created_at: 'desc' }
        });

        res.json({ success: true, data: designs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: set study trip country on their class
export const setClassStudyTripCountry = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { country_id } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });
        if (!country_id) return res.status(400).json({ success: false, message: "country_id is required" });

        const country = await prisma.country.findUnique({ where: { id: parseInt(country_id) } });
        if (!country) return res.status(404).json({ success: false, message: "Country not found" });

        const updated = await prisma.classes.update({
            where: { id: parseInt(classId) },
            data: { country_id: parseInt(country_id) }
        });

        res.json({ success: true, message: `Study trip country set to ${country.name}`, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: get library designs for their class's study trip country
export const getLibraryDesignsForMyClass = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "No class assigned" });

        const classData = await prisma.classes.findUnique({
            where: { id: parseInt(classId) },
            select: { country_id: true, country: { select: { name: true, code: true } } }
        });

        const where = {
            is_library: true,
            status: 0,
            process_status: 'approved',
            ...(classData?.country_id && { country_id: classData.country_id })
        };

        const designs = await prisma.backDesign.findMany({
            where,
            include: { country: { select: { name: true, code: true } } },
            orderBy: { created_at: 'desc' }
        });

        res.json({
            success: true,
            country: classData?.country || null,
            data: designs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: delete their own back design (soft delete)
export const deleteMyBackDesign = async (req, res) => {
    try {
        const { designId } = req.params;
        const classId = req.user.class_id;

        const design = await prisma.backDesign.findUnique({ where: { id: parseInt(designId) } });
        if (!design) return res.status(404).json({ success: false, message: "Design not found" });
        if (design.class_id !== classId) return res.status(403).json({ success: false, message: "Unauthorized" });

        await prisma.backDesign.update({ where: { id: parseInt(designId) }, data: { status: 2 } });
        res.json({ success: true, message: "Back design deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
