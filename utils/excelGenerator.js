import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export const generateExcel = (orderData) => {
    return new Promise(async (resolve, reject) => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Production Orders');

        sheet.columns = [
            { header: 'Student Name', key: 'student_name', width: 25 },
            { header: 'Student Email', key: 'student_email', width: 25 },
            { header: 'Class', key: 'class_name', width: 20 },
            { header: 'Product', key: 'product_type', width: 20 },
            { header: 'Color', key: 'color', width: 15 },
            { header: 'Size', key: 'size', width: 10 },
            { header: 'Logo Path', key: 'logo_path', width: 40 },
            { header: 'Name List', key: 'name_list', width: 50 },
            { header: 'Design Config', key: 'design_config', width: 60 }
        ];

        orderData.forEach(order => {
            sheet.addRow({
                student_name: order.student_name,
                student_email: order.student_email,
                class_name: order.class_name,
                product_type: order.product_type,
                color: order.color,
                size: order.size,
                logo_path: order.logo_path || 'N/A',
                name_list: order.name_list || 'N/A',
                design_config: JSON.stringify(order.design_config)
            });
        });

        const fileName = `production_orders_${Date.now()}.xlsx`;
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const filePath = path.join(uploadsDir, fileName);

        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        try {
            await workbook.xlsx.writeFile(filePath);
            resolve(filePath);
        } catch (err) {
            reject(err);
        }
    });
};
