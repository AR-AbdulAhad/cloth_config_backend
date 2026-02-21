import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: true, // true for 465
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false // optional for local dev
    }
});


export const sendEmail = async (to, subject, html, text = null) => {
    try {
        const info = await transporter.sendMail({
            from: '"StudentLife" <noreply@studentlife.com>',
            to,
            subject,
            text: text || "Please view this email in HTML format.",
            html
        });

        console.log("Message sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};

export const sendOrderConfirmation = (email, orderDetails) => {
    return sendEmail(email, "Order Confirmation", `Thank you for your order! Details: ${JSON.stringify(orderDetails)}`);
};


export const sendClassRepWelcomeEmail = async (email, joinLink) => {

    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color:#006d75;">Welcome to StudentLife 🎉</h2>
            
            <p>You have been registered as a <strong>Class Representative</strong>.</p>

            <p><strong>Email:</strong> ${email}</p>

            <p>Please click the button below to login:</p>

            <a href="${joinLink}" 
               style="display:inline-block;
                      padding:10px 20px;
                      background:#006d75;
                      color:#ffffff;
                      text-decoration:none;
                      border-radius:5px;">
                Login Now
            </a>

            <br/><br/>
            <p>If the button doesn't work, copy this link:</p>
            <p>${joinLink}</p>

            <hr/>
            <p style="font-size:12px;color:gray;">
                Please change your password after first login.
            </p>
        </div>
    `;

    return sendEmail(email, "Class Representative Account Created", html);
};
