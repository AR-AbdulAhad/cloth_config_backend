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
        const { name, isFromConfigurator } = req.body;

        if (!classId) return res.status(400).json({ success: false, message: "User not assigned to any class" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const isConfigurator = isFromConfigurator === 'true' || isFromConfigurator === true;

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
                isFromConfigurator: isConfigurator
            }
        });

        res.json({ success: true, message: "Back design uploaded", data: design });
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
            prisma.backDesign.findMany({ where, skip, take: limitNum, orderBy: { created_at: 'desc' } }),
            prisma.backDesign.count({ where })
        ]);

        res.json({ success: true, data: results, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listMyBackDesigns = async (req, res) => {
    try {
        const school_id = req.user?.class_id;
        if (!school_id) return res.json({ success: true, data: [] });

        const designs = await prisma.backDesign.findMany({
            where: { class_id: parseInt(school_id), status: { not: 2 }, isFromConfigurator: true     },
            orderBy: { created_at: 'desc' }
        });
        res.json({ success: true, data: designs });
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
        await prisma.backDesign.update({
            where: { id: parseInt(id) },
            data: { process_status: 'rejected', status: 2 }
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
