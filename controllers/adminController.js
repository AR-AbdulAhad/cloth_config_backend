import prisma from "../config/prisma.js";
import { sendChangeDeadlineEmail } from "../utils/emailService.js";


export const getDashboardStats = async (req, res) => {
    try {
        const schoolCount = await prisma.school.count();
        const classCount = await prisma.classes.count();
        const userCount = await prisma.user.count();
        const logoCount = await prisma.logo.count();
        const backDesignCount = await prisma.backDesign.count();
        const ordersCount = await prisma.order.count();
        res.json({
            success: true,
            data: {
                schoolCount,
                classCount,
                userCount,
                logoCount,
                backDesignCount,
                ordersCount
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const toggleEntityStatus = async (req, res) => {
    try {
        const { entityType, id } = req.params;
        const { status } = req.body;

        if (status !== 0 && status !== 1) {
            return res.status(400).json({ success: false, message: "Invalid status. Use 0 or 1." });
        }

        const modelMap = {
            'school': prisma.school,
            'class': prisma.classes,
            'user': prisma.user,
            'class-rep': prisma.user,
            'student': prisma.user,
            'logo': prisma.logo,
            'back-design': prisma.backDesign,
            'name-list': prisma.nameList,
            'order': prisma.order,
            'order-item': prisma.orderItem,
            'production-package': prisma.productionPackage
        };

        const model = modelMap[entityType.toLowerCase()];
        if (!model) return res.status(400).json({ success: false, message: "Invalid entity type." });

        const updated = await model.update({
            where: { id: parseInt(id) },
            data: { status: parseInt(status) }
        });

        res.json({ success: true, message: `${entityType} status updated`, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Send change deadline reminder to all students in a class
export const sendDeadlineReminder = async (req, res) => {
    try {
        const classId = parseInt(req.params.classId);

        const classData = await prisma.classes.findUnique({
            where: { id: classId },
            select: { change_deadline: true, school: { select: { education_type: true } } }
        });

        if (!classData) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const orders = await prisma.order.findMany({
            where: { class_id: classId, status: { not: 2 } },
            include: { student: { select: { name: true, email: true } } }
        });

        if (!orders.length) {
            return res.status(404).json({ success: false, message: "No orders found for this class" });
        }

        const results = await Promise.allSettled(
            orders.map(order =>
                sendChangeDeadlineEmail({
                    email: order.student.email,
                    studentName: order.student.name,
                    orderId: order.id,
                    changeDeadline: classData.change_deadline,
                    educationType: classData.school?.education_type
                })
            )
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        res.json({ success: true, message: `Deadline reminder sent to ${sent}/${orders.length} students` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Test email connection
export const testEmail = async (req, res) => {
    try {
        const { to } = req.body;
        if (!to) return res.status(400).json({ success: false, message: "to email required" });

        const { sendEmail } = await import("../utils/emailService.js");
        await sendEmail(to, "StudentLife – Email Test", `<h2>Email is working!</h2><p>Sent at ${new Date().toISOString()}</p>`);
        res.json({ success: true, message: `Test email sent to ${to}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Admin: get all students in a class with full details
export const getClassStudents = async (req, res) => {
    try {
        const { classId } = req.params;
        const { page = 1, limit = 10, search = '' } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            class_id: parseInt(classId),
            role: 'student',
            status: { not: 2 },
            ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] })
        };

        const [students, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone_number: true,
                    year_of_birth: true,
                    consent_marketing: true,
                    consent_production: true,
                    status: true,
                    created_at: true,
                    orders: {
                        where: { status: { not: 2 } },
                        select: { id: true, process_status: true, total_amount: true, payment_status: true },
                        take: 1,
                        orderBy: { created_at: 'desc' }
                    }
                },
                skip,
                take: limitNum,
                orderBy: { name: 'asc' }
            }),
            prisma.user.count({ where })
        ]);

        const data = students.map(s => ({
            ...s,
            order_status: s.orders[0]?.process_status || 'no_order',
            orders: undefined
        }));

        res.json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get class rep details by class ID
export const getClassRep = async (req, res) => {
    try {
        const { classId } = req.params;
        const rep = await prisma.user.findFirst({
            where: { class_id: parseInt(classId), role: 'class_representative', status: { not: 2 } },
            select: { id: true, name: true, email: true, phone_number: true, school_id: true, created_at: true }
        });
        if (!rep) return res.status(404).json({ success: false, message: "No class rep assigned to this class" });
        res.json({ success: true, data: rep });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
