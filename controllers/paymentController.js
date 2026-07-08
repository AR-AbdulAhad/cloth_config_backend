import Stripe from "stripe";
import prisma from "../config/prisma.js";
import dotenv from "dotenv";
import { calculateHandlingFeePerStudent, calculateOrderTotal } from "../utils/feeCalculator.js";

dotenv.config();

// ── Stripe init ───────────────────────────────────────────────────────────────
let stripe = null;
try {
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
        stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    } else {
        console.warn('⚠️  Stripe key not configured. Using mock payment mode.');
    }
} catch (error) {
    console.error('❌  Stripe initialization failed:', error.message);
    stripe = null;
}

// ── Shared price helpers ──────────────────────────────────────────────────────
const DEFAULT_PRICES = {
    'T-SHIRT': 200, 'SWEATSHIRT': 350, 'HOODIE': 450,
    'ZIPPERHOODIE': 500, 'SWEATPANTS': 300, 'SHORTS': 250
};

async function getGarmentPrices() {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'price_' } } });
    const PRICES = Object.fromEntries(rows.map(s => [s.key.replace('price_', ''), parseFloat(s.value)]));
    return (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;
}

async function getShippingCostForOrder(deliveryDetails) {
    const normalizedDetails = typeof deliveryDetails === 'string'
        ? (() => {
            try {
                return JSON.parse(deliveryDetails);
            } catch {
                return null;
            }
        })()
        : deliveryDetails;

    const countryName = normalizedDetails?.country || '';
    if (!countryName) return 0;

    const deliveryType = normalizedDetails?.deliveryType || 'regular';
    const shippingRate = await prisma.shippingRate.findFirst({
        where: { country_name: countryName },
        select: { regular_delivery_rate: true, express_delivery_rate: true }
    });

    if (!shippingRate) return 0;

    const selectedRate = deliveryType === 'express'
        ? Number(shippingRate.express_delivery_rate ?? 0)
        : Number(shippingRate.regular_delivery_rate ?? 0);

    return Math.round(selectedRate * 100) / 100;
}

export const createCheckoutSession = async (req, res) => {
    try {
        const { orderId } = req.body;
        const studentId = req.user.id;

        if (!orderId) return res.status(400).json({ success: false, message: "Order ID is required" });

        if (!stripe) {
            return res.status(503).json({ success: false, message: "Payment system not configured", error: "Stripe key missing" });
        }

        // Fetch order
        const order = await prisma.order.findFirst({
            where: { id: parseInt(orderId), student_id: studentId, status: { not: 2 } },
            include: { order_items: { where: { status: { not: 2 } } }, class: true }
        });

        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        // Allowed statuses for payment
        const payableStatuses = ['on_hold', 'locked_awaiting_payment', 'pending_payment', 'partial_paid'];
        if (!payableStatuses.includes(order.process_status)) {
            return res.status(403).json({
                success: false,
                message: `Payment not allowed. Order status is '${order.process_status}'.`
            });
        }

        const totalAmount = parseFloat(order.total_amount || 0);
        const amountPaid = parseFloat(order.amount_paid || 0);
        const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

        // Already fully paid
        if (balanceDue <= 0) {
            await prisma.order.update({
                where: { id: order.id },
                data: { process_status: 'paid', paid_at: new Date(), payment_status: 'paid', is_locked: true }
            });
            return res.json({ success: true, message: "Order is already fully paid.", no_payment_needed: true });
        }

        // Build line items — show individual products if partial payment
        const getPriceForType = await getGarmentPrices();
        let line_items;

        if (order.process_status === 'partial_paid' && amountPaid > 0) {
            // Show each extra product as a separate line item
            const getPaidTypes = () => {
                let runningPaid = 0;
                const paid = [], unpaid = [];
                for (const item of order.order_items) {
                    const price = getPriceForType(item.product_type);
                    if (runningPaid + price <= amountPaid + 0.001) {
                        paid.push(item);
                        runningPaid += price;
                    } else {
                        unpaid.push(item);
                    }
                }
                return unpaid;
            };
            const extraItems = getPaidTypes();

            if (extraItems.length > 0) {
                line_items = extraItems.map(item => ({
                    price_data: {
                        currency: "dkk",
                        product_data: {
                            name: `${item.product_type} — ${item.selectedColor || ''} / ${item.selectedSize || ''}`,
                            description: `Additional item for Order #${order.id}`
                        },
                        unit_amount: Math.round(getPriceForType(item.product_type) * 100)
                    },
                    quantity: 1
                }));
            } else {
                // Fallback: single line
                line_items = [{
                    price_data: {
                        currency: "dkk",
                        product_data: { name: `Additional payment for Order #${order.id}`, description: `Balance: ${balanceDue.toFixed(2)} DKK` },
                        unit_amount: Math.round(balanceDue * 100)
                    },
                    quantity: 1
                }];
            }
        } else {
            // First-time payment — show each garment
            if (order.order_items.length > 0) {
                line_items = order.order_items.map(item => ({
                    price_data: {
                        currency: "dkk",
                        product_data: {
                            name: `${item.product_type} — ${item.selectedColor || ''} / ${item.selectedSize || ''}`,
                            description: `Order #${order.id}`
                        },
                        unit_amount: Math.round(getPriceForType(item.product_type) * 100)
                    },
                    quantity: 1
                }));
            } else {
                line_items = [{
                    price_data: {
                        currency: "dkk",
                        product_data: { name: `Payment for Order #${order.id}`, description: `Total: ${balanceDue.toFixed(2)} DKK` },
                        unit_amount: Math.round(balanceDue * 100)
                    },
                    quantity: 1
                }];
            }
        }

        // Reconcile — the per-garment line items above don't include the handling
        // fee (or any other component baked into total_amount). Without this, Stripe
        // would always collect less than balanceDue, leaving the order permanently
        // stuck on 'partial_paid' even after a single, complete checkout.
        const lineItemsTotal = line_items.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0) / 100;
        const adjustment = Math.round((balanceDue - lineItemsTotal) * 100) / 100;
        if (adjustment > 0.01) {
            line_items.push({
                price_data: {
                    currency: "dkk",
                    product_data: { name: "Handling Fee", description: `Order #${order.id}` },
                    unit_amount: Math.round(adjustment * 100)
                },
                quantity: 1
            });
        } else if (adjustment < -0.01) {
            console.warn(`Line items (${lineItemsTotal} DKK) exceed balanceDue (${balanceDue} DKK) for order ${order.id}`);
        }

        // Save history before redirect
        try {
            await prisma.orderHistory.create({
                data: {
                    order_id: order.id,
                    action: order.process_status === 'partial_paid' ? 'additional_payment_initiation' : 'payment_initiation',
                    changed_by: studentId,
                    version: order.version,
                    changes: {
                        previousLogo: order.selected_logo_id,
                        previousDelivery: order.delivery_details,
                        previousItems: order.order_items,
                        previousTotal: order.total_amount,
                        amountPaid: amountPaid,
                        balanceDue: balanceDue
                    },
                    changes_summary: `Version ${order.version} — ${order.process_status === 'partial_paid' ? 'additional' : 'first'} payment of ${balanceDue.toFixed(2)} DKK initiated.`
                }
            });
        } catch (histErr) {
            console.error("History save before payment failed:", histErr.message);
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items,
            mode: "payment",
            success_url: `${process.env.LIVE_FRONTEND_URL}payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.LIVE_FRONTEND_URL}payment-cancelled`,
            metadata: {
                order_id: order.id.toString(),
                payment_type: order.process_status === 'partial_paid' ? 'additional' : 'first',
                balance_due: balanceDue.toString()
            }
        });

        await prisma.order.update({
            where: { id: order.id },
            data: {
                stripe_session_id: session.id,
                process_status: 'on_hold'
            }
        });

        res.json({ success: true, url: session.url, session_id: session.id, order_id: order.id, balance_due: balanceDue });

    } catch (error) {
        console.error("Stripe Session Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// applyPaymentToOrder
//
// Shared finalization logic for a completed Stripe Checkout Session.
// Called from both the Stripe webhook AND the verify-session fallback below,
// since webhooks can't reach a local/unconfigured server and Stripe may also
// redeliver the same event more than once.
//
// Idempotent: if this session's payment_intent was already applied to the
// order, it's a no-op.
// ─────────────────────────────────────────────────────────────────────────────
async function applyPaymentToOrder(session, io) {
    const order_id = parseInt(session.metadata.order_id);

    const order = await prisma.order.findUnique({
        where: { id: order_id },
        include: { class: { select: { change_deadline: true } } }
    });

    if (!order) {
        console.error(`applyPaymentToOrder: order ${order_id} not found`);
        return null;
    }

    // Already processed (webhook + fallback both fired, or Stripe redelivered the event)
    if (order.stripe_payment_intent && order.stripe_payment_intent === session.payment_intent) {
        return { order, isFullyPaid: order.process_status === 'paid', alreadyProcessed: true };
    }

    const sessionAmountDKK = session.amount_total / 100;
    const prevAmountPaid = parseFloat(order.amount_paid || 0);
    const newAmountPaid = Math.round((prevAmountPaid + sessionAmountDKK) * 100) / 100;
    const totalAmount = parseFloat(order.total_amount || 0);
    const newBalanceDue = Math.max(0, Math.round((totalAmount - newAmountPaid) * 100) / 100);

    // Determine final status
    const isFullyPaid = newBalanceDue <= 0;

    // edit_deadline = payment_date + 3 business days
    // This is the window in which student can add more products
    // Set only when fully paid for the first time
    const addBusinessDays = (startDate, days) => {
        let date = new Date(startDate);
        let count = 0;
        while (count < days) {
            date.setDate(date.getDate() + 1);
            const day = date.getDay();
            if (day !== 0 && day !== 6) count++; // skip weekends
        }
        return date;
    };

    let editDeadline = order.edit_deadline;
    if (isFullyPaid && !editDeadline) {
        // First full payment → open 3-business-day edit window from now
        editDeadline = addBusinessDays(new Date(), 3);
    }

    const newProcessStatus = isFullyPaid ? 'paid' : 'partial_paid';
    const newPaymentStatus = isFullyPaid ? 'paid' : 'partial';

    await prisma.order.update({
        where: { id: order_id },
        data: {
            amount_paid: newAmountPaid,
            payment_status: newPaymentStatus,
            process_status: newProcessStatus,
            // Unlock for editing during window; lock only when fully paid and window closed
            is_locked: false,  // always allow editing until edit_deadline
            paid_at: isFullyPaid && !order.paid_at ? new Date() : order.paid_at,
            edit_deadline: editDeadline,
            status: 1,
            stripe_payment_intent: session.payment_intent,
            stripe_session_id: session.id
        }
    });

    // Update item statuses only when fully paid
    if (isFullyPaid) {
        await prisma.orderItem.updateMany({
            where: { order_id },
            data: { status: 1 }
        });
    }

    // Auto-generate production files (only when fully paid, in background)
    if (isFullyPaid) {
        setImmediate(async () => {
            try {
                const { generatePDF } = await import("../utils/pdfGenerator.js");
                const { generateExcel } = await import("../utils/excelGenerator.js");

                const orderWithDetails = await prisma.order.findUnique({
                    where: { id: order_id },
                    include: {
                        student: { select: { name: true, email: true } },
                        class: { select: { id: true, name: true } },
                        logo: { select: { file_path: true } },
                        order_items: { where: { status: { not: 2 } } }
                    }
                });

                if (!orderWithDetails || orderWithDetails.order_items.length === 0) return;

                const nameList = await prisma.nameList.findFirst({
                    where: { class_id: orderWithDetails.class.id },
                    include: { items: { orderBy: { position: 'asc' } } }
                });

                const results = orderWithDetails.order_items.map(item => ({
                    class_name: orderWithDetails.class.name,
                    student_name: orderWithDetails.student.name,
                    student_email: orderWithDetails.student.email,
                    product_type: item.product_type,
                    color: item.selectedColor,
                    size: item.selectedSize,
                    design_config: item.design_config,
                    logo_path: orderWithDetails.logo?.file_path || null,
                    name_list: nameList?.items.map(ni => ni.name).join(', ') || null
                }));

                const pkg = await prisma.productionPackage.create({
                    data: {
                        class_id: orderWithDetails.class.id,
                        package_name: `Order_${order_id}_${orderWithDetails.student.name}_${Date.now()}`,
                        production_status: "processing"
                    }
                });

                const [pdfPath, excelPath] = await Promise.all([generatePDF(results), generateExcel(results)]);

                await prisma.productionPackage.update({
                    where: { id: pkg.id },
                    data: { pdf_file_path: pdfPath, excel_file_path: excelPath, production_status: "ready" }
                });
            } catch (prodErr) {
                console.error("Auto production file generation failed:", prodErr.message);
            }
        });
    }

    // Socket events
    if (io) {
        io.emit(`order_update_${order.student_id}`, {
            action: isFullyPaid ? 'payment_received' : 'partial_payment_received',
            payment_status: newPaymentStatus,
            process_status: newProcessStatus,
            amount_paid: newAmountPaid,
            balance_due: newBalanceDue
        });
        io.emit('new_order_admin', { studentId: order.student_id, action: isFullyPaid ? 'paid' : 'partial_paid' });
    }

    return { order, isFullyPaid };
}

// ─────────────────────────────────────────────────────────────────────────────
// stripeWebhook
//
// Handles both first payment and additional (partial) payment.
// After full payment, sets edit_deadline = class change_deadline so the student
// can still edit inside the allowed window.
// ─────────────────────────────────────────────────────────────────────────────
async function revertOrderIfUnpaid(session) {
    const order_id = parseInt(session.metadata.order_id);

    const order = await prisma.order.findUnique({ where: { id: order_id } });
    if (!order) return null;

    // A newer session may have replaced this one, or payment already succeeded
    if (order.stripe_session_id !== session.id) return order;
    if (order.process_status !== 'pending_payment') return order;

    const wasFirstPayment = session.metadata.payment_type === 'first';

    // Give the student a fresh hold window so the lock-cron doesn't
    // immediately re-lock the order right after we revert it.
    const newHoldDeadline = new Date();
    newHoldDeadline.setDate(newHoldDeadline.getDate() + 5); // adjust to match your hold-window length

    const updated = await prisma.order.update({
        where: { id: order_id },
        data: {
            process_status: 'on_hold',
            stripe_session_id: null,
            is_locked: false,
            locked_at: null,
            hold_deadline: newHoldDeadline
        }
    });

    return updated;
}
export const stripeWebhook = async (req, res) => {
    if (!stripe) {
        return res.status(503).json({ error: "Stripe not configured properly" });
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
        try {
            await applyPaymentToOrder(event.data.object, req.app.get('io'));
        } catch (error) {
            console.error(`❌ Error updating order after payment:`, error);
        }
    } else if (event.type === "checkout.session.expired") {
        try {
            await revertOrderIfUnpaid(event.data.object);
        } catch (error) {
            console.error(`❌ Error reverting order after expired session:`, error);
        }
    }

    res.json({ received: true });
};

// ─────────────────────────────────────────────────────────────────────────────
// verifyPaymentSession
//
// Fallback for the success page. Webhooks can't reach a local/dev server
// (no public URL configured), so instead of only waiting for the webhook,
// the frontend calls this right after Stripe redirects back with a
// session_id — it asks Stripe directly whether the session was paid, and
// applies the same update the webhook would have applied.
// GET /payment/verify-session/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
export const verifyPaymentSession = async (req, res) => {
    try {
        if (!stripe) {
            return res.status(503).json({ success: false, message: "Payment system not configured" });
        }

        const { sessionId } = req.params;
        const studentId = req.user.id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const orderId = parseInt(session.metadata?.order_id);

        // Scope to the requesting student so a session can't be used to credit someone else's order
        const order = await prisma.order.findFirst({
            where: { id: orderId, student_id: studentId, status: { not: 2 } }
        });
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        if (session.payment_status !== "paid") {
            return res.json({
                success: true,
                applied: false,
                payment_status: session.payment_status,
                process_status: order.process_status
            });
        }

        await applyPaymentToOrder(session, req.app.get('io'));

        const updated = await prisma.order.findUnique({ where: { id: orderId } });
        return res.json({
            success: true,
            applied: true,
            payment_status: updated.payment_status,
            process_status: updated.process_status
        });

    } catch (error) {
        console.error("verifyPaymentSession error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// getOrderPaymentBreakdown
//
// Returns a per-product payment breakdown for the student's current order.
// Shows which products are paid and which still need payment.
// GET /payment/breakdown/:orderId
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderPaymentBreakdown = async (req, res) => {
    try {
        const { orderId } = req.params;
        const studentId = req.user.id;

        const order = await prisma.order.findFirst({
            where: { id: parseInt(orderId), student_id: studentId, status: { not: 2 } },
            include: { order_items: { where: { status: { not: 2 } }, orderBy: { created_at: 'asc' } }, class: true }
        });

        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        const getPriceForType = await getGarmentPrices();

        const totalAmount = parseFloat(order.total_amount || 0);
        const amountPaid = parseFloat(order.amount_paid || 0);
        const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

        // Classify each product as paid vs unpaid
        // We assume amount_paid covers products in creation order (oldest first)
        let runningPaid = 0;
        const products = order.order_items.map(item => {
            const price = getPriceForType(item.product_type);
            const isPaid = runningPaid + price <= amountPaid + 0.001;
            if (isPaid) runningPaid += price;
            return {
                id: item.id,
                product_type: item.product_type,
                color: item.selectedColor,
                size: item.selectedSize,
                price,
                is_paid: isPaid
            };
        });

        const paidProducts = products.filter(p => p.is_paid);
        const unpaidProducts = products.filter(p => !p.is_paid);

        const now = new Date();
        const editWindowOpen = order.edit_deadline ? now < new Date(order.edit_deadline) : false;

        res.json({
            success: true,
            data: {
                order_id: order.id,
                process_status: order.process_status,
                payment_status: order.payment_status,
                total_amount: totalAmount,
                amount_paid: amountPaid,
                balance_due: balanceDue,
                products,
                paid_products: paidProducts,
                unpaid_products: unpaidProducts,
                edit_window_open: editWindowOpen,
                edit_deadline: order.edit_deadline,
                class_deadline: order.class?.change_deadline
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// getOrderPricing  (used by order modal before placing)
// POST /payment/calculate-pricing
// ─────────────────────────────────────────────────────────────────────────────
export const getOrderPricing = async (req, res) => {
    try {
        const { garments, classId, delivery_details } = req.body;

        if (!garments || !Array.isArray(garments))
            return res.status(400).json({ success: false, message: "Garments array is required" });

        const getPriceForType = await getGarmentPrices();

        let subtotal = 0;
        const perProduct = garments.map(item => {
            const price = getPriceForType(item.product_type);
            subtotal += price;
            return { product_type: item.product_type, price };
        });

        const handlingFee = classId ? await calculateHandlingFeePerStudent(classId) : 0;
        const shippingFee = await getShippingCostForOrder(delivery_details);
        const total = Math.round((subtotal + handlingFee + shippingFee) * 100) / 100;

        res.json({
            success: true,
            pricing: {
                per_product: perProduct,
                subtotal,
                handlingFee,
                shippingFee,
                subtotalWithHandling: Math.round((subtotal + handlingFee) * 100) / 100,
                total
            }
        });
    } catch (error) {
        console.error("Pricing calculation error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// testAmount  (dev only)
// ─────────────────────────────────────────────────────────────────────────────
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
