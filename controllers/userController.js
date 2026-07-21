import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { handlePrismaError } from "../utils/errorHandler.js";
import { sendClassRepWelcomeEmail } from "../utils/emailService.js";
import { frontendDashboardUrl } from "../utils/const.js";

// expires_at is a required DB column, so there's no "no expiry" value to store —
// instead this is set far enough out (100 years) that it never expires in
// practice. A link is only ever invalidated by being redeemed (single-use burn
// in register()), not by time, so a student always has as long as they need.
const REGISTRATION_TOKEN_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000;
export const addClassRep = async (req, res) => {
    try {
        const { name, email, school_id } = req.body;
        if (!name || !email || !school_id) return res.status(400).json({ success: false, message: "Missing fields" });

        const generatedPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // If email exists but was soft-deleted, restore it
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            if (existingUser.status !== 2) {
                // user active hai (deleted nahi hai)

                if (existingUser.role === 'student') {
                    return res.status(409).json({
                        success: false,
                        message: "This email is already used by a student"
                    });
                }

                if (existingUser.role === 'class_representative') {
                    return res.status(409).json({
                        success: false,
                        message: "This email is already used by a class representative"
                    });
                }
            }
            // Restore deleted user with new details
            const restored = await prisma.user.update({
                where: { email },
                data: { name, password: hashedPassword, school_id: parseInt(school_id), role: 'class_representative', status: 0, class_id: null }
            });
            const encoded = Buffer.from(`${email}${generatedPassword}`).toString('base64');
            const baseUrl = `${frontendDashboardUrl}set-password?${encoded}`;
            await sendClassRepWelcomeEmail(email, baseUrl);
            return res.status(201).json({ success: true, message: "Class Representative restored and updated", data: { id: restored.id, name: restored.name, email: restored.email } });
        }

        const rep = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: "class_representative", school_id: parseInt(school_id), status: 0 }
        });

        const encoded = Buffer.from(`${email}${generatedPassword}`).toString('base64');
        const baseUrl = `${frontendDashboardUrl}set-password?${encoded}`;
        await sendClassRepWelcomeEmail(email, baseUrl);

        res.status(201).json({ success: true, message: "Class Representative created", data: { id: rep.id, name: rep.name, email: rep.email } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listClassReps = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', school_id, unassigned_only } = req.body;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {
            role: "class_representative",
            status: { not: 2 },
            ...(school_id && { school_id: parseInt(school_id) }),
            ...(unassigned_only && { class_id: null }),
            ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] })
        };

        const [reps, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    class_id: true,
                    school_id: true,
                    school: { select: { name: true } },
                    class: {
                        select: {
                            name: true,
                            process_status: true,
                            graduation_year: true
                        }
                    },
                    status: true
                },
                skip, take: limitNum, orderBy: { created_at: 'desc' }
            }),
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

// Generates one single-use registration link for one student.
// - Stays valid until the student actually registers with it — no time-based expiry.
// - Redeeming it (successful /register) burns it immediately.
// - Capped so a class rep can never have more live/registered seats than expected_students.
export const generateRegistrationLink = async (req, res) => {
    try {
        const { school_id, class_id, id: userId } = req.user;
        if (!school_id || !class_id) return res.status(400).json({ success: false, message: "Missing school/class info" });

        const classInfo = await prisma.classes.findUnique({
            where: { id: parseInt(class_id) },
            select: { expected_students: true }
        });
        const expectedStudents = parseInt(classInfo?.expected_students || 0);
        if (!expectedStudents || expectedStudents <= 0) {
            return res.status(400).json({
                success: false,
                message: "Set the expected number of students for your class before generating registration links."
            });
        }

        const now = new Date();
        const [registeredCount, liveTokenCount] = await Promise.all([
            prisma.user.count({
                where: { class_id: parseInt(class_id), role: 'student', status: { not: 2 } }
            }),
            prisma.registrationToken.count({
                where: { class_id: parseInt(class_id), status: 'unused', expires_at: { gt: now } }
            })
        ]);

        if (registeredCount >= expectedStudents) {
            return res.status(409).json({
                success: false,
                message: `You have reached the maximum of ${expectedStudents} students for this class.`
            });
        }

        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(now.getTime() + REGISTRATION_TOKEN_TTL_MS);

        await prisma.registrationToken.create({
            data: {
                token,
                school_id: parseInt(school_id),
                class_id: parseInt(class_id),
                created_by: parseInt(userId),
                expires_at: expiresAt
            }
        });

        const baseUrl = process.env.LIVE_FRONTEND_URL;
        const registrationLink = `${baseUrl}register?token=${token}`;

        res.json({
            success: true,
            data: { registrationLink, token, expiresAt }
        });
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

        const existingRep = await prisma.user.findUnique({
            where: { id }
        });

        if (!existingRep) {
            return res.status(404).json({
                success: false,
                message: "Class Representative not found"
            });
        }

        const data = {};

        if (name) data.name = name;
        if (email) data.email = email;

        // School changed?
        if (school_id) {
            const newSchoolId = parseInt(school_id);

            if (existingRep.school_id !== newSchoolId) {
                data.school_id = newSchoolId;

                // Remove class assignment
                data.class_id = null;
            }
        }

        const updated = await prisma.user.update({
            where: { id },
            data
        });

        res.json({
            success: true,
            message:
                existingRep.school_id !== parseInt(school_id)
                    ? "School updated and class assignment removed"
                    : "Class Representative updated",
            data: {
                id: updated.id,
                name: updated.name,
                email: updated.email
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};

export const removeClassRep = async (req, res) => {
    try {
        const repId = parseInt(req.params.id);

        const rep = await prisma.user.findUnique({
            where: { id: repId },
            include: {
                orders: { select: { id: true } },
                logos: { select: { id: true } }
            }
        });

        if (!rep) return res.status(404).json({ success: false, message: "Class representative not found" });
        if (rep.role !== 'class_representative')
            return res.status(400).json({ success: false, message: "User is not a class representative" });

        // ── Full cleanup in a transaction ─────────────────────────────────────
        await prisma.$transaction(async (tx) => {
            // 1. Nullify changed_by in order_history (no FK relation to User)
            await tx.orderHistory.updateMany({
                where: { changed_by: repId },
                data: { changed_by: null }
            });

            // 2. Delete order-related data
            const orderIds = rep.orders.map(o => o.id);
            if (orderIds.length > 0) {
                await tx.orderHistory.deleteMany({ where: { order_id: { in: orderIds } } });
                await tx.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
                await tx.order.deleteMany({ where: { student_id: repId } });
            }

            // 3. Delete logos uploaded by this user
            await tx.logo.deleteMany({ where: { uploaded_by: repId } });

            // 4. If class_rep had a class assigned — clean up class-level data too
            if (rep.class_id) {
                // Delete all back designs for this class
                await tx.backDesign.deleteMany({ where: { class_id: rep.class_id } });

                // Reset class: unset active back_design_id/country_id and clear the
                // delivery address this rep entered — it shouldn't carry over to
                // whoever becomes the class's next representative
                await tx.classes.update({
                    where: { id: rep.class_id },
                    data: { back_design_id: null, country_id: null, delivery_details: null }
                });
            }

            // 5. Hard-delete the user — fresh start if same email re-registers
            await tx.user.delete({ where: { id: repId } });
        });

        res.json({ success: true, message: `Class representative "${rep.name}" and all associated data deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: reset any user's password and send new credentials via email
export const adminResetPassword = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const newPassword = Math.random().toString(36).slice(-8);
        const hashed = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: parseInt(userId) },
            data: { password: hashed }
        });

        // Send new credentials via email
        const { sendEmail } = await import('../utils/emailService.js');
        await sendEmail(user.email, 'Your StudentLife Password Has Been Reset', `
            <div style="font-family:Arial,sans-serif;padding:20px;">
                <h2 style="color:#006d75;">Password Reset</h2>
                <p>Hi <strong>${user.name}</strong>,</p>
                <p>Your password has been reset by the admin.</p>
                <p><strong>New Password:</strong> ${newPassword}</p>
                <p>Please log in and change your password immediately.</p>
                <hr/>
                <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
            </div>
        `);

        res.json({ success: true, message: `Password reset and sent to ${user.email}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
