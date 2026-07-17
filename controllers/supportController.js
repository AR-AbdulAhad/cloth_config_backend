import prisma from "../config/prisma.js";
import { sendEmail, getAdminNotificationEmails } from "../utils/emailService.js";

export const registerSupportSocketHandlers = (io, socket) => {

    socket.on("join_support_ticket", async ({ ticketId }) => {
        if (!ticketId) return;
        const room = `support_ticket_${ticketId}`;
        socket.join(room);
    });

    socket.on("join_admin_support", () => {
        socket.join("admin_support");
    });

    socket.on("support_send_message", async ({ ticketId, message, senderId, senderRole }) => {
        if (!ticketId || !message?.trim() || !senderId) return;

        try {
            // Verify ticket exists first
            const ticket = await prisma.supportTicket.findUnique({
                where: { id: Number(ticketId) }
            });
            if (!ticket) {
                socket.emit("support_error", { error: "Ticket not found." });
                return;
            }

            const saved = await prisma.supportTicketMessage.create({
                data: {
                    ticket_id: Number(ticketId),
                    sender_id: Number(senderId),
                    message: message.trim()
                },
                include: {
                    sender: { select: { id: true, name: true, role: true } }
                }
            });

            const newStatus = senderRole === "admin" ? "replied" : "open";
            await prisma.supportTicket.update({
                where: { id: Number(ticketId) },
                data: { status: newStatus }
            });

            // Auto-join the room if sender wasn't in it yet (fixes admin timing bug)
            const room = `support_ticket_${ticketId}`;
            socket.join(room);

            io.to(room).emit("support_message", {
                ticketId: Number(ticketId),
                message: saved
            });

        } catch (err) {
            console.error("[Support Socket] support_send_message error:", err.message);
            socket.emit("support_error", { error: "Failed to send message." });
        }
    });

    socket.on("close_ticket", async ({ ticketId }) => {
        if (!ticketId) return;
        try {
            await prisma.supportTicket.update({
                where: { id: Number(ticketId) },
                data: { status: "closed" }
            });

            io.to(`support_ticket_${ticketId}`).emit("ticket_status_changed", {
                ticketId: Number(ticketId),
                status: "closed"
            });
        } catch (err) {
            console.error("[Support Socket] close_ticket error:", err.message);
        }
    });
};

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

        const { ticket, firstMessage } = await prisma.$transaction(async (tx) => {
            const ticket = await tx.supportTicket.create({
                data: {
                    user_id: userId,
                    subject: subject.trim(),
                    status: "open"
                }
            });

            const firstMessage = await tx.supportTicketMessage.create({
                data: {
                    ticket_id: ticket.id,
                    sender_id: userId,
                    message: message.trim()
                },
                include: {
                    sender: { select: { id: true, name: true, role: true } }
                }
            });

            return { ticket, firstMessage };
        });

        const io = req.io;
        if (io) {
            io.to("admin_support").emit("new_support_ticket", {
                ticket: {
                    id: ticket.id,
                    subject: ticket.subject,
                    status: ticket.status,
                    created_at: ticket.created_at,
                    user: {
                        id: userId,
                        name: classRep.name,
                        email: classRep.email,
                        school: classRep.school,
                        class: classRep.class
                    }
                },
                firstMessage
            });
        }

        const adminEmails = await getAdminNotificationEmails();
        const adminHtml = buildAdminNotifEmail(ticket, classRep, message.trim());
        sendEmail(
            adminEmails,
            `[Support #${ticket.id}] ${subject.trim()} — ${classRep.name}`,
            adminHtml
        ).catch(() => {}); // fire-and-forget, don't block response

        return res.status(201).json({
            success: true,
            message: "Support ticket created.",
            data: {
                ticket_id: ticket.id,
                status: ticket.status,
                firstMessage
            }
        });

    } catch (err) {
        console.error("[Support] submitSupportTicket error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getTicketMessages = async (req, res) => {
    try {
        const ticketId = Number(req.params.ticketId);
        const userId = req.user.id;
        const role = req.user.role;

        const ticket = await prisma.supportTicket.findUnique({
            where: { id: ticketId },
            include: {
                user: { select: { id: true, name: true, email: true, school: { select: { name: true } }, class: { select: { name: true } } } },
                messages: {
                    orderBy: { created_at: "asc" },
                    include: {
                        sender: { select: { id: true, name: true, role: true } }
                    }
                }
            }
        });

        if (!ticket) {
            return res.status(404).json({ success: false, message: "Ticket not found." });
        }

        if (role === "class_representative" && ticket.user_id !== userId) {
            return res.status(403).json({ success: false, message: "Access denied." });
        }

        return res.json({ success: true, data: ticket });
    } catch (err) {
        console.error("[Support] getTicketMessages error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyTickets = async (req, res) => {
    try {
        const tickets = await prisma.supportTicket.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: "desc" },
            include: {
                messages: {
                    orderBy: { created_at: "desc" },
                    take: 1, // last message preview
                    include: { sender: { select: { id: true, name: true, role: true } } }
                }
            }
        });

        return res.json({ success: true, data: tickets });
    } catch (err) {
        console.error("[Support] getMyTickets error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};

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
                    messages: {
                        orderBy: { created_at: "desc" },
                        take: 1,
                        include: { sender: { select: { id: true, name: true, role: true } } }
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

        const io = req.io;
        if (io) {
            io.to(`support_ticket_${ticketId}`).emit("ticket_status_changed", {
                ticketId,
                status: "closed"
            });
        }

        return res.json({ success: true, message: "Ticket closed." });
    } catch (err) {
        console.error("[Support] closeTicket error:", err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};


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

const buildAdminNotifEmail = (ticket, classRep, message) => emailWrapper(`
    <h2 style="margin-top:0;">Ny supporthenvendelse (#${ticket.id})</h2>
    <p>En klasserepræsentant har åbnet en ny supportchat via platformen.</p>
    <table width="100%" style="border-collapse:collapse;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;">Navn</span><br>
        <strong>${classRep.name}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;">E-mail</span><br>
        ${classRep.email}
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;">Skole / Klasse</span><br>
        ${classRep.school?.name ?? "–"} / ${classRep.class?.name ?? "–"}
      </td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;">Emne</span><br>
        <strong>${ticket.subject}</strong>
      </td></tr>
      <tr><td style="padding:8px 0;">
        <span style="font-size:12px;color:#888;text-transform:uppercase;">Besked</span><br>
        <div style="white-space:pre-wrap;">${message.replace(/\n/g, "<br>")}</div>
      </td></tr>
    </table>
    <p style="margin-top:20px;font-size:12px;color:#aaa;">Ticket ID: #${ticket.id}</p>
`);
