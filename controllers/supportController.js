import prisma from "../config/prisma.js";
import { sendEmail, getAdminNotificationEmails } from "../utils/emailService.js";

// ─── Helper: shared HTML wrapper ─────────────────────────────────────────────

const emailWrapper = (bodyHtml) => `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f9f9f9;color:#333;">
  <div style="text-align:center;padding:24px 0;">
    <img src="https://clothapi.studentlife.dk/assets/studentlife-logo.png"
         alt="StudentLife" style="max-width:180px;">
  </div>
  <div style="max-width:680px;margin:0 auto 40px;background:#fff;
              border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06);">
    ${bodyHtml}
  </div>
</body>
</html>`;

// ─── CLASS REP: Submit a support ticket ──────────────────────────────────────
// POST /api/class-rep/support/submit
// Body: { subject, message }

export const submitSupportTicket = async (req, res) => {
    try {
        const { subject, message } = req.body;

        if (!subject?.trim() || !message?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Both 'subject' and 'message' are required."
            });
        }

        const userId = req.user.id;

        // Fetch the class rep's profile so we can enrich the admin email
        const classRep = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                name: true,
                email: true,
                class: { select: { id: true, name: true } },
                school: { select: { id: true, name: true } }
            }
        });

        if (!classRep) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Save to DB
        const ticket = await prisma.supportTicket.create({
            data: {
                user_id: userId,
                subject: subject.trim(),
                message: message.trim()
            }
        });

        // ── Email to admin ───────────────────────────────────────────────────
        const adminEmails = await getAdminNotificationEmails();

        const adminHtml = emailWrapper(`
            <h2 style="margin-top:0;">Ny supporthenvendelse (#${ticket.id})</h2>
            <p>En klasserepræsentant har sendt en supporthenvendelse via platformen.</p>

            <table width="100%" style="border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Navn</div>
                <div style="font-size:15px;">${classRep.name}</div>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">E-mail</div>
                <div style="font-size:15px;">${classRep.email}</div>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Skole</div>
                <div style="font-size:15px;">${classRep.school?.name ?? "–"}</div>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Klasse</div>
                <div style="font-size:15px;">${classRep.class?.name ?? "–"}</div>
              </td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Emne</div>
                <div style="font-size:15px;font-weight:bold;">${subject.trim()}</div>
              </td></tr>
              <tr><td style="padding:10px 0;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Besked</div>
                <div style="font-size:15px;white-space:pre-wrap;">${message.trim().replace(/\n/g, "<br>")}</div>
              </td></tr>
            </table>

            <div style="margin-top:24px;">
              <a href="mailto:${classRep.email}"
                 style="background:#333;color:#fff;padding:10px 20px;text-decoration:none;
                        border-radius:4px;display:inline-block;">
                Svar til ${classRep.name}
              </a>
            </div>

            <p style="margin-top:20px;font-size:13px;color:#888;">
              Ticket ID: #${ticket.id} · Oprettet: ${new Date(ticket.created_at).toLocaleString("da-DK", { timeZone: "Europe/Copenhagen" })}
            </p>
        `);

        await sendEmail(
            adminEmails,
            `[Support #${ticket.id}] ${subject.trim()} — ${classRep.name}`,
            adminHtml
        );

        // ── Acknowledgment email to class rep ────────────────────────────────
        const ackHtml = emailWrapper(`
            <h2 style="margin-top:0;">Kære ${classRep.name},</h2>
            <p>Vi har modtaget din supporthenvendelse og vil vende tilbage til dig hurtigst muligt.</p>

            <table width="100%" style="border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Emne</div>
                <div style="font-size:15px;font-weight:bold;">${subject.trim()}</div>
              </td></tr>
              <tr><td style="padding:10px 0;">
                <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:4px;">Din besked</div>
                <div style="font-size:15px;white-space:pre-wrap;">${message.trim().replace(/\n/g, "<br>")}</div>
              </td></tr>
            </table>

            <p style="margin-top:24px;font-size:13px;color:#888;">Ticket ID: #${ticket.id}</p>

            <p style="margin-top:4px;">Med venlig hilsen,<br/><strong>StudentLife Support</strong></p>
        `);

        await sendEmail(classRep.email, `Vi har modtaget din henvendelse (#${ticket.id})`, ackHtml);

        return res.status(201).json({
            success: true,
            message: "Support ticket submitted successfully.",
            data: { ticket_id: ticket.id, status: ticket.status }
        });

    } catch (err) {
        console.error("[Support] submitSupportTicket error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─── CLASS REP: Get own tickets ───────────────────────────────────────────────
// GET /api/class-rep/support/my-tickets

export const getMyTickets = async (req, res) => {
    try {
        const tickets = await prisma.supportTicket.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: "desc" },
            include: {
                replies: {
                    orderBy: { created_at: "asc" },
                    include: {
                        admin: { select: { id: true, name: true } }
                    }
                }
            }
        });

        return res.json({ success: true, data: tickets });
    } catch (err) {
        console.error("[Support] getMyTickets error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─── ADMIN: List all tickets ──────────────────────────────────────────────────
// GET /api/admin/support/tickets?status=open&page=1&limit=20

export const listAllTickets = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where = {};
        if (status && ["open", "replied", "closed"].includes(status)) {
            where.status = status;
        }

        const [tickets, total] = await Promise.all([
            prisma.supportTicket.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { created_at: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            school: { select: { name: true } },
                            class: { select: { name: true } }
                        }
                    },
                    replies: {
                        orderBy: { created_at: "asc" },
                        include: {
                            admin: { select: { id: true, name: true } }
                        }
                    }
                }
            }),
            prisma.supportTicket.count({ where })
        ]);

        return res.json({
            success: true,
            data: tickets,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (err) {
        console.error("[Support] listAllTickets error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─── ADMIN: Reply to a ticket ─────────────────────────────────────────────────
// POST /api/admin/support/reply/:ticketId
// Body: { message }

export const replyToTicket = async (req, res) => {
    try {
        const ticketId = Number(req.params.ticketId);
        const { message } = req.body;

        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: "'message' is required." });
        }

        // Load ticket + submitter info
        const ticket = await prisma.supportTicket.findUnique({
            where: { id: ticketId },
            include: {
                user: { select: { id: true, name: true, email: true } }
            }
        });

        if (!ticket) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }

        // Save the reply
        const reply = await prisma.supportTicketReply.create({
            data: {
                ticket_id: ticketId,
                admin_id: req.user.id,
                message: message.trim()
            }
        });

        // Update ticket status to "replied"
        await prisma.supportTicket.update({
            where: { id: ticketId },
            data: { status: "replied" }
        });

        // ── Email to class rep ───────────────────────────────────────────────
        const repHtml = emailWrapper(`
            <h2 style="margin-top:0;">Svar på din supporthenvendelse (#${ticket.id})</h2>
            <p>Vores supportteam har besvaret din henvendelse med emnet:
               <strong>${ticket.subject}</strong></p>

            <div style="background:#f4f4f4;border-left:4px solid #333;padding:16px;
                        border-radius:4px;margin:20px 0;">
              <div style="font-size:12px;text-transform:uppercase;color:#888;margin-bottom:8px;">
                Svar fra StudentLife Support
              </div>
              <div style="font-size:15px;white-space:pre-wrap;">
                ${message.trim().replace(/\n/g, "<br>")}
              </div>
            </div>

            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

            <div style="font-size:13px;color:#888;">
              <div style="margin-bottom:8px;font-weight:bold;color:#555;">Din oprindelige besked:</div>
              <div style="white-space:pre-wrap;">${ticket.message.replace(/\n/g, "<br>")}</div>
            </div>

            <p style="margin-top:24px;font-size:13px;color:#888;">Ticket ID: #${ticket.id}</p>
            <p>Med venlig hilsen,<br/><strong>StudentLife Support</strong></p>
        `);

        await sendEmail(
            ticket.user.email,
            `[Support #${ticket.id}] Svar: ${ticket.subject}`,
            repHtml
        );

        return res.json({
            success: true,
            message: "Reply sent and class rep notified.",
            data: { reply_id: reply.id, ticket_status: "replied" }
        });

    } catch (err) {
        console.error("[Support] replyToTicket error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// ─── ADMIN: Close a ticket ────────────────────────────────────────────────────
// PATCH /api/admin/support/:ticketId/close

export const closeTicket = async (req, res) => {
    try {
        const ticketId = Number(req.params.ticketId);

        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }

        await prisma.supportTicket.update({
            where: { id: ticketId },
            data: { status: "closed" }
        });

        return res.json({ success: true, message: "Ticket closed." });
    } catch (err) {
        console.error("[Support] closeTicket error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
