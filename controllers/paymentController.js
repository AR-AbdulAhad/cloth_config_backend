import Stripe from "stripe";
import prisma from "../config/prisma.js";
import dotenv from "dotenv";
import { calculateOrderTotal } from "../utils/feeCalculator.js";

dotenv.config();

// Check if Stripe key is valid and initialize
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
        const { orderData, amount } = req.body;


        if (!orderData) {
            return res.status(400).json({ success: false, message: "Order data is required" });
        }

        if (!amount || amount <= 0) {
            console.error(`❌ Invalid amount received: ${amount} (type: ${typeof amount})`);
            return res.status(400).json({ success: false, message: "Valid amount is required" });
        }

        if (!stripe) {
            console.warn('⚠️ Stripe not configured.');
            return res.status(503).json({
                success: false,
                message: "Payment system not configured",
                error: "Stripe key missing"
            });
        }

        const studentId = parseInt(orderData.student_id);
        const classId = parseInt(orderData.class_id);
        const finalTotal = parseFloat(amount); // Use amount from frontend (already includes VAT)


        const classInfo = await prisma.classes.findUnique({
            where: { id: classId },
            select: { change_deadline: true }
        });

        if (!classInfo) {
            return res.status(404).json({ success: false, message: "Class not found" });
        }

        const now = new Date();
        if (classInfo.change_deadline && now > new Date(classInfo.change_deadline)) {
            return res.status(400).json({
                success: false,
                message: "Order deadline has passed. Orders can no longer be placed.",
                deadline_passed: true
            });
        }

        // --- Fetch garment prices for VAT breakdown display only ---
        const priceSettings = await prisma.setting.findMany({
            where: { key: { startsWith: 'price_' } }
        });
        const PRICES = Object.fromEntries(
            priceSettings.map(s => [s.key.replace('price_', ''), parseFloat(s.value)])
        );
        const DEFAULT_PRICES = { 'T-SHIRT': 200, 'SWEATSHIRT': 350, 'HOODIE': 450, 'ZIPPERHOODIE': 500, 'SWEATPANTS': 300, 'SHORTS': 250 };
        const getPriceForType = (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;

        let subtotal = 0;
        orderData.garments.forEach(item => {
            subtotal += getPriceForType(item.product_type);
        });

        // --- Calculate VAT breakdown for display purposes ---
        const orderCalculation = await calculateOrderTotal(subtotal, classId);

        // --- Check Existing Order & Apply Versioning ---
        const existingOrder = await prisma.order.findFirst({
            where: { student_id: studentId, status: { not: 2 } },
            include: { order_items: true }
        });


        let orderId;
        const currentVersion = existingOrder ? existingOrder.version : 0;
        const nextVersion = currentVersion + 1;
        // Use the amount directly from frontend (already includes VAT and all calculations)
        const balanceDue = finalTotal;


        await prisma.$transaction(async (tx) => {
            if (existingOrder) {
                if (existingOrder.is_locked) {
                    throw new Error("Order is locked and cannot be modified.");
                }

                // Check 3-business-days for editing IF UNPAID
                const alreadyPaid = parseFloat(existingOrder.amount_paid || 0);
                if (alreadyPaid <= 0) {
                    const createdAt = new Date(existingOrder.created_at);
                    let businessDaysDiff = 0;
                    let checkDate = new Date(createdAt);
                    while (checkDate < now) {
                        checkDate.setDate(checkDate.getDate() + 1);
                        if (checkDate.getDay() !== 0 && checkDate.getDay() !== 6) businessDaysDiff++;
                    }

                    if (businessDaysDiff > 3 && !existingOrder.is_locked) {
                        await tx.order.update({ where: { id: existingOrder.id }, data: { is_locked: true } });
                        throw new Error("The 3-business-day window for unpaid orders has expired.");
                    }
                }

                // Save history before update
                await tx.orderHistory.create({
                    data: {
                        order_id: existingOrder.id,
                        action: 'payment_initiation',
                        changed_by: studentId,
                        version: currentVersion,
                        changes: {
                            previousLogo: existingOrder.selected_logo_id,
                            previousDelivery: existingOrder.delivery_details,
                            previousItems: existingOrder.order_items,
                            previousTotal: existingOrder.total_amount
                        },
                        changes_summary: `Version ${currentVersion} saved before payment redirect.`
                    }
                });

                // Update existing order
                const updatedOrder = await tx.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        delivery_details: JSON.stringify(orderData.delivery_details),
                        process_status: balanceDue > 0 ? "pending_payment" : "completed",
                        total_amount: finalTotal,
                        version: nextVersion,
                        updated_at: new Date()
                    }
                });
                orderId = updatedOrder.id;

                // Refresh items
                await tx.orderItem.deleteMany({ where: { order_id: orderId } });
            } else {
                // Create new order
                const newOrder = await tx.order.create({
                    data: {
                        student_id: studentId,
                        class_id: classId,
                        delivery_details: JSON.stringify(orderData.delivery_details),
                        process_status: "pending_payment",
                        payment_status: "unpaid",
                        total_amount: finalTotal,
                        amount_paid: 0,
                        version: 1,
                        status: 0
                    }
                });
                orderId = newOrder.id;
            }

            // Create items
            const itemData = orderData.garments.map(item => ({
                order_id: orderId,
                product_type: item.product_type,
                selectedColor: item.selectedColor,
                selectedSize: item.selectedSize,
                design_config: item.design_config || {},
                status: 0
            }));
            await tx.orderItem.createMany({ data: itemData });
        });

        // --- Handle No Balance Due ---
        if (balanceDue <= 0) {
            return res.json({
                success: true,
                message: "Order updated successfully. No additional payment required.",
                no_payment_needed: true
            });
        }

        // --- Create Stripe Session ---
        const stripeUnitAmount = Math.round(balanceDue * 100);

        const line_items = [{
            price_data: {
                currency: "dkk",
                product_data: {
                    name: `Payment for Order #${orderId}`,
                    description: `Total amount including VAT: ${finalTotal.toFixed(2)} DKK`,
                },
                unit_amount: stripeUnitAmount,
            },
            quantity: 1,
        }];

      
        // Sirf order ID bhejo metadata mein - yeh chhota hai
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            success_url: `${process.env.LIVE_FRONTEND_URL}payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.LIVE_FRONTEND_URL}payment-cancelled`,
            metadata: {
                order_id: orderId.toString()
            },
        });

        // Update with session ID
        await prisma.order.update({
            where: { id: orderId },
            data: { stripe_session_id: session.id }
        });

        res.json({
            success: true,
            url: session.url,
            session_id: session.id,
            order_id: orderId
        });

    } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(error.message.includes("expired") || error.message.includes("locked") ? 403 : 500)
            .json({ success: false, message: error.message });
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
            const amountPaidThisSession = session.amount_total / 100; // Total session amount in dkk

            const order = await prisma.order.findUnique({
                where: { id: order_id }
            });

            if (order) {
                const amountPaidThisSession = session.amount_total / 100; // Total session amount in dkk

                // Since we're using full amounts from frontend, this payment completes the order
                const payment_status = "paid";
                const process_status = "completed";

                // Post-payment edit deadline: 3 days from now for delivery details
                const editDeadline = new Date();
                editDeadline.setDate(editDeadline.getDate() + 3);

                // Update the order
                await prisma.order.update({
                    where: { id: order_id },
                    data: {
                        amount_paid: amountPaidThisSession, // Set to the amount paid in this session
                        payment_status: payment_status,
                        process_status: process_status,
                        is_locked: false, // Explicitly unlock for the 3-day window
                        edit_deadline: editDeadline,
                        status: 1,
                        stripe_payment_intent: session.payment_intent,
                        stripe_session_id: session.id
                    }
                });

                await prisma.orderItem.updateMany({
                    where: { order_id: order_id },
                    data: { status: 1 }
                });


                // Emit socket events
                const io = req.app.get('io');
                if (io) {
                    io.emit(`order_update_${order.student_id}`, { action: 'payment_received', payment_status, process_status });
                    io.emit('new_order_admin', { studentId: order.student_id, action: 'paid' });
                }
            }
        } catch (error) {
            console.error(`❌ Error updating order after payment:`, error);
        }
    }

    res.json({ received: true });
};

// Get order pricing breakdown including VAT
export const getOrderPricing = async (req, res) => {
    try {
        const { garments, classId } = req.body;

        if (!garments || !Array.isArray(garments)) {
            return res.status(400).json({
                success: false,
                message: "Garments array is required"
            });
        }

        // --- Fetch garment prices from settings ---
        const priceSettings = await prisma.setting.findMany({
            where: { key: { startsWith: 'price_' } }
        });
        const PRICES = Object.fromEntries(
            priceSettings.map(s => [s.key.replace('price_', ''), parseFloat(s.value)])
        );
        const DEFAULT_PRICES = {
            'T-SHIRT': 200,
            'SWEATSHIRT': 350,
            'HOODIE': 450,
            'ZIPPERHOODIE': 500,
            'SWEATPANTS': 300,
            'SHORTS': 250
        };
        const getPriceForType = (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;

        // Calculate subtotal
        let subtotal = 0;
        garments.forEach(item => {
            subtotal += getPriceForType(item.product_type);
        });

        // Calculate complete pricing with VAT
        const orderCalculation = await calculateOrderTotal(subtotal, classId);

        res.json({
            success: true,
            pricing: {
                subtotal: orderCalculation.subtotal,
                handlingFee: orderCalculation.handlingFee,
                subtotalWithHandling: orderCalculation.subtotalWithHandling,
                vatPercentage: orderCalculation.vatPercentage,
                vatAmount: orderCalculation.vatAmount,
                total: orderCalculation.total
            }
        });

    } catch (error) {
        console.error("Pricing calculation error:", error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Test endpoint to verify amount handling
export const testAmount = async (req, res) => {
    try {
        const { amount } = req.body;
      
        res.json({
            success: true,
            received: amount,
            type: typeof amount,
            parsed: parseFloat(amount),
            stripeAmount: Math.round(parseFloat(amount) * 100),
            backToDKK: (Math.round(parseFloat(amount) * 100) / 100).toFixed(2)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};