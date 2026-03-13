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

// export const createCheckoutSession = async (req, res) => {
//     try {
//         const { orderData, amount } = req.body;

//         if (!orderData) {
//             return res.status(400).json({ success: false, message: "Order data is required" });
//         }

//         if (!stripe) {
//             console.warn('⚠️ Stripe not configured.');
//             return res.status(503).json({ 
//                 success: false, 
//                 message: "Payment system not configured",
//                 error: "Stripe key missing"
//             });
//         }

//         // Pehle database mein pending order create karo
//         const pendingOrder = await prisma.order.create({
//             data: {
//                 student_id: orderData.student_id,
//                 class_id: orderData.class_id,
//                 delivery_details: JSON.stringify(orderData.delivery_details),
//                 selected_logo_id: null,
//                 process_status: "pending_payment", // New status
//                 is_locked: false,
//                 status: 0,
//                 stripe_payment_intent: null,
//                 stripe_session_id: null
//             }
//         });

//         // Ab order items create karo
//         await prisma.orderItem.createMany({
//             data: orderData.garments.map(item => ({
//                 order_id: pendingOrder.id,
//                 product_type: item.product_type,
//                 selectedColor: item.selectedColor,
//                 selectedSize: item.selectedSize,
//                 design_config: item.design_config || {},
//                 status: 0
//             }))
//         });

//         console.log(`✅ Pending order ${pendingOrder.id} created`);

//         const line_items = orderData.garments.map(item => ({
//             price_data: {
//                 currency: "dkk",
//                 product_data: {
//                     name: `${item.product_type}`,
//                     description: `Size: ${item.selectedSize || 'N/A'}, Color: ${item.selectedColor || 'N/A'}`,
//                 },
//                 unit_amount: Math.round(amount / orderData.garments.length),
//             },
//             quantity: 1,
//         }));

//         // Sirf order ID bhejo metadata mein - yeh chhota hai
//         const session = await stripe.checkout.sessions.create({
//             payment_method_types: ["card"],
//             line_items,
//             mode: "payment",
//             success_url: `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//             cancel_url: `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/payment-cancelled`,
//             metadata: {
//                 order_id: pendingOrder.id.toString() // Sirf order ID
//             },
//         });

//         // Order ko update karo with session ID
//         await prisma.order.update({
//             where: { id: pendingOrder.id },
//             data: {
//                 stripe_session_id: session.id
//             }
//         });

//         res.json({ success: true, url: session.url, session_id: session.id, order_id: pendingOrder.id });
//     } catch (error) {
//         console.error("Stripe Session Error:", error);
//         res.status(500).json({ success: false, error: error.message });
//     }
// };

export const createCheckoutSession = async (req, res) => {
    try {
        const { orderData, amount } = req.body;

        if (!orderData) {
            return res.status(400).json({ success: false, message: "Order data is required" });
        }

        if (!stripe) {
            console.warn('⚠️ Stripe not configured.');
            return res.status(503).json({ 
                success: false, 
                message: "Payment system not configured",
                error: "Stripe key missing"
            });
        }

        const classInfo = await prisma.classes.findUnique({
            where: { id: orderData.class_id },
            select: { change_deadline: true }
        });

        if (!classInfo) {
            return res.status(404).json({
                success: false,
                message: "Class not found"
            });
        }

        const currentDate = new Date();
        // Remove time part for date-only comparison
        currentDate.setHours(0, 0, 0, 0);

        if (classInfo.change_deadline) {
            const deadlineDate = new Date(classInfo.change_deadline);
            deadlineDate.setHours(0, 0, 0, 0);

            // Agar deadline current date se pehle hai (past date)
            if (deadlineDate < currentDate) {
                return res.status(400).json({
                    success: false,
                    message: "Order deadline has passed. Orders can no longer be placed for this class.",
                    deadline_passed: true,
                    deadline_date: classInfo.change_deadline
                });
            }

            // Agar deadline aaj ki date hai ya future mein hai - order allowed
            console.log(`✅ Deadline check passed: Deadline (${deadlineDate}) >= Current (${currentDate})`);
        } else {
            console.log(`⚠️ No deadline set for class ${orderData.class_id}, allowing order placement`);
        }

        // Pehle database mein pending order create karo
        const pendingOrder = await prisma.order.create({
            data: {
                student_id: orderData.student_id,
                class_id: orderData.class_id,
                delivery_details: JSON.stringify(orderData.delivery_details),
                selected_logo_id: null,
                process_status: "pending_payment",
                is_locked: false,
                status: 0,
                stripe_payment_intent: null,
                stripe_session_id: null
            }
        });

        // Ab order items create karo
        await prisma.orderItem.createMany({
            data: orderData.garments.map(item => ({
                order_id: pendingOrder.id,
                product_type: item.product_type,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                design_config: item.design_config || {},
                status: 0
            }))
        });

        console.log(`✅ Pending order ${pendingOrder.id} created`);

        const line_items = orderData.garments.map(item => ({
            price_data: {
                currency: "dkk",
                product_data: {
                    name: `${item.product_type}`,
                    description: `Size: ${item.selectedSize || 'N/A'}, Color: ${item.selectedColor || 'N/A'}`,
                },
                unit_amount: Math.round(amount / orderData.garments.length),
            },
            quantity: 1,
        }));

        // Sirf order ID bhejo metadata mein - yeh chhota hai
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            success_url: `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.LIVE_FRONTEND_URL || 'http://localhost:3000'}/payment-cancelled`,
            metadata: {
                order_id: pendingOrder.id.toString()
            },
        });

        // Order ko update karo with session ID
        await prisma.order.update({
            where: { id: pendingOrder.id },
            data: {
                stripe_session_id: session.id
            }
        });

        res.json({ 
            success: true, 
            url: session.url, 
            session_id: session.id, 
            order_id: pendingOrder.id 
        });

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

    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        
        try {
            const order_id = parseInt(session.metadata.order_id);
            
            console.log(`✅ Payment completed for order ${order_id}`);

            // Update existing pending order to completed
            await prisma.order.update({
                where: { id: order_id },
                data: {
                    process_status: "completed",
                    is_locked: false,
                    status: 1,
                    stripe_payment_intent: session.payment_intent,
                    stripe_session_id: session.id
                }
            });

            await prisma.orderItem.updateMany({
                where: { order_id: order_id },
                data: { status: 1 }
            });

            console.log(`✅ Order ${order_id} completed successfully`);
            
        } catch (error) {
            console.error(`❌ Error updating order after payment:`, error);
        }
    }

    res.json({ received: true });
};