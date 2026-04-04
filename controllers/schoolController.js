import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";

export const addSchool = async (req, res) => {
    try {
        const { name, education_type } = req.body;
        const school = await prisma.school.create({
            data: { name, education_type, status: 0 }
        });
        res.status(201).json({ success: true, message: "School created", data: school });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            ...(search && { name: { contains: search } })
        };

        const [results, total] = await Promise.all([
            prisma.school.findMany({ where, skip, take: limitNum, orderBy: { created_at: 'desc' } }),
            prisma.school.count({ where })
        ]);

        res.json({ success: true, data: results, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, message: error.message });
    }
};

export const editSchool = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, education_type, status } = req.body;
        const school = await prisma.school.update({
            where: { id: parseInt(id) },
            data: { name, education_type, status }
        });
        res.json({ success: true, message: "School updated", data: school });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const removeSchool = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.school.update({
            where: { id: parseInt(id) },
            data: { status: 2 }
        });
        res.json({ success: true, message: "School deleted" });
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
            select: { id: true, name: true, education_type: true }
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
                include: {
                    _count: { select: { orders: true } }
                },
                skip,
                take: limitNum,
                orderBy: { created_at: 'desc' }
            }),
            prisma.classes.count({ where: { school_id: parseInt(id), status: { not: 2 } } })
        ]);

        const classIds = classes.map(c => c.id);

        const [studentCounts, classReps] = await Promise.all([
            prisma.user.groupBy({
                by: ['class_id'],
                where: { class_id: { in: classIds }, role: 'student', status: { not: 2 } },
                _count: { id: true }
            }),
            prisma.user.findMany({
                where: { class_id: { in: classIds }, role: 'class_representative', status: { not: 2 } },
                select: { id: true, name: true, email: true, phone_number: true, class_id: true }
            })
        ]);

        const countMap = Object.fromEntries(studentCounts.map(s => [s.class_id, s._count.id]));
        const repMap = Object.fromEntries(classReps.map(r => [r.class_id, r]));

        const data = classes.map(c => ({
            id: c.id,
            name: c.name,
            graduation_year: c.graduation_year,
            process_status: c.process_status,
            change_deadline: c.change_deadline,
            order_locked: c.order_locked,
            class_rep: repMap[c.id] || null,
            student_count: countMap[c.id] || 0,
            order_count: c._count.orders
        }));

        res.json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
