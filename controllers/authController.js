import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { triggerAutomatedEmail } from "../utils/emailService.js";

// Generic Login for ALL users (Admin, Class Rep, Student)
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Basic validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Fetch user
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (user.role === "student") {
            return res.status(403).json({
                success: false,
                message: "Students cannot log in to the dashboard. Please use the cloth configurator."
            });
        }

        if (user.role === "class_representative") {
            if (!user.class_id) {
                return res.status(400).json({
                    success: false,
                    message: "This class representative has no class assigned."
                });
            }
            // user.class_id is assigned, continue
        }


        if (user.status === 1) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive. Please contact support."
            });
        }

        // Compare password (async)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                school_id: user.school_id,
                class_id: user.class_id
            },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    school_id: user.school_id,
                    class_id: user.class_id,
                    status: user.status
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    }
};

export const decodeRegistrationToken = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ success: false, message: "Token is required" });
        }

        const record = await prisma.registrationToken.findUnique({ where: { token } });
        if (!record || record.status !== 'unused' || record.expires_at < new Date()) {
            return res.status(400).json({ success: false, message: "This registration link is invalid or has expired." });
        }

        res.json({
            success: true,
            data: { school_id: record.school_id, class_id: record.class_id, expires_at: record.expires_at }
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: "Invalid token",
            error: err.message
        });
    }
};

// Student Self-Registration — requires a single-use registration token
// issued by the class rep (see userController.generateRegistrationLink).
// school_id/class_id come from the token, not the request body, so a
// student can't register into a class they weren't invited to.
export const register = async (req, res) => {
    try {
        const { name, email, password, token, year_of_birth, consent_marketing = false } = req.body;

        // Validation
        if (!name || !email || !password || !token) {
            return res.status(400).json({
                success: false,
                message: "Name, email, password, and token are required"
            });
        }

        const tokenRecord = await prisma.registrationToken.findUnique({ where: { token } });
        if (!tokenRecord || tokenRecord.status !== 'unused' || tokenRecord.expires_at < new Date()) {
            return res.status(400).json({
                success: false,
                message: "This registration link is invalid or has expired. Ask your class representative for a new one."
            });
        }
        const { school_id, class_id } = tokenRecord;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            if (existingUser.status !== 2) {

                if (existingUser.role === "student") {
                    return res.status(409).json({
                        success: false,
                        message: "Email already registered as student"
                    });
                }

                if (existingUser.role === "class_representative") {
                    return res.status(409).json({
                        success: false,
                        message: "Email already registered as class representative"
                    });
                }

                return res.status(409).json({
                    success: false,
                    message: "Email already in use"
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Atomically burn the token and create the student — the
        // conditional updateMany (status: 'unused') acts as the guard
        // against two concurrent requests redeeming the same link.
        let student;
        try {
            student = await prisma.$transaction(async (tx) => {
                const burned = await tx.registrationToken.updateMany({
                    where: { token, status: 'unused', expires_at: { gt: new Date() } },
                    data: { status: 'used', used_at: new Date() }
                });
                if (burned.count === 0) {
                    throw new Error('TOKEN_ALREADY_REDEEMED');
                }

                const newStudent = await tx.user.create({
                    data: {
                        name,
                        email,
                        password: hashedPassword,
                        school_id,
                        class_id,
                        year_of_birth: year_of_birth || null,
                        role: "student",
                        consent_marketing,
                        status: 0 // Active by default
                    }
                });

                await tx.registrationToken.update({
                    where: { token },
                    data: { used_by: newStudent.id }
                });

                return newStudent;
            });
        } catch (txErr) {
            if (txErr.message === 'TOKEN_ALREADY_REDEEMED') {
                return res.status(409).json({
                    success: false,
                    message: "This registration link has already been used. Ask your class representative for a new one."
                });
            }
            throw txErr;
        }

        // Trigger automated welcome email (fire-and-forget — errors logged internally)
        triggerAutomatedEmail('user_registration', {
            name: student.name,
            email: student.email,
            role: 'student',
            school: student.school_id?.toString() || '',
            class: student.class_id?.toString() || ''
        }).catch(err => console.error('[AutoEmail] register trigger failed:', err.message));

        res.status(201).json({
            success: true,
            message: "Student registered successfully",
            data: {
                studentId: student.id,
                name: student.name,
                email: student.email,
                school_id: student.school_id,
                class_id: student.class_id
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
    }
};

export const setUserPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        // Decode token — format is base64(email + password)
        const decoded = Buffer.from(token, 'base64').toString('utf-8');

        // Find user by trying all emails in DB that match start of decoded string
        const users = await prisma.user.findMany({ select: { id: true, email: true, password: true } });
        let matchedUser = null;
        let oldPassword = null;

        for (const u of users) {
            if (decoded.startsWith(u.email)) {
                oldPassword = decoded.slice(u.email.length);
                const isMatch = await bcrypt.compare(oldPassword, u.password);
                if (isMatch) {
                    matchedUser = u;
                    break;
                }
            }
        }

        if (!matchedUser) {
            return res.status(400).json({ message: 'Invalid or expired link' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: matchedUser.id },
            data: { password: hashedNewPassword }
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to set password', error: error.message });
    }
};

export const getSidebarMenus = async (req, res) => {
    try {
        const { role } = req.user;

        const menuModules = {
            admin: [
                {
                    module: 'Main',
                    children: [
                        { title: 'Dashboard', path: '/', icon: 'DashboardIcon' },
                    ]
                },
                {
                    module: 'Management',
                    children: [
                        { title: 'Schools', path: '/schools', icon: 'SchoolIcon' },
                        { title: 'System Classes', path: '/all-classes', icon: 'ClassIcon' },
                        { title: 'Class Representatives', path: '/class-reps', icon: 'PeopleIcon' },
                        { title: 'Students Overview', path: '/students', icon: 'PeopleIcon' },
                        { title: 'School Overview', path: '/school-overview', icon: 'PeopleIcon' },
                    ]
                },
                {
                    module: 'Assets',
                    children: [
                        { title: 'Logos / Back Designs', path: '/review-uploads', icon: 'ImageIcon' },
                        { title: 'Countries Logo', path: '/countries-logo', icon: 'ImageIcon' },
                        { title: 'Add Fonts', path: '/fonts', icon: 'FontDownloadIcon' },
                    ]
                },
                {
                    module: 'Orders',
                    children: [
                        { title: 'Orders List', path: '/orders-list', icon: 'ShoppingCartIcon' },
                        { title: 'Production Files', path: '/production-files', icon: 'PrintIcon' },
                    ]
                },
                {
                    module: 'Marketing',
                    children: [
                        { title: 'Email Campaigns', path: '/campaigns', icon: 'EmailIcon' },
                        // { title: 'Automated Email', path: '/automated-emails', icon: 'EmailIcon' },
                    ]
                },
                {
                    module: 'System',
                    children: [
                        { title: 'Settings', path: '/settings', icon: 'SettingsIcon' },
                        { title: 'Støtte', path: '/usersupport', icon: 'SupportAgentIcon' },]
                }
            ],
            class_representative: [
                {
                    module: 'Main',
                    children: [
                        { title: 'Mine Klasser', path: '/my-class', icon: 'GroupIcon' },
                        { title: 'Logo Upload', path: '/upload-files', icon: 'CloudUploadIcon' }, // or "Logo Upload" if you want to keep the English term
                        { title: 'Konfigurator til Bagsidedesign', path: '/back-design-configurator', icon: 'BrushIcon' },
                        { title: 'Studieoversigt', path: '/student-overview', icon: 'PeopleAltIcon' },
                        { title: 'Støtte', path: '/usersupport', icon: 'SupportAgentIcon' },
                    ]
                }

            ]
        };

        menuModules.server_owner = menuModules.admin;

        const menus = menuModules[role] || [];
        res.json({ success: true, menus });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Change password (logged-in user)
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Current and new password are required" });
        }

        const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Current password is incorrect" });

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: parseInt(userId) }, data: { password: hashed } });

        res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Forgot password — send OTP to email
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email is required" });

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ success: false, message: "No account found with this email" });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await prisma.user.update({
            where: { id: user.id },
            data: { reset_otp: otp, reset_otp_expires: expires }
        });

        const { sendEmail } = await import('../utils/emailService.js');
        await sendEmail(email, 'StudentLife – Password Reset Code', `
            <div style="font-family:Arial,sans-serif;padding:20px;max-width:500px;">
                <h2 style="color:#006d75;">Password Reset</h2>
                <p>Hi <strong>${user.name}</strong>,</p>
                <p>Your password reset code is:</p>
                <h1 style="background:#f0f9fa;padding:15px;border-radius:8px;text-align:center;letter-spacing:8px;color:#006d75;">${otp}</h1>
                <p>This code expires in <strong>15 minutes</strong>.</p>
                <p>If you did not request this, ignore this email.</p>
                <hr/>
                <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
            </div>
        `);

        res.json({ success: true, message: "Reset code sent to your email" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Reset password — verify OTP and set new password
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: "email, otp, and newPassword are required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        if (!user.reset_otp || user.reset_otp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        if (!user.reset_otp_expires || new Date() > new Date(user.reset_otp_expires)) {
            return res.status(400).json({ success: false, message: "OTP has expired" });
        }

        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashed, reset_otp: null, reset_otp_expires: null }
        });

        res.json({ success: true, message: "Password reset successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
