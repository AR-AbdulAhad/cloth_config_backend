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
        const senderEmail = "StudentLife"; // Gmail authenticated account
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
        
        <h2 style="color:#006d75;">Ordrebekræftelse 🎉</h2>
        <p>Hej <strong>${studentName}</strong>, din ordre er modtaget!</p>
        <p><strong>Ordre ID:</strong> #${orderId}</p>

        <h3 style="color:#006d75;">Dine produkter</h3>

        <table style="width:100%;border-collapse:collapse;">
            <thead>
                <tr style="background:#006d75;color:#fff;">
                    <th style="padding:8px;">Produkt</th>
                    <th style="padding:8px;">Farve</th>
                    <th style="padding:8px;">Størrelse</th>
                </tr>
            </thead>
            <tbody>${garmentRows}</tbody>
        </table>

        <p style="margin-top:16px;">
            <strong>Ændringsfrist:</strong> ${deadline}
        </p>

        <p>
            Du kan redigere dit design, logo og leveringsoplysninger indtil fristen.
        </p>

        ${getEducationExtra(educationType)}

        <hr/>

        <p style="font-size:12px;color:gray;">
            StudentLife – studentlife.dk
        </p>
    </div>
`;

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
        
        <h2 style="color:#e67e22;">⏰ Påmindelse om ændringsfrist</h2>

        <p>Hej <strong>${studentName}</strong>,</p>

        <p>
            Dette er en påmindelse om, at fristen for at ændre din ordre 
            <strong>#${orderId}</strong> er:
        </p>

        <h3 style="color:#e67e22;">${deadline}</h3>

        <p>
            Efter denne dato bliver din ordre låst og sendt til produktion.
        </p>

        <p>
            Log ind nu for at gennemgå eller opdatere dit design, logo eller leveringsoplysninger.
        </p>

        ${getEducationExtra(educationType)}

        <hr/>

        <p style="font-size:12px;color:gray;">
            StudentLife – studentlife.dk
        </p>
    </div>
`;

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
        
        <h2 style="color:${info.color};">Ordrestatus: ${info.label}</h2>

        <p>Hej <strong>${studentName}</strong>,</p>

        <p>Opdatering på din ordre <strong>#${orderId}</strong>:</p>

        <p style="font-size:16px;">
            ${info.msg}
        </p>

        ${getEducationExtra(educationType)}

        <hr/>

        <p style="font-size:12px;color:gray;">
            StudentLife – studentlife.dk
        </p>
    </div>
`;

    return sendEmail(email, `Order Update: ${info.label} – #${orderId}`, html, process.env.SMTP_NOREPLY);
};

// ─────────────────────────────────────────────
// EMAIL 4: Follow-up (care instructions + graduation caps)
// Trigger: admin sends after delivery
// ─────────────────────────────────────────────
export const sendFollowUpEmail = async ({ email, studentName, educationType }) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        
        <h2 style="color:#006d75;">Tak fra StudentLife 🎓</h2>

        <p>Hej <strong>${studentName}</strong>, vi håber, du er glad for dit produkt!</p>

        <h3 style="color:#006d75;">Vaskeanvisninger</h3>
        <ul>
            <li>Vask med vrangen ud ved 30°C</li>
            <li>Må ikke tørretumbles</li>
            <li>Stryg ikke direkte på tryk</li>
            <li>Må ikke renses kemisk</li>
        </ul>

        <h3 style="color:#006d75;">Studenterhuer 🎓</h3>
        <p>
            Fuldend dit studenterlook med en personlig StudentLife studenterhue. 
            Høj kvalitet, specialdesignet og hurtig levering.
        </p>

        <a href="https://studentlife.dk/caps" 
           style="display:inline-block;padding:10px 20px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;">
            Udforsk studenterhuer
        </a>

        ${getEducationExtra(educationType)}

        <hr/>

        <p style="font-size:12px;color:gray;">
            StudentLife – studentlife.dk
        </p>
    </div>`;

    return sendEmail(email, 'Tak for din StudentLife ordre – Plejevejledning & mere', html, process.env.SMTP_NOREPLY);
};

export const sendClassRepWelcomeEmail = async (email, joinLink) => {
    const html = `
    <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2 style="color:#006d75;">Velkommen til StudentLife 🎉</h2>

        <p>Du er blevet registreret som <strong>klasse repræsentant</strong>.</p>

        <p><strong>Email:</strong> ${email}</p>

        <p>Klik nedenfor for at logge ind:</p>

        <a href="${joinLink}" style="display:inline-block;padding:10px 20px;background:#006d75;color:#fff;text-decoration:none;border-radius:5px;">
            Log ind nu
        </a>

        <p style="margin-top:12px;">Eller kopiér linket: ${joinLink}</p>

        <hr/>

        <p style="font-size:12px;color:gray;">
            Husk at ændre din adgangskode efter første login.
        </p>
    </div>`;

    return sendEmail(email, 'Klasse repræsentant oprettet', html);
};

export const sendLogoUploadNotificationEmail = async ({
    adminEmail,
    logoName,
    schoolName,
    classRepName,
    classRepEmail,
    logoId
}) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <h2 style="color:#e67e22;">Ny logo upload-notifikation</h2>

        <p>Et nyt logo er blevet uploadet og kræver gennemgang.</p>

        <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin:15px 0;">
            <h3 style="color:#006d75;margin-top:0;">Logodetaljer</h3>

            <p><strong>Logo navn:</strong> ${logoName}</p>
            <p><strong>Skole:</strong> ${schoolName}</p>
            <p><strong>Status:</strong> Afventer gennemgang</p>
        </div>

        <hr style="margin:20px 0;"/>

        <p style="font-size:12px;color:gray;">
            StudentLife administrationsnotifikation
        </p>
    </div>`;

    return sendEmail(
        adminEmail,
        `Nyt logo upload: ${logoName} - ${schoolName}`,
        html
    );
};

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

const sendTemplateEmail = async (template, userData, automationType) => {
    if (!template.html_body) {
        console.warn(`[AutoEmail] Template #${template.id} has empty html_body — skipping`);
        return;
    }

    let html = template.html_body;
    let subject = template.subject;

    // Replace {{variables}} with actual user data
    Object.entries(userData).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        html = html.replace(regex, value ?? '');
        subject = subject.replace(regex, value ?? '');
    });

    await sendEmail(userData.email, subject, html);
    console.log(`[AutoEmail] Sent [${automationType}] to ${userData.email} (template #${template.id})`);
};

export const triggerAutomatedEmail = async (automationType, userData) => {
    try {
        console.log(`[AutoEmail] Trigger: ${automationType} → ${userData.email}`);

        const templates = await prisma.emailTemplate.findMany({
            where: {
                automation_type: automationType,
                is_automated: true,
                status: 0  // active only
            }
        });

        if (!templates.length) {
            console.log(`[AutoEmail] No active template found for: ${automationType}`);
            return;
        }

        console.log(`[AutoEmail] Found ${templates.length} template(s) for: ${automationType}`);

        for (const template of templates) {
            const delayMs = (template.delay_hours || 0) * 60 * 60 * 1000;

            if (delayMs > 0) {
                console.log(`[AutoEmail] Template #${template.id} delayed by ${template.delay_hours}h`);
                setTimeout(() => {
                    sendTemplateEmail(template, userData, automationType)
                        .catch(err => console.error(`[AutoEmail] Delayed send failed:`, err.message));
                }, delayMs);
            } else {
                await sendTemplateEmail(template, userData, automationType);
            }
        }
    } catch (error) {
        console.error(`[AutoEmail] triggerAutomatedEmail failed [${automationType}]:`, error.message);
        throw error;
    }
};

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