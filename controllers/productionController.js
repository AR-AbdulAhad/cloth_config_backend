import prisma from "../config/prisma.js";
import { generatePDF } from "../utils/pdfGenerator.js";
import { generateExcel } from "../utils/excelGenerator.js";
import { sendStatusEmail, sendFollowUpEmail } from "../utils/emailService.js";

// ─────────────────────────────────────────────
// Generate production files for a single order
// POST /api/admin/generate-files/order/:orderId
// ─────────────────────────────────────────────
export const generateOrderProductionFiles = async (req, res) => {
    const orderId = parseInt(req.params.orderId);
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                student: { select: { name: true, email: true } },
                class:   { select: { id: true, name: true } },
                logo:    { select: { file_path: true } },
                order_items: { where: { status: { not: 2 } } }
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.order_items.length === 0) {
            return res.status(400).json({ success: false, message: "Order has no items" });
        }

        // Name list for this class
        const nameList = await prisma.nameList.findFirst({
            where: { class_id: order.class.id },
            include: { items: { orderBy: { position: 'asc' } } }
        });

        // Build rows — one row per order item
        const results = order.order_items.map(item => ({
            class_name:    order.class.name,
            student_name:  order.student.name,
            student_email: order.student.email,
            product_type:  item.product_type,
            color:         item.selectedColor,
            size:          item.selectedSize,
            design_config: item.design_config,
            logo_path:     order.logo?.file_path || null,
            name_list:     nameList?.items.map(ni => ni.name).join(', ') || null
        }));

        // Create package record
        const pkg = await prisma.productionPackage.create({
            data: {
                class_id:         order.class.id,
                package_name:     `Order_${orderId}_${order.student.name}_${Date.now()}`,
                production_status: "processing"
            }
        });

        // Generate PDF + Excel in parallel
        const [pdfPath, excelPath] = await Promise.all([
            generatePDF(results),
            generateExcel(results)
        ]);

        await prisma.productionPackage.update({
            where: { id: pkg.id },
            data: {
                pdf_file_path:    pdfPath,
                excel_file_path:  excelPath,
                production_status: "ready"
            }
        });

        res.json({
            success: true,
            message: "Production files generated for order",
            data: {
                packageId: pkg.id,
                orderId,
                student:   order.student.name,
                pdf:       pdfPath,
                excel:     excelPath
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const generateProductionFiles = async (req, res) => {
    const classId = parseInt(req.params.classId);
    try {
        const orders = await prisma.order.findMany({
            where: { class_id: classId, status: { not: 2 } },
            include: {
                student: { select: { name: true, email: true } },
                class: { select: { name: true } },
                logo: { select: { file_path: true } },
                order_items: { where: { status: { not: 2 } } }
            }
        });

        const nameList = await prisma.nameList.findFirst({
            where: { class_id: classId },
            include: { items: { orderBy: { position: 'asc' } } }
        });

        if (orders.length === 0) return res.status(404).json({ success: false, message: "No orders found" });

        const results = [];
        orders.forEach(order => {
            order.order_items.forEach(item => {
                results.push({
                    class_name: order.class.name,
                    student_name: order.student.name,
                    student_email: order.student.email,
                    product_type: item.product_type,
                    color: item.selectedColor,
                    size: item.selectedSize,
                    design_config: item.design_config,
                    logo_path: order.logo?.file_path || null,
                    name_list: nameList?.items.map(ni => ni.name).join(', ') || null
                });
            });
        });

        const productionPackage = await prisma.productionPackage.create({
            data: { class_id: classId, package_name: `Production_${orders[0].class.name}_${Date.now()}`, production_status: "processing" }
        });

        const pdfPath = await generatePDF(results);
        const excelPath = await generateExcel(results);

        await prisma.productionPackage.update({
            where: { id: productionPackage.id },
            data: { pdf_file_path: pdfPath, excel_file_path: excelPath, production_status: "ready" }
        });

        res.json({ success: true, message: "Production files ready", data: { packageId: productionPackage.id, pdf: pdfPath, excel: excelPath } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listProductionPackages = async (req, res) => {
    try {
        const { class_id, page = 1, limit = 10 } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = { ...(class_id && { class_id: parseInt(class_id) }) };
        const [packages, total] = await Promise.all([
            prisma.productionPackage.findMany({ where, include: { class: { select: { name: true } } }, skip, take: limitNum, orderBy: { generated_at: 'desc' } }),
            prisma.productionPackage.count({ where })
        ]);

        res.json({ success: true, data: packages, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Send status email (production_ready / shipped / completed) to all students in a class
export const sendClassStatusEmail = async (req, res) => {
    try {
        const classId = parseInt(req.params.classId);
        const { status, trackingCode } = req.body || {};

        const validStatuses = ['production_ready', 'shipped', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        const orders = await prisma.order.findMany({
            where: { class_id: classId, status: { not: 2 } },
            include: {
                student: { select: { name: true, email: true } },
                class: { select: { school: { select: { education_type: true } } } }
            }
        });

        if (!orders.length) {
            return res.status(404).json({ success: false, message: "No orders found for this class" });
        }

        const results = await Promise.allSettled(
            orders.map(order =>
                sendStatusEmail({
                    email: order.student.email,
                    studentName: order.student.name,
                    orderId: order.id,
                    status,
                    trackingCode,
                    educationType: order.class?.school?.education_type
                })
            )
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        res.json({ success: true, message: `Status emails sent to ${sent}/${orders.length} students` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Send follow-up email (care instructions + graduation caps) to all students in a class
export const sendFollowUpToClass = async (req, res) => {
    try {
        const classId = parseInt(req.params.classId);

        const students = await prisma.user.findMany({
            where: { class_id: classId, role: 'student', status: { not: 2 } },
            select: {
                name: true,
                email: true,
                class: { select: { school: { select: { education_type: true } } } }
            }
        });

        if (!students.length) {
            return res.status(404).json({ success: false, message: "No students found for this class" });
        }

        const results = await Promise.allSettled(
            students.map(student =>
                sendFollowUpEmail({
                    email: student.email,
                    studentName: student.name,
                    educationType: student.class?.school?.education_type
                })
            )
        );

        const sent = results.filter(r => r.status === 'fulfilled').length;
        res.json({ success: true, message: `Follow-up emails sent to ${sent}/${students.length} students` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
