import prisma from "../config/prisma.js";
import { sendEmail } from "../utils/emailService.js";

// ─────────────────────────────────────────────
// Contact / Inquiry Endpoint
// POST /api/contact/inquiry
// Public — no auth required
// Body: { name, email, phone, req_for, school_id, class_id, message }
// ─────────────────────────────────────────────
// export const sendInquiry = async (req, res) => {
//     try {
//         const { name, email, phone, req_for, school_id, class_id, message } = req.body;

//         if (!name || !email || !req_for || !message) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Missing required fields: name, email, req_for, message"
//             });
//         }

//         const validRoles = ["student", "class_rep"];
//         if (!validRoles.includes(req_for)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "req_for must be 'student' or 'class_rep'"
//             });
//         }

//         // Fetch school name from DB
//         let schoolName = null;
//         if (school_id) {
//             const school = await prisma.school.findUnique({
//                 where: { id: parseInt(school_id) },
//                 select: { name: true }
//             });
//             schoolName = school?.name || null;
//         }

//         // Fetch class name from DB
//         let className = null;
//         if (class_id) {
//             const cls = await prisma.classes.findUnique({
//                 where: { id: parseInt(class_id) },
//                 select: { name: true }
//             });
//             className = cls?.name || null;
//         }

//         const submittedAt = new Date().toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" });
//         const roleLabel   = req_for === "class_rep" ? "Class Representative" : "Student";

//         // ── helper: a labeled field inside gray box ──
//         const field = (label, value) => `
//             <tr>
//                 <td style="border-bottom:1px solid #cdcdcd; padding:10px 0;">
//                     <div style="font-size:13px; text-transform:uppercase; color:#666666; margin-bottom:4px;">${label}</div>
//                     <div style="font-size:16px; color:#333333;">${value}</div>
//                 </td>
//             </tr>`;

//         // ── Email to StudentLife info inbox ──
//         const infoHtml = `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>New Inquiry - Studentlife</title>
//     <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
//     <style>@media only screen and (max-width:600px){table[class="container"]{width:100%!important;}}</style>
// </head>
// <body style="margin:0; padding:0; background-color:#ffffff; font-family:Arial, sans-serif; color:#333333; line-height:1.4;">

// <!-- Logo -->
// <div style="text-align:center; padding:24px 5px 10px;">
//     <img src="https://cloth.studentlife.dk/assets/StudentLife-BHQG9Jkp.jpg" alt="StudentLife" style="max-width:220px; height:auto;">
// </div>

// <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
// <tr><td align="center">
// <table width="700" border="0" cellpadding="0" cellspacing="0" class="container" style="max-width:700px; width:100%;">
// <tr><td style="padding:0 20px;">

//     <!-- Premium Banner -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border-top:1px solid #e5e7eb;">
//         <tr>
//             <td align="center" style="padding:12px 0;">
//                 <table border="0" cellpadding="0" cellspacing="0">
//                     <tr>
//                         <td style="font-size:15px; font-weight:bold; color:#111827; padding:0 15px;">✓ New Inquiry Received</td>
//                         <td style="font-size:15px; font-weight:bold; color:#111827; padding:0 15px;">✓ Submitted on ${submittedAt}</td>
//                     </tr>
//                 </table>
//             </td>
//         </tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:15px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

//     <!-- Intro -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-size:18px; font-weight:bold; padding-bottom:10px;">New Inquiry from: ${name}</td></tr>
//         <tr><td style="font-size:16px; padding-bottom:15px;">A new inquiry has been submitted via the StudentLife contact form. Details are below.</td></tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:10px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

//     <!-- Contact Information Header -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-weight:bold; font-size:18px; padding-bottom:10px;">Contact Information</td></tr>
//     </table>

//     <!-- Contact Information Box -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f2f3f2; margin-bottom:20px;">
//         <tr><td style="padding:20px 30px;">
//             <table width="100%" border="0" cellpadding="0" cellspacing="0">
//                 ${field("Full Name", name)}
//                 ${field("Email", `<a href="mailto:${email}" style="color:#333333;">${email}</a>`)}
//                 ${field("Phone", phone || "Not provided")}
//                 ${field("Requesting As", roleLabel)}
//             </table>
//         </td></tr>
//     </table>

//     <!-- School & Class Header -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-weight:bold; font-size:18px; padding-bottom:10px;">School &amp; Class</td></tr>
//     </table>

//     <!-- School & Class Box -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f2f3f2; margin-bottom:20px;">
//         <tr><td style="padding:20px 30px;">
//             <table width="100%" border="0" cellpadding="0" cellspacing="0">
//                 ${field("School Name",
//                     schoolName
//                         ? `${schoolName} <span style="color:#999999; font-size:13px;">(ID: ${school_id})</span>`
//                         : school_id ? `ID: ${school_id}` : "Not provided"
//                 )}
//                 ${field("Class Name",
//                     className
//                         ? `${className} <span style="color:#999999; font-size:13px;">(ID: ${class_id})</span>`
//                         : class_id ? `ID: ${class_id}` : "Not provided"
//                 )}
//             </table>
//         </td></tr>
//     </table>

//     <!-- Message Header -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-weight:bold; font-size:18px; padding-bottom:10px;">Message</td></tr>
//     </table>

//     <!-- Message Box -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f2f3f2; margin-bottom:25px;">
//         <tr><td style="padding:20px 30px;">
//             <table width="100%" border="0" cellpadding="0" cellspacing="0">
//                 <tr>
//                     <td style="font-size:16px; color:#333333; line-height:1.7;">
//                         ${message.replace(/\n/g, "<br>")}
//                     </td>
//                 </tr>
//             </table>
//         </td></tr>
//     </table>

//     <!-- Reply Button -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
//         <tr>
//             <td>
//                 <a href="mailto:${email}?subject=Re: Your Inquiry – StudentLife"
//                    style="display:inline-block; background-color:#333333; color:#ffffff; text-decoration:none; padding:12px 28px; font-size:15px; font-weight:bold;">
//                     Reply to ${name}
//                 </a>
//             </td>
//         </tr>
//     </table>

//     <!-- Footer -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-top:1px solid #cdcdcd;">
//         <tr>
//             <td style="font-size:14px; padding-top:15px;">
//                 <p style="margin:0 0 8px 0;">Have questions? Our team is always ready to help.</p>
//                 <p style="margin:0 0 8px 0;">Have a great day,</p>
//                 <p style="margin:0;">StudentLife 😊</p>
//             </td>
//         </tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:20px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

// </td></tr>
// </table>
// </td></tr>
// </table>

// </body>
// </html>`;

//         // ── Acknowledgement email to the sender ──
//         const ackHtml = `<!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Inquiry Received - Studentlife</title>
//     <!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
//     <style>@media only screen and (max-width:600px){table[class="container"]{width:100%!important;}}</style>
// </head>
// <body style="margin:0; padding:0; background-color:#ffffff; font-family:Arial, sans-serif; color:#333333; line-height:1.4;">

// <!-- Logo -->
// <div style="text-align:center; padding:24px 5px 10px;">
//     <img src="https://cloth.studentlife.dk/assets/StudentLife-BHQG9Jkp.jpg" alt="StudentLife" style="max-width:220px; height:auto;">
// </div>

// <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
// <tr><td align="center">
// <table width="700" border="0" cellpadding="0" cellspacing="0" class="container" style="max-width:700px; width:100%;">
// <tr><td style="padding:0 20px;">

//     <!-- Premium Banner -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border-top:1px solid #e5e7eb;">
//         <tr>
//             <td align="center" style="padding:12px 0;">
//                 <table border="0" cellpadding="0" cellspacing="0">
//                     <tr>
//                         <td style="font-size:15px; font-weight:bold; color:#111827; padding:0 15px;">✓ Inquiry Received</td>
//                         <td style="font-size:15px; font-weight:bold; color:#111827; padding:0 15px;">✓ We will get back to you shortly</td>
//                     </tr>
//                 </table>
//             </td>
//         </tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:15px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

//     <!-- Greeting -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-size:18px; font-weight:bold; padding-bottom:10px;">Dear: ${name},</td></tr>
//         <tr><td style="font-size:18px; font-weight:bold; padding-bottom:10px;">Thank you for reaching out to StudentLife.</td></tr>
//         <tr><td style="font-size:16px; padding-bottom:15px;">We have received your inquiry and our team will get back to you as soon as possible. Please review your submission details below.</td></tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:10px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

//     <!-- Submission Summary Header -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0">
//         <tr><td style="font-weight:bold; font-size:18px; padding-bottom:10px;">Your Submission Summary</td></tr>
//     </table>

//     <!-- Summary Box -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#f2f3f2; margin-bottom:20px;">
//         <tr><td style="padding:20px 30px;">
//             <table width="100%" border="0" cellpadding="0" cellspacing="0">
//                 ${field("Requesting As", roleLabel)}
//                 ${field("School", schoolName || (school_id ? `ID: ${school_id}` : "Not provided"))}
//                 ${field("Class", className || (class_id ? `ID: ${class_id}` : "Not provided"))}
//                 ${field("Your Message", `<span style="color:#555555;">${message.replace(/\n/g, "<br>")}</span>`)}
//             </table>
//         </td></tr>
//     </table>

//     <!-- Contact Info -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom:25px;">
//         <tr><td style="font-size:15px; color:#555555; padding-bottom:6px;">For urgent matters, contact us directly:</td></tr>
//         <tr><td style="font-size:15px; font-weight:bold;">
//             <a href="mailto:info@studentlife.dk" style="color:#333333;">info@studentlife.dk</a>
//         </td></tr>
//     </table>

//     <!-- Footer -->
//     <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-top:1px solid #cdcdcd;">
//         <tr>
//             <td style="font-size:14px; padding-top:15px;">
//                 <p style="margin:0 0 8px 0;">We look forward to assisting you.</p>
//                 <p style="margin:0 0 8px 0;">Have a great day,</p>
//                 <p style="margin:0;">StudentLife 😊</p>
//             </td>
//         </tr>
//     </table>

//     <table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td style="height:20px; font-size:0; line-height:0;">&nbsp;</td></tr></table>

// </td></tr>
// </table>
// </td></tr>
// </table>

// </body>
// </html>`;

//         const infoEmail = process.env.SMTP_INFO_EMAIL || process.env.SMTP_USER;

//         await Promise.all([
//             sendEmail(infoEmail, `New Inquiry: ${name} (${roleLabel})`, infoHtml),
//             sendEmail(email, "We received your inquiry – StudentLife", ackHtml)
//         ]);

//         res.json({
//             success: true,
//             message: "Inquiry submitted successfully. A confirmation email has been sent to you."
//         });

//     } catch (err) {
//         console.error("[Contact] Error:", err.message);
//         res.status(500).json({ success: false, error: err.message });
//     }
// };
export const sendInquiry = async (req, res) => {
    try {
        const { name, email, phone, req_for, school_name, class_name, message } = req.body;

        if (!name || !email || !req_for || !message) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: name, email, req_for, message"
            });
        }

        const validRoles = ["student", "class_rep"];
        if (!validRoles.includes(req_for)) {
            return res.status(400).json({
                success: false,
                message: "req_for must be 'student' or 'class_rep'"
            });
        }

        const submittedAt = new Date().toLocaleString("da-DK", {
            timeZone: "Europe/Copenhagen"
        });

        const roleLabel = req_for === "class_rep"
            ? "Klasserepræsentant"
            : "Studerende";

        // helper
        const field = (label, value) => `
            <tr>
                <td style="border-bottom:1px solid #cdcdcd; padding:10px 0;">
                    <div style="font-size:13px; text-transform:uppercase; color:#666; margin-bottom:4px;">
                        ${label}
                    </div>
                    <div style="font-size:16px; color:#333;">
                        ${value || "Ikke angivet"}
                    </div>
                </td>
            </tr>`;

        // ── ADMIN EMAIL (DANISH) ──
        const infoHtml = `<!DOCTYPE html>
<html>
<body style="font-family:Arial; margin:0; padding:0; background:#fff; color:#333;">

<div style="text-align:center; padding:20px;">
    <img src="https://cloth.studentlife.dk/assets/StudentLife-BHQG9Jkp.jpg" style="max-width:200px;">
</div>

<div style="max-width:700px; margin:auto; padding:20px;">

<h2>Ny forespørgsel modtaget</h2>
<p>En ny forespørgsel er blevet sendt via formularen.</p>

<h3>Kontaktoplysninger</h3>
<table width="100%">
    ${field("Navn", name)}
    ${field("E-mail", email)}
    ${field("Telefon", phone)}
    ${field("Rolle", roleLabel)}
</table>

<h3>Skole & Klasse</h3>
<table width="100%">
    ${field("Skole", school_name)}
    ${field("Klasse", class_name)}
</table>

<h3>Besked</h3>
<p>${message.replace(/\n/g, "<br>")}</p>

<p style="margin-top:20px;">
    <a href="mailto:${email}" style="background:#333;color:#fff;padding:10px 20px;text-decoration:none;">
        Svar til ${name}
    </a>
</p>

</div>
</body>
</html>`;

        // ── USER ACK EMAIL (DANISH) ──
        const ackHtml = `<!DOCTYPE html>
<html>
<body style="font-family:Arial; margin:0; padding:0; background:#fff; color:#333;">

<div style="text-align:center; padding:20px;">
    <img src="https://cloth.studentlife.dk/assets/StudentLife-BHQG9Jkp.jpg" style="max-width:200px;">
</div>

<div style="max-width:700px; margin:auto; padding:20px;">

<h2>Kære ${name}</h2>

<p>Tak for din henvendelse.</p>
<p>Vi har modtaget din forespørgsel og vender tilbage inden for 2-3 hverdage.</p>

<h3>Din besked</h3>
<p>${message.replace(/\n/g, "<br>")}</p>

<hr>

<p><b>Skole:</b> ${school_name || "Ikke angivet"}</p>
<p><b>Klasse:</b> ${class_name || "Ikke angivet"}</p>
<p><b>Rolle:</b> ${roleLabel}</p>

<p style="margin-top:20px;">
Hvis det haster, kontakt os på <a href="mailto:info@studentlife.dk">info@studentlife.dk</a>
</p>

<p>Med venlig hilsen<br/>StudentLife</p>

</div>
</body>
</html>`;

        const infoEmail = process.env.SMTP_INFO_EMAIL || "StudentLife";

        await Promise.all([
            sendEmail(infoEmail, `Ny forespørgsel fra ${name}`, infoHtml),
            sendEmail(email, "Vi har modtaget din forespørgsel", ackHtml)
        ]);

        return res.json({
            success: true,
            message: "Inquiry sendt successfully"
        });

    } catch (err) {
        console.error("[Inquiry Error]:", err.message);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
};