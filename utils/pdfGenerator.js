import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const PRIMARY = '#006d75';
const LIGHT_BG = '#f0f9fa';
const GRAY = '#666666';
const DARK = '#1a1a1a';
const DIVIDER = '#d0e8ea';

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
        doc.rect(0, 0, doc.page.width, 70).fill(PRIMARY);
        doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold')
            .text('StudentLife', 50, 20);
        doc.fontSize(11).font('Helvetica')
            .text('Production Order Report', 50, 48);

        // Generated date
        doc.fontSize(9).fillColor('#cce8ea')
            .text(`Generated: ${new Date().toLocaleString('da-DK')}`, 0, 52, { align: 'right' });

        doc.moveDown(3);

        // ── Summary bar ─────────────────────────────────────
        if (orderData.length > 0) {
            const className = orderData[0].class_name;
            doc.rect(50, doc.y, doc.page.width - 100, 30).fill(LIGHT_BG);
            doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold')
                .text(`Class: ${className}   |   Total Orders: ${orderData.length}`, 60, doc.y - 22);
            doc.moveDown(1.5);
        }

        // ── Orders ──────────────────────────────────────────
        orderData.forEach((order, index) => {
            // Check page space
            if (doc.y > doc.page.height - 200) doc.addPage();

            const startY = doc.y;

            // Order header band
            doc.rect(50, startY, doc.page.width - 100, 24).fill(PRIMARY);
            doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
                .text(`Order #${index + 1}  —  ${order.student_name}`, 60, startY + 6);

            doc.moveDown(0.2);

            // Info rows
            const infoY = doc.y + 8;
            const col1 = 60;
            const col2 = 300;

            const drawRow = (label, value, x, y) => {
                doc.fillColor(GRAY).fontSize(8).font('Helvetica-Bold').text(label, x, y);
                doc.fillColor(DARK).fontSize(9).font('Helvetica').text(value || 'N/A', x, y + 11);
            };

            drawRow('EMAIL', order.student_email, col1, infoY);
            drawRow('CLASS', order.class_name, col2, infoY);
            drawRow('PRODUCT', order.product_type, col1, infoY + 30);
            drawRow('COLOR', order.color, col2, infoY + 30);
            drawRow('SIZE', order.size, col1, infoY + 60);
            drawRow('LOGO', order.logo_path ? path.basename(order.logo_path) : 'None', col2, infoY + 60);
            drawRow('NAME LIST', order.name_list || 'N/A', col1, infoY + 90);

            // Design config — only non-empty fields
            const config = order.design_config || {};
            const designLines = [];
            const labelMap = {
                rightChestText: 'Right Chest Text', leftChestText: 'Left Chest Text',
                rightSleeveText: 'Right Sleeve Text', leftSleeveText: 'Left Sleeve Text',
                rightChestFlag: 'Right Chest Flag', leftChestFlag: 'Left Chest Flag',
            };
            Object.entries(labelMap).forEach(([key, label]) => {
                if (config[key]) designLines.push(`${label}: ${config[key]}`);
            });
            if (config.backDesign?.src) {
                designLines.push(`Back Design: ${path.basename(config.backDesign.src)}`);
            }

            const designText = designLines.length > 0 ? designLines.join('  |  ') : 'No custom design config';
            drawRow('DESIGN CONFIG', designText, col1, infoY + 120);

            doc.moveDown(0.5);
            const afterY = infoY + 155;

            // Bottom divider
            doc.moveTo(50, afterY).lineTo(doc.page.width - 50, afterY)
                .strokeColor(DIVIDER).lineWidth(1).stroke();

            doc.y = afterY + 10;
        });

        // ── Footer ──────────────────────────────────────────
        const footerY = doc.page.height - 40;
        doc.rect(0, footerY, doc.page.width, 40).fill(PRIMARY);
        doc.fillColor('#ffffff').fontSize(8).font('Helvetica')
            .text('StudentLife – studentlife.dk  |  Confidential – For Printer Use Only',
                50, footerY + 14, { align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(`uploads/production_files/${fileName}`));
        stream.on('error', (err) => reject(err));
    });
};
