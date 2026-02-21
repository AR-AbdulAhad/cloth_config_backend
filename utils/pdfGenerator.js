import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export const generatePDF = (orderData) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const fileName = `production_order_${Date.now()}.pdf`;
        const filePath = path.join('d:/cloth_configurator/cloth_config_backend/uploads', fileName); // Ensure upload dir exists

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(20).text('Production Order', { align: 'center' });
        doc.moveDown();

        orderData.forEach((order, index) => {
            doc.fontSize(14).text(`Order #${index + 1} - Student: ${order.student_name}`, { underline: true });
            doc.fontSize(10).text(`Email: ${order.student_email}`);
            doc.text(`Class: ${order.class_name}`);
            doc.text(`Product: ${order.product_type}`);
            doc.text(`Color: ${order.color} | Size: ${order.size}`);
            doc.text(`Logo Path: ${order.logo_path || 'None'}`);
            doc.text(`Name List: ${order.name_list || 'N/A'}`);
            doc.moveDown(0.5);
            doc.fontSize(8).text(`Design Config: ${JSON.stringify(order.design_config)}`, { color: 'grey' });
            doc.moveDown();

            // Add a horizontal line
            doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#cccccc').stroke();
            doc.moveDown();
        });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', (err) => reject(err));
    });
};
