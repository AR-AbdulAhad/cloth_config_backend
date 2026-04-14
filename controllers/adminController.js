import prisma from "../config/prisma.js";
import { sendChangeDeadlineEmail } from "../utils/emailService.js";


export const getDashboardStats = async (req, res) => {
    try {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [
            schoolCount, classCount, studentCount, classRepCount,
            logoCount, backDesignCount, ordersCount,
            pendingLogos, pendingDesigns,
            totalRevenue, recentOrders, recentStudents, recentClassReps,
            orderStatusCounts, topSchools
        ] = await Promise.all([
            prisma.school.count({ where: { status: { not: 2 } } }),
            prisma.classes.count({ where: { status: { not: 2 } } }),
            prisma.user.count({ where: { role: 'student', status: { not: 2 } } }),
            prisma.user.count({ where: { role: 'class_representative', status: { not: 2 } } }),
            prisma.logo.count({ where: { status: { not: 2 } } }),
            prisma.backDesign.count({ where: { status: { not: 2 } } }),
            prisma.order.count({ where: { status: { not: 2 } } }),
            prisma.logo.count({ where: { process_status: 'uploaded', status: { not: 2 } } }),
            prisma.backDesign.count({ where: { process_status: 'uploaded', status: { not: 2 } } }),
            prisma.order.aggregate({ where: { status: { not: 2 } }, _sum: { amount_paid: true } }),
            // Recent 5 orders
            prisma.order.findMany({
                where: { status: { not: 2 } },
                orderBy: { created_at: 'desc' },
                take: 5,
                include: {
                    student: { select: { name: true } },
                    class: { select: { name: true } }
                }
            }),
            // Recent 5 student registrations
            prisma.user.findMany({
                where: { role: 'student', status: { not: 2 } },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: { id: true, name: true, email: true, created_at: true, class: { select: { name: true } } }
            }),
            // Recent 5 class rep registrations
            prisma.user.findMany({
                where: { role: 'class_representative', status: { not: 2 } },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: { id: true, name: true, email: true, created_at: true, class: { select: { name: true } } }
            }),
            // Order status distribution
            prisma.order.groupBy({
                by: ['process_status'],
                where: { status: { not: 2 } },
                _count: { id: true }
            }),
            // Top 5 schools by student count
            prisma.school.findMany({
                where: { status: { not: 2 } },
                take: 5,
                select: {
                    id: true, name: true,
                    _count: { select: { users: true } }
                },
                orderBy: { users: { _count: 'desc' } }
            })
        ]);

        // Orders per month (last 6 months)
        const ordersPerMonth = await prisma.order.groupBy({
            by: ['created_at'],
            where: { created_at: { gte: sixMonthsAgo }, status: { not: 2 } },
            _count: { id: true },
            _sum: { amount_paid: true }
        });

        // Group by month
        const monthlyMap = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap[key] = { orders: 0, revenue: 0 };
        }
        ordersPerMonth.forEach(o => {
            const d = new Date(o.created_at);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (monthlyMap[key]) {
                monthlyMap[key].orders += o._count.id;
                monthlyMap[key].revenue += parseFloat(o._sum.amount_paid || 0);
            }
        });

        const monthlyData = Object.entries(monthlyMap).map(([month, data]) => ({ month, ...data }));

        res.json({
            success: true,
            data: {
                // Stats cards
                stats: {
                    schools: schoolCount,
                    classes: classCount,
                    students: studentCount,
                    class_reps: classRepCount,
                    orders: ordersCount,
                    total_revenue: parseFloat(totalRevenue._sum.amount_paid || 0),
                    pending_approvals: pendingLogos + pendingDesigns
                },
                // Pie chart
                order_status_distribution: orderStatusCounts.map(o => ({
                    status: o.process_status,
                    count: o._count.id
                })),
                // Bar + Line chart
                monthly_data: monthlyData,
                // Bar chart
                top_schools: topSchools.map(s => ({
                    name: s.name,
                    student_count: s._count.users
                })),
                // Recent activity
                recent_orders: recentOrders.map(o => ({
                    id: o.id,
                    student: o.student.name,
                    class: o.class.name,
                    amount: parseFloat(o.total_amount || 0),
                    status: o.process_status,
                    time: o.created_at
                })),
                recent_students: recentStudents.map(s => ({
                    id: s.id,
                    name: s.name,
                    email: s.email,
                    class: s.class?.name || '-',
                    time: s.created_at
                })),
                recent_class_reps: recentClassReps.map(cr => ({
                    id: cr.id,
                    name: cr.name,
                    email: cr.email,
                    class: cr.class?.name || '-',
                    time: cr.created_at
                })),
                // Server time in EU (Copenhagen)
                server_time: new Date().toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })
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
