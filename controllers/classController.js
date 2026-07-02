import prisma from "../config/prisma.js";
import { handlePrismaError } from "../utils/errorHandler.js";
import { sendStatusEmail } from "../utils/emailService.js";

export const addClass = async (req, res) => {
    try {
        const { school_id, name, graduation_year, change_deadline, class_rep_id } = req.body;
        const newClass = await prisma.classes.create({
            data: {
                name,
                graduation_year: parseInt(graduation_year),
                school_id: parseInt(school_id),
                status: 0,
                change_deadline: change_deadline ? new Date(change_deadline) : null
            }
        });

        if (class_rep_id) {
            await prisma.user.update({
                where: { id: parseInt(class_rep_id) },
                data: { class_id: newClass.id }
            });
        }
        res.status(201).json({ success: true, message: "Class created", data: newClass });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

export const listAllClasses = async (req, res) => {
    try {
        const { school_id, page = 1, limit = 10, search = '', unassigned_only } = req.body;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const where = {
            status: { not: 2 },
            ...(school_id && { school_id: parseInt(school_id) }),
            ...(search && { name: { contains: search } }),
            // Only return classes that have no active class rep assigned
            ...(unassigned_only && {
                users: {
                    none: {
                        role: 'class_representative',
                        status: { not: 2 }
                    }
                }
            })
        };

        const [classes, total] = await Promise.all([
            prisma.classes.findMany({
                where,
                include: { school: true, users: { where: { role: 'class_representative', status: { not: 2 } } } },
                skip, take: limitNum, orderBy: { created_at: 'desc' }
            }),
            prisma.classes.count({ where })
        ]);

        const data = classes.map(c => ({ ...c, is_locked: c.order_locked }));

        res.json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const editClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, graduation_year, change_deadline, status } = req.body;
        const data = {};
        if (name) data.name = name;
        if (graduation_year) data.graduation_year = parseInt(graduation_year);
        if (change_deadline) data.change_deadline = new Date(change_deadline);
        if (status !== undefined) data.status = parseInt(status);

        const updated = await prisma.classes.update({ where: { id: parseInt(id) }, data });
        res.json({ success: true, message: "Class updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const toggleClassStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const existingClass = await prisma.classes.findUnique({ where: { id: parseInt(id) } });
        if (!existingClass) return res.status(404).json({ success: false, message: "Class not found" });

        const newStatus = existingClass.status === 0 ? 1 : 0;
        const updated = await prisma.classes.update({ where: { id: parseInt(id) }, data: { status: newStatus } });
        res.json({ success: true, message: `Class status updated to ${newStatus === 0 ? 'Active' : 'Inactive'}`, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const lockClass = async (req, res) => {
    try {
        const { classId } = req.params;
        await prisma.classes.update({
            where: { id: parseInt(classId) },
            data: { process_status: 'orders_locked', order_locked: true, name_list_locked: true }
        });

        // Send status email to all students in this class
        try {
            const orders = await prisma.order.findMany({
                where: { class_id: parseInt(classId), status: { not: 2 } },
                include: {
                    student: { select: { name: true, email: true } },
                    class: { select: { school: { select: { education_type: true } } } }
                }
            });
            await Promise.allSettled(
                orders.map(order =>
                    sendStatusEmail({
                        email: order.student.email,
                        studentName: order.student.name,
                        orderId: order.id,
                        status: 'production_ready',
                        educationType: order.class?.school?.education_type
                    })
                )
            );
        } catch (emailErr) {
            console.error('Status email failed after lock:', emailErr.message);
        }

        res.json({ success: true, message: "Class locked" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const unlockClass = async (req, res) => {
    try {
        const { classId } = req.params;
        await prisma.classes.update({
            where: { id: parseInt(classId) },
            data: { process_status: 'active', order_locked: false, name_list_locked: false }
        });
        res.json({ success: true, message: "Class unlocked" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listMyClass = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(404).json({ success: false, message: "No class assigned" });

        const classData = await prisma.classes.findFirst({
            where: { id: classId, status: { not: 2 } },
            include: {
                school: true,
                country: true,
                users: {
                    where: { role: 'class_representative' },
                    select: { id: true, name: true, email: true, phone_number: true, role: true, status: true }
                }
            }
        });
        res.json({ success: true, data: [classData] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getAssignedClass = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(404).json({ success: false, message: "No class assigned" });

        const classData = await prisma.classes.findFirst({
            where: { id: parseInt(classId), status: { not: 2 } }
        });
        res.json({ success: true, data: classData });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const assignClassRep = async (req, res) => {
    try {
        const { class_id, class_rep_id } = req.body;
        if (!class_id || !class_rep_id) return res.status(400).json({ success: false, message: "Missing IDs" });

        const targetClass = await prisma.classes.findUnique({ where: { id: parseInt(class_id) }, include: { users: true } });
        if (!targetClass || targetClass.status === 2) return res.status(404).json({ success: false, message: "Class not found" });

        const existingRep = targetClass.users.find(u => u.role === "class_representative" && u.status !== 2);

        const rep = await prisma.user.findUnique({ where: { id: parseInt(class_rep_id) } });
        if (!rep || rep.role !== "class_representative" || rep.status === 2) return res.status(404).json({ success: false, message: "Rep not found" });

        // Check if rep is already assigned to another class
        // if (rep.class_id && rep.class_id !== parseInt(class_id)) {
        //     const assignedClass = await prisma.classes.findUnique({ where: { id: rep.class_id }, select: { name: true } });
        //     return res.status(409).json({
        //         success: false,
        //         message: `This representative is already assigned to class "${assignedClass?.name || rep.class_id}". Unassign them first.`
        //     });
        // }

        // If same rep already assigned, no change needed
        if (existingRep && existingRep.id === rep.id) return res.json({ success: true, message: "Rep already assigned to this class" });

        // Unassign previous rep if different
        if (existingRep && existingRep.id !== rep.id) {
            await prisma.user.update({ where: { id: existingRep.id }, data: { class_id: null } });
        }

        await prisma.user.update({ where: { id: parseInt(class_rep_id) }, data: { class_id: targetClass.id } });
        res.json({ success: true, message: "Rep assigned successfully" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const removeClass = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.classes.update({
            where: { id: parseInt(id) },
            data: { status: 2 }
        });
        res.json({ success: true, message: "Class deleted" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin updates class process_status → auto-sends status email to all students
export const updateClassProcessStatus = async (req, res) => {
    try {
        const { classId } = req.params;
        const { process_status, trackingCode } = req.body;

        const validStatuses = ['active', 'orders_locked', 'production_ready', 'shipped', 'completed'];
        if (!validStatuses.includes(process_status)) {
            return res.status(400).json({ success: false, message: `Invalid status. Valid: ${validStatuses.join(', ')}` });
        }

        await prisma.classes.update({
            where: { id: parseInt(classId) },
            data: { process_status }
        });

        // Email trigger for statuses that students care about
        const emailStatuses = ['production_ready', 'shipped', 'completed'];
        if (emailStatuses.includes(process_status)) {
            try {
                const orders = await prisma.order.findMany({
                    where: { class_id: parseInt(classId), status: { not: 2 } },
                    include: {
                        student: { select: { name: true, email: true } },
                        class: { select: { school: { select: { education_type: true } } } }
                    }
                });

                await Promise.allSettled(
                    orders.map(order =>
                        sendStatusEmail({
                            email: order.student.email,
                            studentName: order.student.name,
                            orderId: order.id,
                            status: process_status,
                            trackingCode: trackingCode || null,
                            educationType: order.class?.school?.education_type
                        })
                    )
                );
            } catch (emailErr) {
                console.error('Status email failed:', emailErr.message);
            }
        }

        res.json({ success: true, message: `Class status updated to ${process_status}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
// Set expected student count for a class (Admin or Class Rep)
export const setExpectedStudentCount = async (req, res) => {
    try {
        const { classId } = req.params;
        const { expected_students } = req.body;

        if (!expected_students || expected_students < 0) {
            return res.status(400).json({
                success: false,
                message: "Expected student count must be a positive number"
            });
        }

        // Check if user has permission to update this class
        const userRole = req.user.role;
        const userId = req.user.id;

        if (userRole === 'class_representative') {
            // Class rep can only update their assigned class
            if (req.user.class_id !== parseInt(classId)) {
                return res.status(403).json({
                    success: false,
                    message: "You can only update your assigned class"
                });
            }
        } else if (userRole !== 'admin' && userRole !== 'server_owner') {
            return res.status(403).json({
                success: false,
                message: "Insufficient permissions"
            });
        }

        // Check if the expected_students field exists in the database
        try {
            const updatedClass = await prisma.classes.update({
                where: { id: parseInt(classId) },
                data: { expected_students: parseInt(expected_students) }
            });

            res.json({
                success: true,
                message: "Expected student count updated successfully",
                data: {
                    class_id: updatedClass.id,
                    expected_students: updatedClass.expected_students
                }
            });
        } catch (updateErr) {
            // If the field doesn't exist, return a helpful message
            if (updateErr.message.includes('expected_students')) {
                return res.status(400).json({
                    success: false,
                    message: "Database migration required. Run 'npx prisma db push' to add expected_students field.",
                    migration_required: true
                });
            }
            throw updateErr;
        }
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};

// Get student count information for a class
export const getStudentCount = async (req, res) => {
    try {
        const { classId } = req.params;

        // Check if user has permission to view this class
        const userRole = req.user.role;

        if (userRole === 'class_representative') {
            // Class rep can only view their assigned class
            if (req.user.class_id !== parseInt(classId)) {
                return res.status(403).json({
                    success: false,
                    message: "You can only view your assigned class"
                });
            }
        } else if (userRole !== 'admin' && userRole !== 'server_owner') {
            return res.status(403).json({
                success: false,
                message: "Insufficient permissions"
            });
        }

        // Get class info with expected students
        const classInfo = await prisma.classes.findUnique({
            where: { id: parseInt(classId) },
            select: {
                id: true,
                name: true,
                expected_students: true,
                graduation_year: true
            }
        });

        if (!classInfo) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        // Count registered students in this class
        const registeredCount = await prisma.user.count({
            where: {
                class_id: parseInt(classId),
                role: 'student',
                status: { not: 2 } // Exclude deleted users
            }
        });

        // Count students with orders
        const studentsWithOrders = await prisma.order.count({
            where: {
                class_id: parseInt(classId),
                status: { not: 2 } // Exclude deleted orders
            },
            distinct: ['student_id']
        });

        res.json({
            success: true,
            data: {
                class_id: classInfo.id,
                class_name: classInfo.name,
                graduation_year: classInfo.graduation_year,
                expected_students: classInfo.expected_students || 0,
                registered_students: registeredCount,
                students_with_orders: studentsWithOrders,
                completion_percentage: classInfo.expected_students > 0 
                    ? Math.round((registeredCount / classInfo.expected_students) * 100) 
                    : 0
            }
        });
    } catch (err) {
        const error = handlePrismaError(err);
        res.status(error.status).json({ success: false, error: error.message });
    }
};