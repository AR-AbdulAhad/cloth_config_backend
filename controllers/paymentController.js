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
        const { orderId } = req.body;
        const studentId = req.user.id;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        if (!stripe) {
            console.warn('⚠️ Stripe not configured.');
            return res.status(503).json({
                success: false,
                message: "Payment system not configured",
                error: "Stripe key missing"
            });
        }

        // Fetch existing order with items
        const order = await prisma.order.findFirst({
            where: {
                id: parseInt(orderId),
                student_id: studentId,
                status: { not: 2 }
            },
            include: {
                order_items: { where: { status: { not: 2 } } },
                class: true
            }
        });

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Only allow checkouts when status is locked_awaiting_payment or already pending_payment
        if (order.process_status !== 'locked_awaiting_payment' && order.process_status !== 'pending_payment') {
            return res.status(403).json({
                success: false,
                message: `Payment is not allowed. Order is currently in '${order.process_status}' state. It must be locked first.`
            });
        }

        const balanceDue = parseFloat(order.total_amount || 0) - parseFloat(order.amount_paid || 0);

        if (balanceDue <= 0) {
            await prisma.order.update({
                where: { id: order.id },
                data: { 
                    process_status: 'paid', 
                    paid_at: new Date(), 
                    payment_status: 'paid',
                    is_locked: true
                }
            });
            return res.json({
                success: true,
                message: "Order is already paid.",
                no_payment_needed: true
            });
        }

        // Save history before payment redirect
        await prisma.orderHistory.create({
            data: {
                order_id: order.id,
                action: 'payment_initiation',
                changed_by: studentId,
                version: order.version,
                changes: {
                    previousLogo: order.selected_logo_id,
                    previousDelivery: order.delivery_details,
                    previousItems: order.order_items,
                    previousTotal: order.total_amount
                },
                changes_summary: `Version ${order.version} saved before redirect to payment.`
            }
        });

        // Create Stripe Session
        const stripeUnitAmount = Math.round(balanceDue * 100);

        const line_items = [{
            price_data: {
                currency: "dkk",
                product_data: {
                    name: `Payment for Order #${order.id}`,
                    description: `Total amount including VAT: ${balanceDue.toFixed(2)} DKK`,
                },
                unit_amount: stripeUnitAmount,
            },
            quantity: 1,
        }];

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            success_url: `${process.env.LIVE_FRONTEND_URL}payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.LIVE_FRONTEND_URL}payment-cancelled`,
            metadata: {
                order_id: order.id.toString()
            },
        });

        // Update with session ID and transition status to pending_payment
        await prisma.order.update({
            where: { id: order.id },
            data: { 
                stripe_session_id: session.id,
                process_status: 'pending_payment'
            }
        });

        res.json({
            success: true,
            url: session.url,
            session_id: session.id,
            order_id: order.id
        });

    } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).json({ success: false, message: error.message });
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
                const payment_status = "paid";
                const process_status = "paid";

                // Update the order and record paid timestamp
                await prisma.order.update({
                    where: { id: order_id },
                    data: {
                        amount_paid: amountPaidThisSession,
                        payment_status: payment_status,
                        process_status: process_status,
                        is_locked: true, // Remain locked after payment
                        paid_at: new Date(),
                        status: 1,
                        stripe_payment_intent: session.payment_intent,
                        stripe_session_id: session.id
                    }
                });

                await prisma.orderItem.updateMany({
                    where: { order_id: order_id },
                    data: { status: 1 }
                });

                // --- Auto-generate production files in background (non-blocking) ---
                setImmediate(async () => {
                    try {
                        const { generatePDF } = await import("../utils/pdfGenerator.js");
                        const { generateExcel } = await import("../utils/excelGenerator.js");

                        const orderWithDetails = await prisma.order.findUnique({
                            where: { id: order_id },
                            include: {
                                student:     { select: { name: true, email: true } },
                                class:       { select: { id: true, name: true } },
                                logo:        { select: { file_path: true } },
                                order_items: { where: { status: { not: 2 } } }
                            }
                        });

                        if (!orderWithDetails || orderWithDetails.order_items.length === 0) return;

                        const nameList = await prisma.nameList.findFirst({
                            where: { class_id: orderWithDetails.class.id },
                            include: { items: { orderBy: { position: 'asc' } } }
                        });

                        const results = orderWithDetails.order_items.map(item => ({
                            class_name:    orderWithDetails.class.name,
                            student_name:  orderWithDetails.student.name,
                            student_email: orderWithDetails.student.email,
                            product_type:  item.product_type,
                            color:         item.selectedColor,
                            size:          item.selectedSize,
                            design_config: item.design_config,
                            logo_path:     orderWithDetails.logo?.file_path || null,
                            name_list:     nameList?.items.map(ni => ni.name).join(', ') || null
                        }));

                        const pkg = await prisma.productionPackage.create({
                            data: {
                                class_id:          orderWithDetails.class.id,
                                package_name:      `Order_${order_id}_${orderWithDetails.student.name}_${Date.now()}`,
                                production_status: "processing"
                            }
                        });

                        const [pdfPath, excelPath] = await Promise.all([
                            generatePDF(results),
                            generateExcel(results)
                        ]);

                        await prisma.productionPackage.update({
                            where: { id: pkg.id },
                            data: { pdf_file_path: pdfPath, excel_file_path: excelPath, production_status: "ready" }
                        });
                    } catch (prodErr) {
                        console.error("Auto production file generation failed in webhook:", prodErr.message);
                    }
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