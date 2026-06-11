import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";
import { sendLogoUploadNotificationEmail, getAdminNotificationEmails, sendLogoStatusEmail } from "../utils/emailService.js";

export const uploadSchoolLogo = async (req, res) => {
    try {
        const userId = Number(req.user.id);
        const schoolId = Number(req.user.school_id);
        const { name } = req.body;

        if (!schoolId) return res.status(400).json({ success: false, message: "User is not assigned to any school" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const logoName = name || req.file.originalname.replace(/\.[^/.]+$/, "");

        // Duplicate name check within same school
        const existing = await prisma.logo.findFirst({
            where: { school_id: schoolId, name: logoName, status: { not: 2 } }
        });
        if (existing) return res.status(409).json({ success: false, message: `A logo named "${logoName}" already exists for this school` });

        const logo = await prisma.logo.create({
            data: {
                school_id: schoolId,
                name: logoName,
                uploaded_by: userId,
                file_path: req.file.path,
                process_status: 'uploaded',
                status: 1
            }
        });

        // Send notification email to admin(s)
        try {
            // Get school and user info for notification
            const [school, user, adminEmails] = await Promise.all([
                prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
                prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
                getAdminNotificationEmails()
            ]);

            // Send notification to all admins
            const notificationPromises = adminEmails.map(adminEmail =>
                sendLogoUploadNotificationEmail({
                    adminEmail,
                    logoName: logoName,
                    schoolName: school?.name || 'Unknown School',
                    classRepName: user?.name || 'Unknown User',
                    classRepEmail: user?.email || 'Unknown Email',
                    logoId: logo.id
                })
            );

            await Promise.allSettled(notificationPromises);
        } catch (emailError) {
            console.error('Failed to send logo upload notification:', emailError.message);
            // Don't fail the upload if email fails
        }

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

        const logo = await prisma.logo.findUnique({
            where: { id: parseInt(logoId) },
            include: { user: { select: { name: true, email: true } } }
        });

        if (!logo) return res.status(404).json({ success: false, message: "Logo not found" });

        await prisma.logo.update({
            where: { id: parseInt(logoId) },
            data: { process_status: 'approved', status: 0 }
        });

        // Send approval email to uploader
        try {
            await sendLogoStatusEmail({
                email: logo.user.email,
                uploaderName: logo.user.name,
                logoName: logo.name,
                status: 'approved',
                adminComment: null
            });
        } catch (emailErr) {
            console.error('Logo approval email failed:', emailErr.message);
        }

        res.json({ success: true, message: "Logo approved" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const rejectLogo = async (req, res) => {
    try {
        const { logoId } = req.params;
        const { comment, reason } = req.body;
        const adminComment = comment || reason || null;

        const logo = await prisma.logo.findUnique({
            where: { id: parseInt(logoId) },
            include: { user: { select: { name: true, email: true } } }
        });

        if (!logo) return res.status(404).json({ success: false, message: "Logo not found" });

        await prisma.logo.update({
            where: { id: parseInt(logoId) },
            data: { process_status: 'rejected', status: 2, admin_comment: adminComment }
        });

        // Send rejection email to uploader
        try {
            await sendLogoStatusEmail({
                email: logo.user.email,
                uploaderName: logo.user.name,
                logoName: logo.name,
                status: 'rejected',
                adminComment
            });
        } catch (emailErr) {
            console.error('Logo rejection email failed:', emailErr.message);
        }

        res.json({ success: true, message: "Logo rejected" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Class Rep: delete their own logo (soft delete)
export const deleteMyLogo = async (req, res) => {
    try {
        const { logoId } = req.params;
        const schoolId = req.user.school_id;

        const logo = await prisma.logo.findUnique({ where: { id: parseInt(logoId) } });
        if (!logo) return res.status(404).json({ success: false, message: "Logo not found" });
        if (logo.school_id !== schoolId) return res.status(403).json({ success: false, message: "Unauthorized" });

        await prisma.logo.delete({ where: { id: parseInt(logoId) } });
        res.json({ success: true, message: "Logo deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: upload logo directly — auto approved
export const adminUploadLogo = async (req, res) => {
    try {
        const { name, school_id } = req.body;

        if (!school_id) return res.status(400).json({ success: false, message: "school_id is required" });
        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const logoName = name || req.file.originalname.replace(/\.[^/.]+$/, "");

        // Duplicate name check within same school
        const existing = await prisma.logo.findFirst({
            where: { school_id: parseInt(school_id), name: logoName, status: { not: 2 } }
        });
        if (existing) return res.status(409).json({ success: false, message: `A logo named "${logoName}" already exists for this school` });

        const logo = await prisma.logo.create({
            data: {
                school_id: parseInt(school_id),
                name: logoName,
                uploaded_by: req.user.id,
                file_path: req.file.path,
                process_status: 'approved', // admin upload = auto approved
                status: 0
            }
        });

        res.status(201).json({ success: true, message: "Logo uploaded and approved", data: logo });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: upload back design for a class — auto approved
export const adminUploadBackDesign = async (req, res) => {
    try {
        const { name, class_id, country_id, designColor, forAllStudents } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

        const shareWithAll = forAllStudents === 'true' || forAllStudents === true;

        const design = await prisma.backDesign.create({
            data: {
                name: name || req.file.originalname.replace(/\.[^/.]+$/, ""),
                file_path: req.file.path,
                class_id: class_id ? parseInt(class_id) : null,
                country_id: country_id ? parseInt(country_id) : null,
                designColor: designColor || null,
                is_library: shareWithAll || !class_id, // forAllStudents OR no class_id = library
                forAllStudents: shareWithAll,
                process_status: 'approved', // admin upload = auto approved
                status: 0
            }
        });

        res.status(201).json({ success: true, message: "Back design uploaded and approved", data: design });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// Admin: delete any logo (soft delete)
export const adminDeleteLogo = async (req, res) => {
    try {
        const { logoId } = req.params;

        const logo = await prisma.logo.findUnique({
            where: { id: parseInt(logoId) },
            include: { school: { select: { name: true } } }
        });

        if (!logo) {
            return res.status(404).json({ success: false, message: "Logo not found" });
        }

        if (logo.status === 2) {
            return res.status(400).json({ success: false, message: "Logo is already deleted" });
        }

        // Check if logo is being used in any active orders
        const activeOrders = await prisma.order.count({
            where: {
                selected_logo_id: parseInt(logoId),
                status: { not: 2 }
            }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete logo. It is currently used in ${activeOrders} active order(s)`
            });
        }

        await prisma.logo.update({
            where: { id: parseInt(logoId) },
            data: { status: 2 }
        });

        res.json({
            success: true,
            message: `Logo "${logo.name}" from ${logo.school.name} has been deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: permanently delete logo (hard delete with file removal)
export const adminPermanentDeleteLogo = async (req, res) => {
    try {
        const { logoId } = req.params;
        const { confirm } = req.body;

        if (confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: "Please confirm deletion by sending 'confirm: DELETE' in request body"
            });
        }

        const logo = await prisma.logo.findUnique({
            where: { id: parseInt(logoId) },
            include: { school: { select: { name: true } } }
        });

        if (!logo) {
            return res.status(404).json({ success: false, message: "Logo not found" });
        }

        // Check if logo is being used in any orders (including deleted ones)
        const anyOrders = await prisma.order.count({
            where: { selected_logo_id: parseInt(logoId) }
        });

        if (anyOrders > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete logo. It is referenced in ${anyOrders} order(s). Use soft delete instead.`
            });
        }

        // Delete file from filesystem
        try {
            const fs = await import('fs');
            if (fs.existsSync(logo.file_path)) {
                fs.unlinkSync(logo.file_path);
            }
        } catch (fileError) {
            console.warn(`Warning: Could not delete file ${logo.file_path}:`, fileError.message);
        }

        // Delete from database
        await prisma.logo.delete({ where: { id: parseInt(logoId) } });

        res.json({
            success: true,
            message: `Logo "${logo.name}" from ${logo.school.name} has been permanently deleted`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};