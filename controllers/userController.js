import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import { handlePrismaError } from "../utils/errorHandler.js";
import { sendClassRepWelcomeEmail } from "../utils/emailService.js";

export const addClassRep = async (req, res) => {
    try {
        const { name, email, school_id } = req.body;
        const generatedPassword = Math.random().toString(36).slice(-8);
        if (!name || !email || !school_id) return res.status(400).json({ success: false, message: "Missing fields" });

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(409).json({ success: false, message: "Email already exists" });

        const hashedPassword = await bcrypt.hash(generatedPassword, 10);
        const rep = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: "class_representative", school_id: parseInt(school_id), status: 0 }
        });

        const encoded = Buffer.from(`${email}${generatedPassword}`).toString('base64');
        const baseUrl = `https://elipsestudio.com/Cloth-Configurator-Dashboard/set-password?${encoded}`;
        await sendClassRepWelcomeEmail(email, baseUrl);

        res.status(201).json({ success: true, message: "Class Representative created", data: { id: rep.id, name: rep.name, email: rep.email } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listClassReps = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.body;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = { role: "class_representative", status: { not: 2 }, ...(search && { OR: [{ name: { contains: search } }] }) };
        const [reps, total] = await Promise.all([
            prisma.user.findMany({ where, select: { id: true, name: true, email: true, school: { select: { name: true } }, status: true }, skip, take: limitNum, orderBy: { created_at: 'desc' } }),
            prisma.user.count({ where })
        ]);

        res.json({ success: true, data: reps, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listStudents = async (req, res) => {
    try {
        const classId = req.user?.class_id || req.body.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "Class ID required" });

        const students = await prisma.user.findMany({
            where: { class_id: parseInt(classId), role: 'student', status: { not: 2 } },
            select: { id: true, name: true, orders: { select: { process_status: true }, take: 1, orderBy: { created_at: 'desc' } } }
        });

        const formatted = students.map(s => ({
            id: s.id,
            name: s.name,
            status: s.orders[0] ? (s.orders[0].process_status === 'completed' ? 'Order completed' : 'In progress') : 'Registered'
        }));

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const generateRegistrationLink = async (req, res) => {
    try {
        const { school_id, class_id } = req.user;
        if (!school_id || !class_id) return res.status(400).json({ success: false, message: "Missing school/class info" });

        const payload = JSON.stringify({ school_id, class_id });
        const encoded = Buffer.from(payload).toString('base64');
        const baseUrl = process.env.LIVE_FRONTEND_URL || "http://localhost:5173";
        const link = `${baseUrl}/Clothing-Configurator/register?${encoded}`;

        res.json({ success: true, data: { registrationLink: link, token: encoded } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getStudentOverview = async (req, res) => {
    try {
        const classId = req.params.classId || req.user.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "Class ID required" });

        const students = await prisma.user.findMany({
            where: { class_id: parseInt(classId), role: 'student', status: { not: 2 } },
            select: { id: true, name: true, orders: { select: { process_status: true }, take: 1, orderBy: { created_at: 'desc' } } }
        });

        const formatted = students.map(s => ({
            id: s.id,
            name: s.name,
            status: s.orders[0] ? (s.orders[0].process_status === 'completed' ? 'Order completed' : 'In progress') : 'Registered'
        }));

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const editClassRep = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, email, school_id } = req.body;

        const data = {};
        if (name) data.name = name;
        if (email) data.email = email;
        if (school_id) data.school_id = parseInt(school_id);

        const updated = await prisma.user.update({
            where: { id },
            data
        });
        res.json({ success: true, message: "Class Representative updated", data: { id: updated.id, name: updated.name, email: updated.email } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const removeClassRep = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.user.update({
            where: { id },
            data: { status: 2 }
        });
        res.json({ success: true, message: "Class Representative deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
