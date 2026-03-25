import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";

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

        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const data = JSON.parse(decoded);

        res.json({
            success: true,
            data
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: "Invalid token",
            error: err.message
        });
    }
};

// Student Self-Registration
export const register = async (req, res) => {
    try {
        const { name, email, password, school_id, class_id, year_of_birth } = req.body;

        // Validation
        if (!name || !email || !password || !school_id || !class_id) {
            return res.status(400).json({
                success: false,
                message: "Name, email, password, school_id, and class_id are required"
            });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create student
        const student = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                school_id: parseInt(school_id),
                class_id: parseInt(class_id),
                year_of_birth: year_of_birth || null,
                role: "student",
                status: 0 // Active by default
            }
        });

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

        // Decode token (email + oldPassword)
        const decoded = atob(token);
        const email = decoded.slice(0, decoded.indexOf('@gmail.com') + 10); // extract email
        const oldPassword = decoded.replace(email, ''); // remaining is password

        // Find user by email
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Compare old password with hashed password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid or expired link' });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await prisma.user.update({
            where: { id: user.id },
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
        let menus = [];

        const dashboardMenu = { title: 'Dashboard', path: '/', icon: 'DashboardIcon' };

        if (role === 'admin' || role === 'server_owner') {
            menus = [
                dashboardMenu,
                { title: 'Schools', path: 'schools', icon: 'SchoolIcon' },
                { title: 'Class Representatives', path: 'class-reps', icon: 'PeopleIcon' },
                { title: 'System Classes', path: 'all-classes', icon: 'ClassIcon' },
                { title: 'Logos / Back Designs', path: 'review-uploads', icon: 'ImageIcon' },
                { title: 'Name List', path: '/name-list', icon: 'FormatListBulletedIcon' },
                { title: 'Orders List', path: '/orders-list', icon: 'FolderZipIcon' },
            ];
        } else if (role === 'class_representative') {
            menus = [
                { title: 'My Classes', path: '/my-class', icon: 'GroupIcon' },
                { title: 'Logo Upload', path: '/upload-files', icon: 'CloudUploadIcon' },
                { title: 'Back Design Configurator', path: '/back-design-configurator', icon: 'CloudUploadIcon' },
                { title: 'Name List', path: '/namelist', icon: 'FormatListBulletedIcon' },
                { title: 'Orders List', path: '/orders-list', icon: 'FolderZipIcon' },
                { title: 'Student Overview', path: '/student-overview', icon: 'FolderZipIcon' },
                { title: 'Orders List', path: '/orders-list', icon: 'FolderZipIcon' },
            ];
        } else if (role === 'student') {
            menus = [
                { title: 'Cloth Configurator', path: '/configurator', icon: 'AppRegistrationIcon' },
                { title: 'Select Logo', path: '/select-logo', icon: 'WallpaperIcon' },
                { title: 'My Order', path: '/my-order', icon: 'ShoppingCartIcon' },
                { title: 'Profile', path: '/profile', icon: 'AccountCircleIcon' },
            ];
        }

        res.json({
            success: true,
            menus
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
