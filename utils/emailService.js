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
        const noReplyEmail = process.env.SMTP_USER || 'noreply@studentlife.dk';

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

        const info = await transporter.sendMail(mailOptions);
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

    return sendEmail(email, `Order Confirmation – #${orderId}`, html, process.env.SMTP_USER);
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

    return sendEmail(email, `Reminder: Order Change Deadline – #${orderId}`, html, process.env.SMTP_USER);
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

    return sendEmail(email, `Order Update: ${info.label} – #${orderId}`, html, process.env.SMTP_USER);
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

    return sendEmail(email, 'Tak for din StudentLife ordre – Plejevejledning & mere', html, process.env.SMTP_USER);
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
    recipients = [],
    recipientEmail,
    logoName,
    schoolName,
    uploaderName,
    uploaderEmail,
    logoId
}) => {

    // Ensure recipients includes recipientEmail if provided
    if (recipientEmail && !recipients.includes(recipientEmail)) {
        recipients = [recipientEmail, ...recipients];
    }

    // 👇 Admin / others email (same for everyone except uploader)
    const adminHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <div style="text-align:center; padding-bottom:16px;">
            <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;" />
        </div>

        <h2 style="color:#e67e22;">Ny logo upload-notifikation</h2>

        <p>Et nyt logo er blevet uploadet og kræver gennemgang.</p>

        <div style="background:#f8f9fa;padding:15px;border-left:4px solid #e67e22;margin:15px 0;">
            <p><strong>Logo navn:</strong> ${logoName}</p>
            <p><strong>Skole:</strong> ${schoolName}</p>
            <p><strong>Uploadet af:</strong> ${uploaderName} (${uploaderEmail})</p>
            <p><strong>Status:</strong> Afventer gennemgang</p>
        </div>

        <hr/>
        <p style="font-size:12px;color:gray;">StudentLife notifikation</p>
    </div>`;

    // 👇 Uploader email (different message)
    const uploaderHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
    <div style="text-align:center; padding-bottom:16px;">
        <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;" />
    </div>

    <h2 style="color:#2ecc71;">Logo upload gennemført 🎉</h2>

    <p>Dit logo er blevet uploadet med succes.</p>

    <p>
        Vi gennemgår din indsendelse inden for <strong>3 arbejdsdage</strong>, 
        og du får besked, når gennemgangen er færdig.
    </p>

    <div style="background:#f8f9fa;padding:15px;border-left:4px solid #2ecc71;margin:15px 0;">
        <p><strong>Logo navn:</strong> ${logoName}</p>
        <p><strong>Skole:</strong> ${schoolName}</p>
        <p><strong>Status:</strong> Afventer gennemgang</p>
    </div>

    <hr/>
    <p style="font-size:12px;color:gray;">
        StudentLife systemnotifikation
    </p>
</div>`;
    // 🔥 send emails to all recipients (admin and uploader distinct)
    const promises = recipients.map((email) => {
        const isUploader = email === uploaderEmail;
        const subject = isUploader
            ? `Your logo upload: ${logoName}`
            : `Nyt logo upload: ${logoName} – ${schoolName}`;
        const html = isUploader ? uploaderHtml : adminHtml;
        return sendEmail(email, subject, html);
    });

    return Promise.all(promises);
};

export const sendBackDesignUploadNotificationEmail = async ({ recipientEmail, designName, className, schoolName, uploaderName, uploaderEmail, designId }) => {
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
        <div style="text-align:center; padding-bottom:16px;">
            <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;" alt="StudentLife">
        </div>
        <h2 style="color:#e67e22;">Nyt ryg-design upload-notifikation</h2>

        <p>Et nyt ryg-design er blevet uploadet og kræver gennemgang.</p>

        <div style="background:#f8f9fa;padding:15px;border-left:4px solid #e67e22;margin:15px 0;">
            <p style="margin:4px 0;"><strong>Design navn:</strong> ${designName}</p>
            <p style="margin:4px 0;"><strong>Klasse:</strong> ${className}</p>
            <p style="margin:4px 0;"><strong>Skole:</strong> ${schoolName}</p>
            <p style="margin:4px 0;"><strong>Uploadet af:</strong> ${uploaderName} (${uploaderEmail})</p>
            <p style="margin:4px 0;"><strong>Status:</strong> Afventer gennemgang</p>
        </div>

        <hr style="margin:20px 0;"/>
        <p style="font-size:12px;color:gray;">StudentLife notifikation</p>
    </div>`;

    return sendEmail(recipientEmail, `Nyt ryg-design upload: ${designName} – ${className}`, html);
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
};

export const triggerAutomatedEmail = async (automationType, userData) => {
    try {

        const templates = await prisma.emailTemplate.findMany({
            where: {
                automation_type: automationType,
                is_automated: true,
                status: 0  // active only
            }
        });

        if (!templates.length) {
            return;
        }


        for (const template of templates) {
            const delayMs = (template.delay_hours || 0) * 60 * 60 * 1000;

            if (delayMs > 0) {
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
        if (process.env.SMTP_INFO_EMAIL) {
            const envEmails = process.env.SMTP_INFO_EMAIL
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

// ─────────────────────────────────────────────
// Logo approved / rejected — Danish email to uploader
// ─────────────────────────────────────────────
export const sendLogoStatusEmail = async ({ email, uploaderName, logoName, status, adminComment }) => {
    const approved = status === 'approved';

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif; margin:0; padding:0; background:#fff; color:#333;">

<div style="text-align:center; padding:20px;">
    <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;" alt="StudentLife">
</div>

<div style="max-width:700px; margin:auto; padding:20px;">

    <h2 style="color:${approved ? '#006d75' : '#c0392b'};">
        ${approved ? '✅ Dit logo er godkendt' : '❌ Dit logo er afvist'}
    </h2>

    <p>Kære <strong>${uploaderName}</strong>,</p>

    <p>
        ${approved
            ? `Vi er glade for at meddele, at dit logo <strong>"${logoName}"</strong> er blevet <strong>godkendt</strong> af vores team og er nu tilgængeligt til brug.`
            : `Vi skal desværre meddele, at dit logo <strong>"${logoName}"</strong> er blevet <strong>afvist</strong> af vores team.`
        }
    </p>

    ${!approved && adminComment ? `
    <div style="background:#fff3f3; border-left:4px solid #c0392b; padding:12px 16px; margin:16px 0;">
        <strong>Begrundelse:</strong><br/>
        ${adminComment}
    </div>` : ''}

    ${!approved ? `<p>Du er velkommen til at uploade et nyt logo, som overholder vores retningslinjer.</p>` : ''}

    <p>Har du spørgsmål, er du altid velkommen til at kontakte os på <a href="mailto:info@studentlife.dk">info@studentlife.dk</a>.</p>

    <p>Med venlig hilsen<br/>StudentLife</p>

</div>
</body>
</html>`;

    const subject = approved
        ? `Dit logo "${logoName}" er godkendt – StudentLife`
        : `Dit logo "${logoName}" er afvist – StudentLife`;

    return sendEmail(email, subject, html);
};

// ─────────────────────────────────────────────
// Back design approved / rejected — Danish email to uploader
// ─────────────────────────────────────────────
export const sendBackDesignStatusEmail = async ({ email, uploaderName, designName, status, adminComment }) => {
    const approved = status === 'approved';

    const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif; margin:0; padding:0; background:#fff; color:#333;">

<div style="text-align:center; padding:20px;">
    <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;" alt="StudentLife">
</div>

<div style="max-width:700px; margin:auto; padding:20px;">

    <h2 style="color:${approved ? '#006d75' : '#c0392b'};">
        ${approved ? '✅ Dit design er godkendt' : '❌ Dit design er afvist'}
    </h2>

    <p>Kære <strong>${uploaderName}</strong>,</p>

    <p>
        ${approved
            ? `Vi er glade for at meddele, at dit ryg-design <strong>"${designName}"</strong> er blevet <strong>godkendt</strong> af vores team og er nu tilgængeligt til brug.`
            : `Vi skal desværre meddele, at dit ryg-design <strong>"${designName}"</strong> er blevet <strong>afvist</strong> af vores team.`
        }
    </p>

    ${!approved && adminComment ? `
    <div style="background:#fff3f3; border-left:4px solid #c0392b; padding:12px 16px; margin:16px 0;">
        <strong>Begrundelse:</strong><br/>
        ${adminComment}
    </div>` : ''}

    ${!approved ? `<p>Du er velkommen til at uploade et nyt design, som overholder vores retningslinjer.</p>` : ''}

    <p>Har du spørgsmål, er du altid velkommen til at kontakte os på <a href="mailto:info@studentlife.dk">info@studentlife.dk</a>.</p>

    <p>Med venlig hilsen<br/>StudentLife</p>

</div>
</body>
</html>`;

    const subject = approved
        ? `Dit design "${designName}" er godkendt – StudentLife`
        : `Dit design "${designName}" er afvist – StudentLife`;

    return sendEmail(email, subject, html);
};
