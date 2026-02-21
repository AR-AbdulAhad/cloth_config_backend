import prisma from "../config/prisma.js";
import { generatePDF } from "../utils/pdfGenerator.js";
import { generateExcel } from "../utils/excelGenerator.js";

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
        const { class_id, page = 1, limit = 10 } = req.body;
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
