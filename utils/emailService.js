import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465, // true only for 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
});

export const sendEmail = async (to, subject, html, fromAddress = null) => {
    try {
        // Use no-reply address as default sender for clothing-related emails
        const senderEmail = process.env.SMTP_USER; // Gmail authenticated account
        const noReplyEmail = process.env.SMTP_NOREPLY || 'noreply@studentlife.dk';
        
        // For notification emails, use noreply as display name
        const isNotificationEmail = subject.includes('New Logo Upload') || subject.includes('New Back Design Upload');
        const displayName = isNotificationEmail ? 'StudentLife Notifications' : 'StudentLife';
        const displayEmail = isNotificationEmail ? noReplyEmail : senderEmail;

        const mailOptions = {
            from: `"${displayName}" <${noReplyEmail}>`, // Gmail requires authenticated email
            to,
            subject,
            text: "Please view this email in HTML format.",
            html,
            replyTo: `"StudentLife No-Reply" <${noReplyEmail}>`,
            // Add custom headers to show noreply in some email clients
            headers: {
                'X-Original-Sender': noReplyEmail,
                'X-Sender': noReplyEmail
            }
        };

        // Debug: Log email content
        console.log('=== SENDMAIL DEBUG ===');
        console.log('To:', to);
        console.log('Subject:', subject);
        console.log('From:', mailOptions.from);
        console.log('Reply-To:', mailOptions.replyTo);
        console.log('Is Notification:', isNotificationEmail);
        console.log('HTML type:', typeof html);
        console.log('HTML length:', html?.length);
        console.log('HTML preview:', html?.substring(0, 300));
        console.log('Contains img tags:', html?.includes('<img'));
        console.log('Contains escaped HTML:', html?.includes('&lt;'));
        console.log('=====================');

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId, "Reply-To:", mailOptions.replyTo || "None");
        return info;
    } catch (error) {
        console.error("Email send failed:", error.message, "| To:", to, "| Subject:", subject);
        // Don't throw — email failure should not break the main flow
    }
};

// Efterskole-specific extra content
const getEducationExtra = (educationType) => {
    if (educationType === 'Efterskole') {
        return `<p style="color:#555;">As an Efterskole student, your garment celebrates a unique journey. Welcome to the StudentLife family!</p>`;
    }
    return '';
};

// ─────────────────────────────────────────────
// EMAIL 1: Order Confirmation
// Trigger: after order is placed/saved
// ─────────────────────────────────────────────
export const sendOrderConfirmationEmail = async ({ email, studentName, orderId, garments, logoPath, changeDeadline, educationType }) => {
    const garmentRows = (garments || []).map(g => `
        <tr>
            <td style="padding:8px;border:1px solid #ddd;">${g.product_type || '-'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${g.selectedColor || '-'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${g.selectedSize || '-'}</td>
        </tr>
    `).join('');

    const deadline = changeDeadline ? new Date(changeDeadline).toLocaleDateString('da-DK') : 'N/A';

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#006d75;">Order Confirmation 🎉</h2>
        <p>Hi <strong>${studentName}</strong>, your order has been received!</p>
        <p><strong>Order ID:</strong> #${orderId}</p>

        <h3 style="color:#006d75;">Your Garments</h3>
        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#006d75;color:#fff;">
                    <th style="padding:8px;">Product</th>
                    <th style="padding:8px;">Color</th>
                    <th style="padding:8px;">Size</th>
                </tr>
            </thead>
            <tbody>${garmentRows}</tbody>
        </table>

        <p style="margin-top:16px;"><strong>Change Deadline:</strong> ${deadline}</p>
        <p>You can edit your design, logo selection, and delivery details until the deadline.</p>

        ${getEducationExtra(educationType)}

        <hr/>
        <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
    </div>`;

    return sendEmail(email, `Order Confirmation – #${orderId}`, html, process.env.SMTP_NOREPLY);
};

// ─────────────────────────────────────────────
// EMAIL 2: Change Deadline Reminder
// Trigger: admin sends manually OR scheduled job
// ─────────────────────────────────────────────
export const sendChangeDeadlineEmail = async ({ email, studentName, orderId, changeDeadline, educationType }) => {
    const deadline = changeDeadline ? new Date(changeDeadline).toLocaleDateString('da-DK') : 'N/A';

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#e67e22;">⏰ Change Deadline Reminder</h2>
        <p>Hi <strong>${studentName}</strong>,</p>
        <p>This is a reminder that the deadline to make changes to your order <strong>#${orderId}</strong> is:</p>
        <h3 style="color:#e67e22;">${deadline}</h3>
        <p>After this date, your order will be locked and sent to production.</p>
        <p>Log in now to review or update your design, logo, or delivery details.</p>

        ${getEducationExtra(educationType)}

        <hr/>
        <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
    </div>`;

    return sendEmail(email, `Reminder: Order Change Deadline – #${orderId}`, html, process.env.SMTP_NOREPLY);
};

// ─────────────────────────────────────────────
// EMAIL 3: Status / Track & Trace
// Trigger: admin updates class to production_ready or shipped
// ─────────────────────────────────────────────
export const sendStatusEmail = async ({ email, studentName, orderId, status, trackingCode, educationType }) => {
    const statusMessages = {
        production_ready: { label: 'In Production', color: '#2980b9', msg: 'Your garment is now being produced. We will notify you when it ships.' },
        shipped: { label: 'Shipped 🚚', color: '#27ae60', msg: `Your garment is on its way! Tracking code: <strong>${trackingCode || 'N/A'}</strong>` },
        completed: { label: 'Delivered ✅', color: '#006d75', msg: 'Your order has been delivered. Enjoy your StudentLife garment!' }
    };

    const info = statusMessages[status] || { label: status, color: '#555', msg: 'Your order status has been updated.' };

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:${info.color};">Order Status: ${info.label}</h2>
        <p>Hi <strong>${studentName}</strong>,</p>
        <p>Update for your order <strong>#${orderId}</strong>:</p>
        <p style="font-size:16px;">${info.msg}</p>

        ${getEducationExtra(educationType)}

        <hr/>
        <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
    </div>`;

    return sendEmail(email, `Order Update: ${info.label} – #${orderId}`, html, process.env.SMTP_NOREPLY);
};

// ─────────────────────────────────────────────
// EMAIL 4: Follow-up (care instructions + graduation caps)
// Trigger: admin sends after delivery
// ─────────────────────────────────────────────
export const sendFollowUpEmail = async ({ email, studentName, educationType }) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#006d75;">Thank You from StudentLife 🎓</h2>
        <p>Hi <strong>${studentName}</strong>, we hope you love your garment!</p>

        <h3 style="color:#006d75;">Garment Care Instructions</h3>
        <ul>
            <li>Wash inside out at 30°C</li>
            <li>Do not tumble dry</li>
            <li>Do not iron directly on print</li>
            <li>Do not dry clean</li>
        </ul>

        <h3 style="color:#006d75;">Graduation Caps 🎓</h3>
        <p>Complete your graduation look with a StudentLife graduation cap. Personalized, high quality, and delivered fast.</p>
        <a href="https://studentlife.dk/caps" 
           style="display:inline-block;padding:10px 20px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;">
            Explore Graduation Caps
        </a>

        ${getEducationExtra(educationType)}

        <hr/>
        <p style="font-size:12px;color:gray;">StudentLife – studentlife.dk</p>
    </div>`;

    return sendEmail(email, 'Your StudentLife Garment – Care Guide & More', html, process.env.SMTP_NOREPLY);
};

// ─────────────────────────────────────────────
// Existing: Class Rep Welcome Email
// ─────────────────────────────────────────────
export const sendClassRepWelcomeEmail = async (email, joinLink) => {
    const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2 style="color:#006d75;">Welcome to StudentLife 🎉</h2>
        <p>You have been registered as a <strong>Class Representative</strong>.</p>
        <p><strong>Email:</strong> ${email}</p>
        <p>Click below to login:</p>
        <a href="${joinLink}" style="display:inline-block;padding:10px 20px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;">
            Login Now
        </a>
        <p style="margin-top:12px;">Or copy: ${joinLink}</p>
        <hr/>
        <p style="font-size:12px;color:gray;">Please change your password after first login.</p>
    </div>`;

    return sendEmail(email, 'Class Representative Account Created', html);
};
// ─────────────────────────────────────────────
// EMAIL: New Logo Upload Notification (Admin)
// Trigger: when class rep uploads a new logo
// ─────────────────────────────────────────────
export const sendLogoUploadNotificationEmail = async ({ adminEmail, logoName, schoolName, classRepName, classRepEmail, logoId }) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#e67e22;">New Logo Upload Notification</h2>
        <p>A new logo has been uploaded and requires review.</p>
        
        <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin:15px 0;">
            <h3 style="color:#006d75;margin-top:0;">Logo Details</h3>
            <p><strong>Logo Name:</strong> ${logoName}</p>
            <p><strong>School:</strong> ${schoolName}</p>
            <p><strong>Status:</strong> Pending Review</p>
        </div>

        

        <hr style="margin:20px 0;"/>
        <p style="font-size:12px;color:gray;">StudentLife Admin Notification System</p>
    </div>`;

    return sendEmail(adminEmail, `New Logo Upload: ${logoName} - ${schoolName}`, html);
};
{/*
    <p><strong>Uploaded by:</strong> ${classRepName} (${classRepEmail})</p>
<p><strong>Logo ID:</strong> #${logoId}</p>

<p>Please review and approve/reject this logo in the admin panel.</p>
        
        <a href="${process.env.LIVE_FRONTEND_URL}/admin/logos" 
           style="display:inline-block;padding:12px 24px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;margin:10px 0;">
            Review Logo
        </a> */}
// ─────────────────────────────────────────────
// EMAIL: New Back Design Upload Notification (Admin)
// Trigger: when class rep uploads a new back design
// ─────────────────────────────────────────────
export const sendBackDesignUploadNotificationEmail = async ({ adminEmail, designName, className, schoolName, classRepName, classRepEmail, designId }) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#9b59b6;">New Back Design Upload Notification</h2>
        <p>A new back design has been uploaded and requires review.</p>
        
        <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin:15px 0;">
            <h3 style="color:#006d75;margin-top:0;">Design Details</h3>
            <p><strong>Design Name:</strong> ${designName}</p>
            <p><strong>Class:</strong> ${className}</p>
            <p><strong>School:</strong> ${schoolName}</p>
           
            <p><strong>Status:</strong> Pending Review</p>
        </div>

      

        <hr style="margin:20px 0;"/>
        <p style="font-size:12px;color:gray;">StudentLife Admin Notification System</p>
    </div>`;

    return sendEmail(adminEmail, `New Back Design Upload: ${designName} - ${className}`, html);
};
//  <p><strong>Design ID:</strong> #${designId}</p>
//   <p>Please review and approve/reject this back design in the admin panel.</p>
//  <p><strong>Uploaded by:</strong> ${classRepName} (${classRepEmail})</p> 
//         <a href="${process.env.LIVE_FRONTEND_URL}/admin/back-designs" 
//            style="display:inline-block;padding:12px 24px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;margin:10px 0;">
//             Review Design
//         </a>
// ─────────────────────────────────────────────
// Helper function to get admin notification emails
// ─────────────────────────────────────────────
export const getAdminNotificationEmails = async () => {
    try {
        // First try to get from environment variable
        if (process.env.ADMIN_NOTIFICATION_EMAILS) {
            const envEmails = process.env.ADMIN_NOTIFICATION_EMAILS
                .split(',')
                .map(email => email.trim())
                .filter(email => email.length > 0);

            if (envEmails.length > 0) {
                return envEmails;
            }
        }

        // Fallback to database admin users
        const adminUsers = await prisma.user.findMany({
            where: {
                role: { in: ['admin', 'server_owner'] },
                status: { not: 2 }
            },
            select: { email: true }
        });

        return adminUsers.map(admin => admin.email);
    } catch (error) {
        console.error('Error getting admin notification emails:', error.message);
        return [];
    }
};