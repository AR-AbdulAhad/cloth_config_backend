import Stripe from "stripe";
import prisma from "../config/prisma.js";
import dotenv from "dotenv";

dotenv.config();

// Check if Stripe key is valid and initialize
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        console.log('✅ Stripe initialized successfully');
    } else {
        console.warn('⚠️ Stripe key not configured or invalid. Using mock payment mode.');
    }
} catch (error) {
    console.error('❌ Stripe initialization failed:', error.message);
    console.warn('⚠️ Falling back to mock payment mode.');
    stripe = null;
}

export const createCheckoutSession = async (req, res) => {
    try {
        const { orderId, amount } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) },
            include: { student: true, order_items: true }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // Check if Stripe is properly configured
        if (!stripe) {
            console.warn('⚠️ Stripe not configured. Using mock payment mode.');
            console.warn('Fix: Update STRIPE_SECRET_KEY in .env with sk_test_... or sk_live_...');
            
            // Mock payment - directly mark order as completed
            await prisma.order.update({
                where: { id: parseInt(orderId) },
                data: {
                    process_status: "completed",
                    is_locked: true,
                },
            });

            return res.json({
                success: true,
                message: "Order completed (Mock mode - Stripe key invalid)",
                mode: "mock",
                note: "Please configure STRIPE_SECRET_KEY with a valid secret key (sk_test_...)"
            });
        }

        // Stripe is configured - create checkout session
        const line_items = order.order_items.length > 0
            ? order.order_items.map(item => ({
                price_data: {
                    currency: "dkk",
                    product_data: {
                        name: `${item.product_type} (${item.selectedSize}, ${item.selectedColor})`,
                    },
                    unit_amount: amount ? Math.round(amount / order.order_items.length) : 50000,
                },
                quantity: 1,
            }))
            : [{
                price_data: {
                    currency: "dkk",
                    product_data: {
                        name: `Order #${order.id} for ${order.student.name}`,
                    },
                    unit_amount: amount || 50000,
                },
                quantity: 1,
            }];

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            success_url: `${process.env.LOCAL_FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.LOCAL_FRONTEND_URL}/payment-cancelled`,
            metadata: {
                orderId: order.id.toString(),
            },
        });

        res.json({ success: true, url: session.url, mode: "stripe" });
    } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// export const createCheckoutSession = async (req, res) => {
//     try {
//         const { orderId } = req.body;

//         if (!orderId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Order ID is required"
//             });
//         }

//         const order = await prisma.order.findUnique({
//             where: { id: parseInt(orderId) }
//         });

//         if (!order) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Order not found"
//             });
//         }

//         // Directly mark order as completed
//         await prisma.order.update({
//             where: { id: parseInt(orderId) },
//             data: {
//                 process_status: "completed",
//                 is_locked: true,
//             },
//         });

//         return res.json({
//             success: true,
//             message: "Order completed successfully (Manual mode)"
//         });

//     } catch (error) {
//         console.error("Checkout Error:", error);
//         res.status(500).json({
//             success: false,
//             error: error.message
//         });
//     }
// };
export const stripeWebhook = async (req, res) => {
    // Check if Stripe is configured
    if (!stripe) {
        console.warn('⚠️ Stripe webhook called but Stripe not configured');
        return res.status(503).json({ 
            error: "Stripe not configured properly" 
        });
    }

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
