import { handlePrismaError } from "../utils/errorHandler.js";
import prisma from "../config/prisma.js";


// --- Class Management (CRUD) ---

// --- Class Management ---

export const listClasses = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) {
            return res.json({ success: true, data: [] });
        }
        const classData = await prisma.classes.findFirst({
            where: {
                id: classId,
                status: { not: 2 }
            },
            include: {
                school: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                users: {
                    where: {
                        role: 'class_representative',
                        status: { not: 2 }
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone_number: true,
                    }
                },
                back_designs: {
                    where: { status: { not: 2 } },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    select: { file_path: true }
                }
            }
        });
        if (!classData) {
            return res.json({ success: true, data: [] });
        }
        const schoolId = classData.school_id;
        const latestLogo = schoolId ? await prisma.logo.findFirst({
            where: { school_id: schoolId, status: { not: 2 } },
            orderBy: { created_at: 'desc' },
            select: { file_path: true }
        }) : null;
        const out = {
            ...classData,
            logo_path: latestLogo?.file_path ?? null,
            back_design_path: classData.back_designs?.[0]?.file_path ?? null,
            back_designs: undefined
        };
        res.json({ success: true, data: [out] });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

export const getAssignedClass = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(404).json({ success: false, message: "No class assigned" });

        const classData = await prisma.classes.findFirst({
            where: {
                id: parseInt(classId),
                status: { not: 2 }
            }
        });
        res.json({ success: true, data: classData });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};



export const editClass = async (req, res) => {
    try {
        const { id } = req.params;
        // Ensure class rep can only edit their assigned class
        if (parseInt(id) !== req.user.class_id) {
            return res.status(403).json({ success: false, message: "Unauthorized to edit this class" });
        }
        const { name, graduation_year, education_type, change_deadline, status } = req.body;
        const data = {};
        if (name) data.name = name;
        if (graduation_year) data.graduation_year = parseInt(graduation_year);
        if (education_type) data.education_type = education_type;
        if (change_deadline) data.change_deadline = new Date(change_deadline);
        if (status !== undefined) data.status = parseInt(status);

        const updatedClass = await prisma.classes.update({
            where: { id: parseInt(id) },
            data: data
        });
        res.json({ success: true, message: "Class updated", data: updatedClass });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- Student Management (CRUD) ---

// --- Student Management ---

/**
 * Class Representative – Student list (Limited).
 * Only registered students; name + status only. No contact details, order data, or files.
 */
export const listStudents = async (req, res) => {
    try {
        const classId = req.user?.class_id;
        const { page = 1, limit = 10, search = '' } = req.body || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "No class assigned to your account."
            });
        }

        const where = {
            class_id: parseInt(classId),
            role: 'student',
            status: { not: 2 },
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } }
                ]
            })
        };

        const [students, total, totalCompletedOrders] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    orders: {
                        where: { status: { not: 2 } },
                        select: { process_status: true },
                        take: 1,
                        orderBy: { created_at: 'desc' }
                    }
                },
                skip,
                take: limitNum,
                orderBy: { name: 'asc' }
            }),
            prisma.user.count({ where }),
            prisma.order.count({
                where: {
                    class_id: parseInt(classId),
                    process_status: 'completed',
                    status: { not: 2 }
                }
            })
        ]);

        const formattedStudents = students.map(student => {
            const latestOrder = student.orders?.[0];
            let status = 'Registered';
            if (latestOrder) {
                status = latestOrder.process_status === 'completed' ? 'Order Completed' : 'In Progress';
            }
            return {
                id: student.id,
                name: student.name,
                status
            };
        });

        res.json({
            success: true,
            data: formattedStudents,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum) || 0
            },
            summary: {
                total_registered: total,
                total_completed_orders: totalCompletedOrders
            }
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

export const generateRegistrationLink = async (req, res) => {
    try {
        const { school_id, class_id } = req.user;

        if (!school_id || !class_id) {
            return res.status(400).json({
                success: false,
                message: "User must be assigned to a school and class to generate a link."
            });
        }

        const payload = JSON.stringify({ school_id, class_id });
        const encoded = Buffer.from(payload).toString('base64');

        // You might want to get this base URL from configs or env
        // const baseUrl = process.env.LIVE_FRONTEND_URL || "http://localhost:5173";
        const registrationLink = `https://elipsestudio.com/Clothing-Configurator/register?${encoded}`;

        res.json({
            success: true,
            data: {
                registrationLink,
                encodedToken: encoded
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to generate registration link",
            error: err.message
        });
    }
};


// --- Design & Assets ---

// export const uploadSchoolLogo = async (req, res) => {
//     try {
//         // const { school_id, uploaded_by } = req.body;
//         const userId = req.user.id;
//         const schoolId = req.user.school_id;
//         // const finalSchoolId = schoolId || school_id || req.user.school_id;
//         // const finalUploadedBy = uploadedBy || uploaded_by || req.user.id;
//         const filePath = req.file?.path;

//         if (!schoolId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "User is not assigned to any school"
//             });
//         }


//         if (!filePath) return res.status(400).json({ success: false, message: "No file uploaded" });

//         const logo = await prisma.logo.create({
//             data: {
//                 school_id: parseInt(schoolId),
//                 uploaded_by: parseInt(userId),
//                 file_path: filePath,
//                 process_status: 'uploaded',
//                 status: 0
//             }
//         });
//         //  uploadLogo(school_id, uploaded_by, filePath);
//         res.json({ success: true, message: "Logo uploaded", data: { logoId: logo.id } });
//     } catch (err) {
//         res.status(500).json({ success: false, error: err.message });
//     }
// };

export const uploadSchoolLogo = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        const schoolId = Number(req.user.school_id);
        const { name } = req.body;

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "User is not assigned to any school"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const logo = await prisma.logo.create({
            data: {
                school_id: schoolId,
                name: name || `logo_${Date.now()}`,
                uploaded_by: userId,
                file_path: req.file.path,
                process_status: 'uploaded',
                status: 1 // 1 = inactive/pending until admin approves (0) or rejects (2)
            }
        });

        return res.json({
            success: true,
            message: "Logo uploaded successfully",
            data: logo
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Upload failed",
            error: err.message
        });
    }
};

export const uploadClassBackDesign = async (req, res) => {
    try {
        const classId = req.user.class_id;
        const { name } = req.body;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "User is not assigned to any class"
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const design = await prisma.backDesign.create({
            data: {
                class_id: parseInt(classId),
                name: name || `back_design_${Date.now()}`,
                file_path: req.file.path,
                is_library: false,
                process_status: 'uploaded',
                status: 1 // 1 = inactive/pending until admin approves (0) or rejects (2)
            }
        });

        return res.json({
            success: true,
            message: "Back design uploaded successfully",
            data: design
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Upload failed",
            error: err.message
        });
    }
};

/** Class rep: list logos for their school (library with status) */
export const listMyLogos = async (req, res) => {
    try {
        const schoolId = req.user?.school_id;
        if (!schoolId) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } });

        const { page = 1, limit = 20 } = req.body || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const where = { school_id: parseInt(schoolId), ...(req.body?.process_status && { process_status: req.body.process_status }) };
        const [items, total] = await Promise.all([
            prisma.logo.findMany({
                where,
                select: { id: true, name: true, file_path: true, status: true, process_status: true, admin_comment: true, created_at: true },
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum
            }),
            prisma.logo.count({ where })
        ]);
        res.json({
            success: true,
            data: items,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 0 }
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

/** Class rep: list back designs for their class (library with status) */
export const listMyBackDesigns = async (req, res) => {
    try {
        const classId = req.user?.class_id;
        if (!classId) return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } });

        const { page = 1, limit = 20 } = req.body || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;

        const where = { class_id: parseInt(classId), ...(req.body?.process_status && { process_status: req.body.process_status }) };
        const [items, total] = await Promise.all([
            prisma.backDesign.findMany({
                where,
                select: { id: true, name: true, file_path: true, status: true, isFromConfigurator: true, process_status: true, admin_comment: true, created_at: true },
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum
            }),
            prisma.backDesign.count({ where })
        ]);
        res.json({
            success: true,
            data: items,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 0 }
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

export const selectLibraryDesign = async (req, res) => {
    const { classId, class_id, libraryDesignId, library_design_id } = req.body;
    res.json({
        success: true,
        message: "Library design selected (Placeholder)",
        data: { classId: classId || class_id || req.user.class_id, libraryDesignId: libraryDesignId || library_design_id }
    });
};

// --- Name List & Overview ---



/**
 * Class Representative – Student Overview (Limited)
 * Only students who have registered themselves. No contact details, order data, or files.
 * Status: Registered | In progress | Order completed
 */
export const getStudentOverview = async (req, res) => {
    try {
        const classId = req.params.classId || req.user.class_id;
        const { page = 1, limit = 10, search = '' } = req.body || {};
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;

        if (!classId) return res.status(400).json({ success: false, message: "Class ID required" });

        const classIdInt = parseInt(classId);
        if (req.user.class_id != null && req.user.class_id !== classIdInt) {
            return res.status(403).json({ success: false, message: "Unauthorized to view this class" });
        }

        const where = {
            class_id: classIdInt,
            role: 'student',
            status: { not: 2 },
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } }
                ]
            })
        };

        const [students, total, totalCompletedOrders] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    orders: {
                        where: { status: { not: 2 } },
                        select: { process_status: true },
                        take: 1,
                        orderBy: { created_at: 'desc' }
                    }
                },
                skip,
                take: limitNum,
                orderBy: { name: 'asc' }
            }),
            prisma.user.count({ where }),
            prisma.order.count({
                where: {
                    class_id: classIdInt,
                    process_status: 'completed',
                    status: { not: 2 }
                }
            })
        ]);

        const formattedStudents = students.map(student => {
            const latestOrder = student.orders?.[0];
            let status = 'Registered';
            if (latestOrder) {
                status = latestOrder.process_status === 'completed' ? 'Order Completed' : 'In Progress';
            }
            return {
                id: student.id,
                name: student.name,
                status
            };
        });

        res.json({
            success: true,
            data: formattedStudents,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum) || 0
            },
            summary: {
                total_registered: total,
                total_completed_orders: totalCompletedOrders
            }
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};
