import prisma from "../config/prisma.js";
import { sendEmail } from "../utils/emailService.js";

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
    <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;">
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
    <img src="https://cloth.studentlife.dk/clothLogo.png" style="max-width:200px;">
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