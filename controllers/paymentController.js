import Stripe from "stripe";
import prisma from "../config/prisma.js";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// export const createCheckoutSession = async (req, res) => {
//     try {
//         const { orderId, amount } = req.body; // amount in smallest currency unit (e.g., cents/øre)

//         if (!orderId) {
//             return res.status(400).json({ success: false, message: "Order ID is required" });
//         }

//         const order = await prisma.order.findUnique({
//             where: { id: parseInt(orderId) },
//             include: { student: true, order_items: true }
//         });

//         if (!order) {
//             return res.status(404).json({ success: false, message: "Order not found" });
//         }

//         // Map order items to stripe line items
//         // If items don't have prices in DB, use the provided amount split across items or a fixed price per item
//         const line_items = order.order_items.length > 0
//             ? order.order_items.map(item => ({
//                 price_data: {
//                     currency: "dkk",
//                     product_data: {
//                         name: `${item.product_type} (${item.selectedSize}, ${item.selectedColor})`,
//                     },
//                     unit_amount: amount ? Math.round(amount / order.order_items.length) : 50000, // rudimentary split if amount is provided
//                 },
//                 quantity: 1,
//             }))
//             : [{
//                 price_data: {
//                     currency: "dkk",
//                     product_data: {
//                         name: `Order #${order.id} for ${order.student.name}`,
//                     },
//                     unit_amount: amount || 50000,
//                 },
//                 quantity: 1,
//             }];

//         const session = await stripe.checkout.sessions.create({
//             payment_method_types: ["card"],
//             line_items,
//             mode: "payment",
//             success_url: `${process.env.LOCAL_FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//             cancel_url: `${process.env.LOCAL_FRONTEND_URL}/payment-cancelled`,
//             metadata: {
//                 orderId: order.id.toString(),
//             },
//         });

//         res.json({ success: true, url: session.url });
//     } catch (error) {
//         console.error("Stripe Session Error:", error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

export const createCheckoutSession = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({
                success: false,
                message: "Order ID is required"
            });
        }

        const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Directly mark order as completed
        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: {
                process_status: "completed",
                is_locked: true,
            },
        });

        return res.json({
            success: true,
            message: "Order completed successfully (Manual mode)"
        });

    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
export const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody || req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("Webhook Error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.metadata.orderId;

    try {
        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: {
                process_status: "completed",
                is_locked: true,
            },
        });
        console.log(`Order ${orderId} marked as completed.`);
    } catch (error) {
        console.error(`Error updating order ${orderId}:`, error.message);
    }
    // }

    res.json({ received: true });
};
