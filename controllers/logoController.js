import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";

export const uploadSchoolLogo = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        const schoolId = Number(req.user.school_id);
        const { name } = req.body;

        if (!schoolId) return res.status(400).json({ success: false, message: "User is not assigned to any school" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const logo = await prisma.logo.create({
            data: {
                school_id: schoolId,
                name: name || `logo_${Date.now()}`,
                uploaded_by: userId,
                file_path: req.file.path,
                process_status: 'uploaded',
                status: 1
            }
        });

        res.json({ success: true, message: "Logo uploaded successfully", data: logo });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listSchoolLogos = async (req, res) => {
    try {
        const { school_id, page = 1, limit = 10, search = '', status: statusFilter } = req.body;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            ...(school_id && { school_id: parseInt(school_id) }),
            ...(statusFilter !== undefined && statusFilter !== '' && { status: parseInt(statusFilter) }),
            ...(search && { OR: [{ name: { contains: search } }] })
        };

        const [logos, total] = await Promise.all([
            prisma.logo.findMany({
                where,
                include: { school: { select: { name: true } }, user: { select: { name: true } } },
                skip, take: limitNum, orderBy: { created_at: 'desc' }
            }),
            prisma.logo.count({ where })
        ]);

        res.json({ success: true, data: logos, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

export const listMyLogos = async (req, res) => {
    try {
        const schoolId = req.user?.school_id;
        if (!schoolId) return res.json({ success: true, data: [] });

        const logos = await prisma.logo.findMany({
            where: { school_id: parseInt(schoolId), status: { not: 2 } },
            orderBy: { created_at: 'desc' }
        });
        res.json({ success: true, data: logos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const approveLogo = async (req, res) => {
    try {
        const { logoId } = req.params;
        await prisma.logo.update({
            where: { id: parseInt(logoId) },
            data: { process_status: 'approved', status: 0 }
        });
        res.json({ success: true, message: "Logo approved" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const rejectLogo = async (req, res) => {
    try {
        const { logoId } = req.params;
        const { comment } = req.body;
        await prisma.logo.update({
            where: { id: parseInt(logoId) },
            data: { process_status: 'rejected', status: 2, admin_comment: comment }
        });
        res.json({ success: true, message: "Logo rejected" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
