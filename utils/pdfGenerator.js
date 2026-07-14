import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { toFullUrl, buildDesignText, formatAddress } from './productionReportHelpers.js';

const BLACK = '#1a1a1a';
const GRAY = '#666666';
const LIGHT_GRAY = '#999999';
const BORDER = '#dddddd';
const BG = '#f7f7f7';

const LOGO_IMAGE_PATH = path.join(process.cwd(), 'assets', 'studentlife-logo.png');

// orderData is a flat list of one row per garment. Rows belonging to the same
// student (possibly from several of their orders — e.g. extra garments added
// during the post-payment edit window) are grouped into a single section here,
// so each student appears once with all of their garments listed underneath.
export const generatePDF = (orderData) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const fileName = `production_order_${Date.now()}.pdf`;
        const uploadsDir = path.join(process.cwd(), 'uploads', 'production_files');
        const filePath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // ── Header ──────────────────────────────────────────
        if (fs.existsSync(LOGO_IMAGE_PATH)) {
            doc.image(LOGO_IMAGE_PATH, 50, 45, { width: 110 });
        } else {
            doc.fillColor(BLACK).fontSize(22).font('Helvetica-Bold').text('StudentLife', 50, 50);
        }

        doc.fillColor(GRAY).fontSize(9).font('Helvetica')
            .text('Production Order Report', 50, 100);
        doc.fillColor(GRAY).fontSize(9)
            .text(`Generated: ${new Date().toLocaleString('da-DK')}`, 0, 50, { align: 'right' });

        doc.moveTo(50, 130).lineTo(doc.page.width - 50, 130).strokeColor(BORDER).lineWidth(1).stroke();
        doc.y = 145;

        // ── Group flat garment rows by student ───────────────
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
                    name_list: row.name_list,
                    delivery_details: row.delivery_details,
                    items: []
                });
            }
            students[idx].items.push(row);
        });

        // ── Summary bar ─────────────────────────────────────
        if (students.length > 0) {
            const className = students[0].class_name;
            doc.rect(50, doc.y, doc.page.width - 100, 26).fill(BG);
            doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold')
                .text(`Class: ${className}    |    Total Students: ${students.length}`, 60, doc.y - 19);
            doc.y += 16;
        }

        const col1 = 60;
        const col2 = 310;
        const colWidth = 225;

        const drawField = (label, value, x, y) => {
            doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(label, x, y);
            doc.fillColor(BLACK).fontSize(9).font('Helvetica')
                .text(value || 'N/A', x, y + 11, { width: colWidth });
        };

        // ── Students ──────────────────────────────────────────
        students.forEach((student, index) => {
            if (doc.y > doc.page.height - 220) doc.addPage();

            const startY = doc.y;

            doc.fillColor(BLACK).fontSize(12).font('Helvetica-Bold')
                .text(`${index + 1}. ${student.student_name}`, col1, startY);
            doc.moveTo(50, startY + 18).lineTo(doc.page.width - 50, startY + 18)
                .strokeColor(BORDER).lineWidth(1).stroke();

            const infoY = startY + 28;
            drawField('EMAIL', student.student_email, col1, infoY);
            drawField('CLASS', student.class_name, col2, infoY);
            drawField('DELIVERY ADDRESS', formatAddress(student.delivery_details), col1, infoY + 32);
            drawField('LOGO', toFullUrl(student.logo_path), col2, infoY + 32);

            let y = infoY + 68;
            doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold')
                .text(`GARMENTS (${student.items.length})`, col1, y);
            doc.y = y + 14;

            student.items.forEach((item, i) => {
                if (doc.y > doc.page.height - 100) doc.addPage();

                doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold')
                    .text(`${i + 1}. ${item.product_type}`, col1, doc.y, { continued: true })
                    .font('Helvetica')
                    .text(`   Color: ${item.color || 'N/A'}   Size: ${item.size || 'N/A'}`);

                doc.fillColor(GRAY).fontSize(8).font('Helvetica')
                    .text(buildDesignText(item.design_config), col1 + 12, doc.y, { width: doc.page.width - col1 - 12 - 50 });

                doc.moveDown(0.4);
            });

            doc.moveDown(0.8);
        });

        // ── Footer ──────────────────────────────────────────
        doc.fillColor(LIGHT_GRAY).fontSize(8).font('Helvetica')
            .text('StudentLife – studentlife.dk  |  Confidential – For Printer Use Only',
                50, doc.page.height - 40, { align: 'center', width: doc.page.width - 100 });

        doc.end();
        stream.on('finish', () => resolve(`uploads/production_files/${fileName}`));
        stream.on('error', (err) => reject(err));
    });
};
