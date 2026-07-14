import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { toFullUrl, buildDesignText, formatAddress } from './productionReportHelpers.js';

const HEADER_FILL = 'FFF0F0F0';
const HEADER_TEXT = 'FF1A1A1A';
const BORDER_COLOR = 'FFDDDDDD';
const LOGO_IMAGE_PATH = path.join(process.cwd(), 'assets', 'studentlife-logo.png');

// orderData is a flat list of one row per garment. Rows belonging to the same
// student (possibly from several of their orders — e.g. extra garments added
// during the post-payment edit window) are grouped into a single spreadsheet
// row here, so each student appears once with all of their garments listed
// inside that row instead of one row per garment.
const groupByStudent = (orderData) => {
    const students = [];
    const indexByEmail = new Map();
    orderData.forEach(row => {
        const key = row.student_email || row.student_name;
        let idx = indexByEmail.get(key);
        if (idx === undefined) {
            idx = students.length;
            indexByEmail.set(key, idx);
            students.push({
                student_name: row.student_name,
                student_email: row.student_email,
                class_name: row.class_name,
                logo_path: row.logo_path,
                delivery_details: row.delivery_details,
                items: []
            });
        }
        students[idx].items.push(row);
    });
    return students;
};

export const generateExcel = (orderData) => {
    return new Promise(async (resolve, reject) => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Production Orders', {
            views: [{ state: 'frozen', ySplit: 5 }]
        });

        // ── Branding header ───────────────────────────────────
        sheet.mergeCells('A1:C3');
        if (fs.existsSync(LOGO_IMAGE_PATH)) {
            const imageId = workbook.addImage({ filename: LOGO_IMAGE_PATH, extension: 'png' });
            sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 53 } });
        } else {
            sheet.getCell('A1').value = 'StudentLife';
            sheet.getCell('A1').font = { bold: true, size: 16 };
        }
        sheet.getCell('F1').value = 'Production Order Report';
        sheet.getCell('F1').font = { size: 11, color: { argb: 'FF666666' } };
        sheet.getCell('F2').value = `Generated: ${new Date().toLocaleString('da-DK')}`;
        sheet.getCell('F2').font = { size: 9, color: { argb: 'FF999999' } };

        // ── Table header ──────────────────────────────────────
        const headerRow = sheet.getRow(5);
        headerRow.values = [
            'Student Name', 'Student Email', 'Class', 'Delivery Address',
            'Garments', 'Logo URL', 'Design Details'
        ];
        headerRow.eachCell(cell => {
            cell.font = { bold: true, color: { argb: HEADER_TEXT } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
            cell.border = {
                top: { style: 'thin', color: { argb: BORDER_COLOR } },
                bottom: { style: 'thin', color: { argb: BORDER_COLOR } }
            };
        });

        sheet.columns = [
            { key: 'student_name', width: 25 },
            { key: 'student_email', width: 28 },
            { key: 'class_name', width: 15 },
            { key: 'delivery_address', width: 40 },
            { key: 'garments', width: 45 },
            { key: 'logo_url', width: 45 },
            { key: 'design_details', width: 55 }
        ];

        const students = groupByStudent(orderData);

        students.forEach(student => {
            const garmentsText = student.items
                .map((item, i) => `${i + 1}. ${item.product_type} — Color: ${item.color || 'N/A'}, Size: ${item.size || 'N/A'}`)
                .join('\n');
            const designText = student.items
                .map((item, i) => `${i + 1}. ${buildDesignText(item.design_config)}`)
                .join('\n');

            const row = sheet.addRow({
                student_name: student.student_name,
                student_email: student.student_email,
                class_name: student.class_name,
                delivery_address: formatAddress(student.delivery_details) || 'N/A',
                garments: garmentsText,
                logo_url: toFullUrl(student.logo_path) || 'N/A',
                design_details: designText
            });

            row.eachCell(cell => {
                cell.alignment = { wrapText: true, vertical: 'top' };
                cell.border = { bottom: { style: 'thin', color: { argb: BORDER_COLOR } } };
            });
            row.height = Math.max(20, student.items.length * 15);
        });

        const fileName = `production_orders_${Date.now()}.xlsx`;
        const uploadsDir = path.join(process.cwd(), 'uploads', 'production_files');
        const filePath = path.join(uploadsDir, fileName);

        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        try {
            await workbook.xlsx.writeFile(filePath);
            resolve(`uploads/production_files/${fileName}`);
        } catch (err) {
            reject(err);
        }
    });
};
