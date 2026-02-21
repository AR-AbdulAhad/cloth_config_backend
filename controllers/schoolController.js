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
