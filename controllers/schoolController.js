import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";

export const addSchool = async (req, res) => {
    try {
        const {
            name,
            education_program_ids = [],
            status = 0,
        } = req.body;

        const school = await prisma.school.create({
            data: {
                name,
                status,
                educationPrograms: {
                    connect: education_program_ids.map(id => ({
                        id: Number(id),
                    })),
                },
            },
            include: {
                educationPrograms: true,
            },
        });

        res.status(201).json({
            success: true,
            message: "School created",
            data: school,
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
        });
    }
};

export const listSchools = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.body;

        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {
            status: { not: 2 },
            ...(search && {
                name: {
                    contains: search,
                },
            }),
        };

        const [results, total] = await Promise.all([
            prisma.school.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { created_at: 'desc' },
                include: {
                    classes: true,
                    educationPrograms: true,
                },
            }),
            prisma.school.count({ where }),
        ]);

        res.json({
            success: true,
            data: results,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({
            success: false,
            message: error.message,
        });
    }
};

export const editSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status, educationProgramIds, education_program_ids } = req.body;
        const programIds = educationProgramIds ?? education_program_ids;

        const school = await prisma.school.update({
            where: { id: parseInt(id) },
            data: {
                name,
                status,
                educationPrograms: {
                    set: programIds ? programIds.map(pid => ({ id: Number(pid) })) : undefined,
                },
            },
            include: {
                educationPrograms: true,
            },
        });

        res.json({ success: true, message: "School updated", data: school });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const removeSchool = async (req, res) => {
    try {
        const schoolId = parseInt(req.params.id);
        // Fetch related IDs
        const [classes, users, schoolLogos] = await Promise.all([
            prisma.classes.findMany({ where: { school_id: schoolId }, select: { id: true } }),
            prisma.user.findMany({ where: { school_id: schoolId }, select: { id: true, class_id: true, role: true } }),
            prisma.logo.findMany({ where: { school_id: schoolId }, select: { id: true } })
        ]);
        const classIds = classes.map(c => c.id);
        const userIds = users.map(u => u.id);
        const studentIds = users.filter(u => u.role === 'student').map(u => u.id);
        const logoIds = schoolLogos.map(l => l.id);

        // Gather orders related to students or class reps of this school
        const orders = await prisma.order.findMany({
            where: { OR: [{ student_id: { in: studentIds } }, { class_id: { in: classIds } }] },
            select: { id: true }
        });
        const orderIds = orders.map(o => o.id);

        // Transaction to clean up all related data
        await prisma.$transaction(async (tx) => {
            // Delete order related data
            if (orderIds.length > 0) {
                await tx.orderHistory.deleteMany({ where: { order_id: { in: orderIds } } });
                await tx.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
                await tx.order.deleteMany({ where: { id: { in: orderIds } } });
            }
            // Delete logos uploaded by users of this school
            await tx.logo.deleteMany({ where: { OR: [{ school_id: schoolId }, { uploaded_by: { in: userIds } }] } });
            // Delete back designs linked to classes of this school
            if (classIds.length > 0) {
                await tx.backDesign.deleteMany({ where: { class_id: { in: classIds } } });
                await tx.productionPackage.deleteMany({ where: { class_id: { in: classIds } } });
                await tx.nameList.deleteMany({ where: { class_id: { in: classIds } } });
                await tx.classes.deleteMany({ where: { id: { in: classIds } } });
            }
            // Delete users (students & class reps)
            await tx.user.deleteMany({ where: { id: { in: userIds } } });
            // Finally delete the school record
            await tx.school.delete({ where: { id: schoolId } });
        });
        res.json({ success: true, message: `School and all related data deleted.` });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// School stats — classes count + students count per school
export const getSchoolStats = async (req, res) => {
    try {
        const { id } = req.params;

        const school = await prisma.school.findUnique({
            where: { id: parseInt(id) },
            include: { educationPrograms: true }
        });
        if (!school) return res.status(404).json({ success: false, message: "School not found" });

        const [classCount, studentCount] = await Promise.all([
            prisma.classes.count({ where: { school_id: parseInt(id), status: { not: 2 } } }),
            prisma.user.count({ where: { school_id: parseInt(id), role: 'student', status: { not: 2 } } })
        ]);

        res.json({ success: true, data: { ...school, class_count: classCount, student_count: studentCount } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// School classes with student counts
export const getSchoolClasses = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const [classes, total] = await Promise.all([
            prisma.classes.findMany({
                where: { school_id: parseInt(id), status: { not: 2 } },
                include: { education_program: true, users: { where: { role: 'student', status: { not: 2 } } } },
                skip,
                take: limitNum,
                orderBy: { created_at: 'desc' }
            }),
            prisma.classes.count({ where: { school_id: parseInt(id), status: { not: 2 } } })
        ]);

        const classIds = classes.map(c => c.id);

        const [classReps] = await Promise.all([
            prisma.user.findMany({
                where: { class_id: { in: classIds }, role: 'class_representative', status: { not: 2 } },
                select: { id: true, name: true, email: true, phone_number: true, class_id: true }
            })
        ]);

        const repMap = Object.fromEntries(classReps.map(r => [r.class_id, r]));

        const data = classes.map(c => ({
            id: c.id,
            name: c.name,
            graduation_year: c.graduation_year,
            process_status: c.process_status,
            change_deadline: c.change_deadline,
            education_program: c.education_program,
            class_rep: repMap[c.id] || null,
            student_count: c.users.length
        }));

        res.json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
