import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOrderConfirmationEmail } from "../utils/emailService.js";
import { calculateHandlingFeePerStudent } from "../utils/feeCalculator.js";

export const studentLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required" });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ success: false, message: "User does not exist" });
        if (user.role === "admin") return res.status(404).json({ success: false, message: "Invalid email or password" });
        if (user.status === 1) return res.status(403).json({ success: false, message: "Account is inactive. Please contact support." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });

        const token = jwt.sign(
            { id: user.id, role: user.role, school_id: user.school_id, class_id: user.class_id },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );
        res.json({
            success: true, message: "Login successful", token,
            data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, school_id: user.school_id, class_id: user.class_id, status: user.status } }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Internal server error", error: err.message });
    }
};

export const getDashboardData = async (req, res) => {
    try {
        const { classId, schoolId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const [logos, logosTotal] = await Promise.all([
            prisma.logo.findMany({ where: { school_id: parseInt(schoolId), process_status: 'approved', status: { not: 2 }, ...(search && { file_path: { contains: search } }) }, skip, take: limit, orderBy: { created_at: 'desc' } }),
            prisma.logo.count({ where: { school_id: parseInt(schoolId), process_status: 'approved', status: { not: 2 }, ...(search && { file_path: { contains: search } }) } })
        ]);
        const [backDesign, backDesignTotal] = await Promise.all([
            prisma.backDesign.findMany({ where: { class_id: parseInt(classId), status: { not: 2 }, ...(search && { OR: [{ name: { contains: search } }, { file_path: { contains: search } }] }) }, skip, take: limit, orderBy: { created_at: 'desc' } }),
            prisma.backDesign.count({ where: { class_id: parseInt(classId), status: { not: 2 }, ...(search && { OR: [{ name: { contains: search } }, { file_path: { contains: search } }] }) } })
        ]);
        res.json({ success: true, data: { logos, backDesign }, pagination: { logos: { total: logosTotal, page, limit, totalPages: Math.ceil(logosTotal / limit) }, backDesign: { total: backDesignTotal, page, limit, totalPages: Math.ceil(backDesignTotal / limit) } } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const addBusinessDays = (startDate, days) => {
    let date = new Date(startDate);
    let count = 0;
    while (count < days) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) count++;
    }
    return date;
};

const getShippingCostForOrder = async (deliveryDetails) => {
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
};

// ─────────────────────────────────────────────────────────────────────────────
// PLACE ORDER  –  partial-payment aware
//
// Flow:
//  1. First order → on_hold (3 business days to pay)
//  2. Student pays → webhook sets process_status='paid', edit_deadline = class change_deadline
//  3. During edit window (edit_deadline in future) student can add more products
//  4. Adding more products recalculates total → balance_due = total - amount_paid
//     → process_status becomes 'partial_paid' if balance_due > 0
//  5. Student pays balance → webhook adds to amount_paid
//     → if amount_paid >= total → 'paid' again
// ─────────────────────────────────────────────────────────────────────────────
export const placeOrder = async (req, res) => {
    try {
        let { student_id, class_id, garments, delivery_details, logo_id } = req.body;

        // ── Input validation ──────────────────────────────────────────────────
        if (!student_id || isNaN(Number(student_id)))
            return res.status(400).json({ success: false, message: "Invalid or missing student_id." });
        if (!class_id || isNaN(Number(class_id)))
            return res.status(400).json({ success: false, message: "Invalid or missing class_id." });

        const studentId = Number(student_id);
        const classId = Number(class_id);
        const logoId = logo_id ? Number(logo_id) : null;

        if (garments && !Array.isArray(garments)) garments = [garments];
        if (garments && garments.length === 0)
            return res.status(400).json({ success: false, message: "Garments array cannot be empty." });

        if (garments) {
            for (const item of garments) {
                if (!item.product_type && !item.type)
                    return res.status(400).json({ success: false, message: "Each garment must have a product_type." });
                if (!item.selectedColor && !item.color)
                    return res.status(400).json({ success: false, message: "Each garment must have a selectedColor." });
                if (!item.selectedSize && !item.size)
                    return res.status(400).json({ success: false, message: "Each garment must have a selectedSize." });
            }
        }

        // ── Class check ───────────────────────────────────────────────────────
        const targetClass = await prisma.classes.findUnique({ where: { id: classId } });
        if (!targetClass) return res.status(404).json({ success: false, message: "Class not found." });
        if (targetClass.process_status !== 'active')
            return res.status(403).json({ success: false, message: "Class is locked. No new orders or changes allowed." });

        const now = new Date();
        if (targetClass.change_deadline) {
            const dl = new Date(targetClass.change_deadline);
            dl.setUTCHours(23, 59, 59, 999);
            if (now > dl) return res.status(403).json({ success: false, message: "Class order deadline has passed." });
        }

        // ── Find active order ─────────────────────────────────────────────────
        // Priority 1: unpaid / draft order
        let activeOrder = await prisma.order.findFirst({
            where: { student_id: studentId, class_id: classId, process_status: { in: ['on_hold', 'draft'] }, status: { not: 2 } },
            include: { order_items: true }
        });

        // Priority 2: paid/partial_paid order still inside edit window
        if (!activeOrder) {
            const paidOrder = await prisma.order.findFirst({
                where: {
                    student_id: studentId,
                    class_id: classId,
                    process_status: { in: ['partial_paid', 'paid'] },
                    status: { not: 2 },
                    edit_deadline: { gt: now }        // edit window must still be open
                },
                include: { order_items: true }
            });
            if (paidOrder) activeOrder = paidOrder;
        }

        // ── Versioning setup ──────────────────────────────────────────────────
        let versionAction = 'created';
        let previousState = null;
        const isEditAfterPayment = activeOrder &&
            ['partial_paid', 'paid'].includes(activeOrder.process_status);

        if (activeOrder) {
            versionAction = 'updated';
            previousState = await prisma.order.findUnique({
                where: { id: activeOrder.id },
                include: { order_items: true }
            });

            if (activeOrder.is_locked)
                return res.status(403).json({ success: false, message: "Order is locked and cannot be modified." });

            if (isEditAfterPayment) {
                // Edit window check
                if (!activeOrder.edit_deadline || now > new Date(activeOrder.edit_deadline))
                    return res.status(403).json({ success: false, message: "Edit window has closed. No further changes allowed." });
            } else {
                // Hold deadline check for unpaid orders
                if (activeOrder.hold_deadline && now > new Date(activeOrder.hold_deadline)) {
                    await prisma.order.update({
                        where: { id: activeOrder.id },
                        data: { is_locked: true, process_status: 'locked_awaiting_payment', locked_at: now }
                    });
                    return res.status(403).json({ success: false, message: "The 3-business-day hold period has expired. Order is now locked." });
                }
            }
        }

        // ── Price calculation ─────────────────────────────────────────────────
        const priceSettings = await prisma.setting.findMany({ where: { key: { startsWith: 'price_' } } });
        const PRICES = Object.fromEntries(priceSettings.map(s => [s.key.replace('price_', ''), parseFloat(s.value)]));
        const DEFAULT_PRICES = { 'T-SHIRT': 200, 'SWEATSHIRT': 350, 'HOODIE': 450, 'ZIPPERHOODIE': 500, 'SWEATPANTS': 300, 'SHORTS': 250 };
        const getPriceForType = (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;

        // Pricing must never depend solely on what the client sent — once an item is
        // paid for, it stays in the total even if the request omits it. So when editing
        // an already-paid order, price the preserved existing items + only the genuinely
        // new ones (mirrors exactly what the transaction below will persist).
        let pricingGarments = garments || [];
        let newOnlyGarments = garments || [];
        if (isEditAfterPayment) {
            const existingTypes = new Set((previousState?.order_items || []).map(i => i.product_type));
            newOnlyGarments = (garments || []).filter(item => !existingTypes.has(item.product_type || item.type));
            pricingGarments = [...(previousState?.order_items || []), ...newOnlyGarments];
        }

        // Per-product price breakdown (for frontend display)
        const productPriceBreakdown = [];
        let subtotalGarments = 0;
        pricingGarments.forEach(item => {
            const type = item.product_type || item.type;
            const price = getPriceForType(type);
            subtotalGarments += price;
            productPriceBreakdown.push({ product_type: type, price });
        });

        const handlingFee = await calculateHandlingFeePerStudent(classId);
        const shippingFee = await getShippingCostForOrder(delivery_details);
        const currentTotal = Math.round((subtotalGarments + handlingFee + shippingFee) * 100) / 100;

        // ── Partial-payment math ──────────────────────────────────────────────
        const prevAmountPaid = isEditAfterPayment ? parseFloat(activeOrder.amount_paid || 0) : 0;
        const newBalanceDue = Math.max(0, Math.round((currentTotal - prevAmountPaid) * 100) / 100);

        // Products that are genuinely new (not yet paid for) when editing after payment
        const extraProducts = isEditAfterPayment
            ? newOnlyGarments.map(item => ({ product_type: item.product_type || item.type, price: getPriceForType(item.product_type || item.type) }))
            : [];

        // Determine new process_status
        let newProcessStatus;
        if (isEditAfterPayment) {
            newProcessStatus = newBalanceDue > 0 ? 'partial_paid' : 'paid';
        } else {
            newProcessStatus = 'on_hold';
        }

        const holdDeadline = activeOrder
            ? (isEditAfterPayment ? activeOrder.hold_deadline : activeOrder.hold_deadline)
            : addBusinessDays(now, 3);

        const orderData = {
            student_id: studentId,
            class_id: classId,
            delivery_details: delivery_details ? JSON.stringify(delivery_details) : null,
            selected_logo_id: logoId,
            process_status: newProcessStatus,
            hold_deadline: holdDeadline,
            total_amount: currentTotal,
            status: 0,
            version: activeOrder ? activeOrder.version + 1 : 1
        };

        let finalOrderId;
        let changesSummary = [];

        const buildOrderItems = (list, orderId) => list.map(item => ({
            order_id: orderId,
            product_type: item.product_type || item.type || "UNKNOWN",
            selectedColor: item.selectedColor || item.color || null,
            selectedSize: item.selectedSize || item.size || null,
            design_config: item.design_config || item,
            status: 0
        }));

        // ── Transaction ───────────────────────────────────────────────────────
        await prisma.$transaction(async (tx) => {
            if (activeOrder) {
                if (previousState.selected_logo_id !== orderData.selected_logo_id) changesSummary.push("Logo selection");
                if (previousState.delivery_details !== orderData.delivery_details) changesSummary.push("Delivery details");
                changesSummary.push("Design/Garment updates");
                if (isEditAfterPayment) changesSummary.push(`Edit after payment (was ${activeOrder.process_status})`);

                await tx.order.update({
                    where: { id: activeOrder.id },
                    data: {
                        delivery_details: orderData.delivery_details,
                        selected_logo_id: orderData.selected_logo_id,
                        process_status: orderData.process_status,
                        total_amount: orderData.total_amount,
                        version: orderData.version,
                        payment_status: isEditAfterPayment
                            ? (newBalanceDue > 0 ? 'partial' : 'paid')
                            : previousState.payment_status,
                        updated_at: new Date()
                    }
                });
                finalOrderId = activeOrder.id;

                if (isEditAfterPayment) {
                    // Already-paid items must never be touched — only genuinely new
                    // product types get inserted, so an existing garment can't be
                    // duplicated or re-billed just because the full list was resent.
                    if (newOnlyGarments.length > 0) {
                        await tx.orderItem.createMany({ data: buildOrderItems(newOnlyGarments, finalOrderId) });
                    }
                } else {
                    // Nothing paid yet — free to fully reconfigure the order
                    await tx.orderItem.deleteMany({ where: { order_id: finalOrderId } });
                    if (garments && Array.isArray(garments) && garments.length > 0) {
                        await tx.orderItem.createMany({ data: buildOrderItems(garments, finalOrderId) });
                    }
                }

            } else {
                const newOrder = await tx.order.create({
                    data: {
                        student_id: orderData.student_id,
                        class_id: orderData.class_id,
                        delivery_details: orderData.delivery_details,
                        selected_logo_id: orderData.selected_logo_id,
                        process_status: 'on_hold',
                        hold_deadline: orderData.hold_deadline,
                        total_amount: orderData.total_amount,
                        amount_paid: 0,
                        payment_status: 'unpaid',
                        version: 1,
                        status: 0
                    }
                });
                finalOrderId = newOrder.id;
                changesSummary.push("Initial order placement");

                if (garments && Array.isArray(garments) && garments.length > 0) {
                    await tx.orderItem.createMany({ data: buildOrderItems(garments, finalOrderId) });
                }
            }
        }, { timeout: 15000 });

        // ── Order history ─────────────────────────────────────────────────────
        if (previousState && finalOrderId) {
            try {
                await prisma.orderHistory.create({
                    data: {
                        order_id: finalOrderId,
                        action: versionAction,
                        changed_by: studentId,
                        version: previousState.version,
                        changes: {
                            previousLogo: previousState.selected_logo_id,
                            previousDelivery: previousState.delivery_details,
                            previousItems: previousState.order_items,
                            previousTotal: previousState.total_amount
                        },
                        changes_summary: `Version ${previousState.version} saved. Changes: ${changesSummary.join(", ")}`
                    }
                });
            } catch (historyErr) {
                console.error("Order history save failed:", historyErr.message);
            }
        }

        // ── Socket ────────────────────────────────────────────────────────────
        if (req.io) {
            req.io.emit(`order_update_${studentId}`, { action: versionAction, version: orderData.version });
            req.io.emit('new_order_admin', { studentId, action: versionAction });
        }

        // ── Confirmation email (first create only) ────────────────────────────
        if (!activeOrder) {
            try {
                const student = await prisma.user.findUnique({
                    where: { id: studentId },
                    select: { name: true, email: true, class: { select: { change_deadline: true, school: { select: { education_type: true } } } } }
                });
                const savedItems = await prisma.orderItem.findMany({ where: { order_id: finalOrderId } });
                await sendOrderConfirmationEmail({
                    email: student.email,
                    studentName: student.name,
                    orderId: finalOrderId,
                    garments: savedItems,
                    changeDeadline: student.class?.change_deadline,
                    educationType: student.class?.school?.education_type
                });
            } catch (emailErr) {
                console.error("Order confirmation email failed:", emailErr.message);
            }
        }

        return res.json({
            success: true,
            message: activeOrder ? `Order updated (Version ${orderData.version})` : "Order created",
            data: {
                orderId: finalOrderId,
                version: orderData.version,
                process_status: newProcessStatus,
                total_amount: currentTotal,
                amount_paid: prevAmountPaid,
                balance_due: newBalanceDue,
                // Per-product payment breakdown for frontend
                product_price_breakdown: productPriceBreakdown,
                extra_products: extraProducts,                    // newly added products needing payment
                requires_additional_payment: isEditAfterPayment && newBalanceDue > 0
            }
        });

    } catch (err) {
        if (err.message === "Order is locked and cannot be modified.")
            return res.status(403).json({ success: false, message: err.message });
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyOrder = async (req, res) => {
    try {
        const studentId = req.user.id;
        const now = new Date();

        // Priority 1: active unpaid / processing order
        let order = await prisma.order.findFirst({
            where: {
                student_id: parseInt(studentId),
                process_status: { in: ['on_hold', 'draft', 'pending_payment'] },
                status: { not: 2 }
            },
            include: {
                order_items: { where: { status: { not: 2 } } },
                logo: true,
                class: { select: { name: true, process_status: true, change_deadline: true, order_locked: true } }
            }
        });

        // Priority 2: paid / partial_paid order within edit window (student can still add products)
        if (!order) {
            order = await prisma.order.findFirst({
                where: {
                    student_id: parseInt(studentId),
                    process_status: { in: ['paid', 'partial_paid'] },
                    status: { not: 2 },
                    edit_deadline: { gt: now }
                },
                include: {
                    order_items: { where: { status: { not: 2 } } },
                    logo: true,
                    class: { select: { name: true, process_status: true, change_deadline: true, order_locked: true } }
                },
                orderBy: { updated_at: 'desc' }
            });
        }

        // Priority 3: most recent order (any status — fallback)
        if (!order) {
            order = await prisma.order.findFirst({
                where: { student_id: parseInt(studentId), status: { not: 2 } },
                include: {
                    order_items: { where: { status: { not: 2 } } },
                    logo: true,
                    class: { select: { name: true, process_status: true, change_deadline: true, order_locked: true } }
                },
                orderBy: { created_at: 'desc' }
            });
        }

        if (!order) return res.json({ success: true, data: null });

        // Compute balance_due for frontend
        const totalAmount = parseFloat(order.total_amount || 0);
        const amountPaid = parseFloat(order.amount_paid || 0);
        const balanceDue = Math.max(0, Math.round((totalAmount - amountPaid) * 100) / 100);

        // Per-product price breakdown
        const priceSettings = await prisma.setting.findMany({ where: { key: { startsWith: 'price_' } } });
        const PRICES = Object.fromEntries(priceSettings.map(s => [s.key.replace('price_', ''), parseFloat(s.value)]));
        const DEFAULT_PRICES = { 'T-SHIRT': 200, 'SWEATSHIRT': 350, 'HOODIE': 450, 'ZIPPERHOODIE': 500, 'SWEATPANTS': 300, 'SHORTS': 250 };
        const getPriceForType = (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;

        const productPriceBreakdown = order.order_items.map(item => ({
            id: item.id,
            product_type: item.product_type,
            color: item.selectedColor,
            size: item.selectedSize,
            price: getPriceForType(item.product_type)
        }));

        // If partial_paid: identify which products still need payment
        // We assume amount_paid covers the first N products in order of creation
        let paidProducts = [];
        let unpaidProducts = [];
        if (['partial_paid', 'paid'].includes(order.process_status)) {
            let runningPaid = 0;
            for (const p of productPriceBreakdown) {
                if (runningPaid + p.price <= amountPaid + 0.001) {
                    paidProducts.push(p);
                    runningPaid += p.price;
                } else {
                    unpaidProducts.push(p);
                }
            }
        } else if (order.process_status === 'pending_payment') {
            // Stripe webhook not yet processed — all items are "to be confirmed"
            unpaidProducts = [...productPriceBreakdown];
        }

        const editWindowOpen = order.edit_deadline && now < new Date(order.edit_deadline);

        res.json({
            success: true,
            data: {
                ...order,
                balance_due: balanceDue,
                product_price_breakdown: productPriceBreakdown,
                paid_products: paidProducts,
                unpaid_products: unpaidProducts,
                edit_window_open: !!editWindowOpen,
                tracking: {
                    order_status: order.process_status,
                    class_status: order.class?.process_status,
                    is_locked: order.is_locked,
                    change_deadline: order.class?.change_deadline,
                    edit_deadline: order.edit_deadline
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyOrders = async (req, res) => {
    try {
        const studentId = req.user.id;
        const orders = await prisma.order.findMany({
            where: { student_id: parseInt(studentId), status: { not: 2 } },
            include: {
                order_items: { where: { status: { not: 2 } } },
                logo: true,
                class: { select: { name: true, process_status: true, change_deadline: true, order_locked: true } }
            },
            orderBy: { created_at: 'desc' }
        });
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const reorderFromVersion = async (req, res) => {
    try {
        const studentId = req.user.id;
        const { versionId } = req.params;
        if (!versionId) return res.status(400).json({ success: false, message: "Version ID is required" });

        const historyEntry = await prisma.orderHistory.findUnique({ where: { id: parseInt(versionId) }, include: { order: true } });
        if (!historyEntry) return res.status(404).json({ success: false, message: "Order history version not found." });
        if (historyEntry.order.student_id !== studentId) return res.status(403).json({ success: false, message: "Unauthorized." });

        const activeOrder = await prisma.order.findFirst({ where: { student_id: studentId, process_status: { in: ['on_hold', 'draft'] }, status: { not: 2 } } });
        if (activeOrder) return res.status(400).json({ success: false, message: "You already have an active order. Please reset or delete it first." });

        const previousChanges = historyEntry.changes;
        if (!previousChanges || !previousChanges.previousItems) return res.status(400).json({ success: false, message: "Invalid history version state." });

        const holdDeadline = addBusinessDays(new Date(), 3);
        const newOrder = await prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    student_id: studentId,
                    class_id: historyEntry.order.class_id,
                    selected_logo_id: previousChanges.previousLogo || null,
                    delivery_details: previousChanges.previousDelivery ? JSON.stringify(previousChanges.previousDelivery) : null,
                    process_status: 'on_hold',
                    hold_deadline: holdDeadline,
                    total_amount: previousChanges.previousTotal || 0,
                    version: 1, status: 0
                }
            });
            const items = previousChanges.previousItems.map(item => ({ order_id: created.id, product_type: item.product_type, selectedColor: item.selectedColor, selectedSize: item.selectedSize, design_config: item.design_config, status: 0 }));
            if (items.length > 0) await tx.orderItem.createMany({ data: items });
            return created;
        });

        res.json({ success: true, message: "Successfully cloned history version into a new active order.", data: { orderId: newOrder.id } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyOrderHistory = async (req, res) => {
    try {
        const studentId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        if (!prisma.orderHistory) {
            return res.status(503).json({ success: false, message: "Order history feature not yet migrated.", data: [] });
        }

        const total = await prisma.orderHistory.count({ where: { order: { student_id: parseInt(studentId) }, status: { not: 2 } } });
        const history = await prisma.orderHistory.findMany({
            where: { order: { student_id: parseInt(studentId) }, status: { not: 2 } },
            include: { order: { include: { order_items: true } } },
            orderBy: { created_at: 'desc' },
            skip, take: limit
        });

        res.json({ success: true, data: history, pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasMore: skip + limit < total } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;
        const history = await prisma.orderHistory.findUnique({ where: { id: parseInt(id) }, include: { order: true } });
        if (!history || history.order.student_id !== studentId)
            return res.status(403).json({ success: false, message: "Unauthorized to delete this history." });

        await prisma.orderHistory.update({ where: { id: parseInt(id) }, data: { status: 2 } });
        if (req.io) req.io.emit(`history_update_${studentId}`, { action: 'deleted', id });
        res.json({ success: true, message: "History entry deleted." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyProfile = async (req, res) => {
    try {
        const student = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, phone_number: true, year_of_birth: true, consent_marketing: true, consent_production: true, created_at: true, class: { select: { id: true, name: true } }, school: true }
        });
        res.json({ success: true, data: student });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateMyProfile = async (req, res) => {
    try {
        const { name, phone_number, year_of_birth, consent_marketing, consent_production } = req.body;
        const data = {};
        if (name) data.name = name;
        if (phone_number !== undefined) data.phone_number = phone_number;
        if (year_of_birth !== undefined) data.year_of_birth = parseInt(year_of_birth);
        if (consent_marketing !== undefined) data.consent_marketing = Boolean(consent_marketing);
        if (consent_production !== undefined) data.consent_production = Boolean(consent_production);

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data,
            select: { id: true, name: true, email: true, phone_number: true, year_of_birth: true, consent_marketing: true, consent_production: true, class: { select: { id: true, name: true } }, school: true }
        });
        res.json({ success: true, message: "Profile updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getClassesBySchool = async (req, res) => {
    try {
        const { schoolId } = req.params;
        if (!schoolId || isNaN(parseInt(schoolId))) return res.status(400).json({ success: false, message: "Valid schoolId is required" });
        const classes = await prisma.classes.findMany({
            where: { school_id: parseInt(schoolId), status: { not: 2 } },
            select: { id: true, name: true, graduation_year: true, process_status: true },
            orderBy: { name: 'asc' }
        });
        res.json({ success: true, data: classes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const checkClassSignup = async (req, res) => {
    try {
        const student = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { class_id: true, class: { select: { id: true, name: true, process_status: true, school: true } } }
        });
        if (!student?.class_id || !student?.class)
            return res.json({ success: true, signed_up: false, message: "Your class needs to be signed up before you can add your own design." });
        res.json({ success: true, signed_up: true, data: { class_id: student.class_id, class_name: student.class.name, process_status: student.class.process_status, school: student.class.school } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getStudentDetails = async (req, res) => {
    try {
        const student = await prisma.user.findUnique({
            where: { id: parseInt(req.params.id) },
            select: {
                id: true, name: true, email: true, phone_number: true, year_of_birth: true, role: true, status: true,
                consent_marketing: true, consent_production: true, created_at: true, school: true, class: true,
                orders: { where: { status: { not: 2 } }, select: { id: true, process_status: true, payment_status: true, total_amount: true, amount_paid: true, created_at: true, order_items: { where: { status: { not: 2 } }, select: { id: true, product_type: true, selectedColor: true, selectedSize: true } } }, orderBy: { created_at: 'desc' } }
            }
        });
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });
        if (student.role !== 'student') return res.status(400).json({ success: false, message: "User is not a student" });
        if (req.user.role === 'class_representative' && student.class?.id !== req.user.class_id)
            return res.status(403).json({ success: false, message: "Unauthorized: student is not in your class" });
        res.json({ success: true, data: student });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteStudent = async (req, res) => {
    try {
        const studentId = parseInt(req.params.id);
        const student = await prisma.user.findUnique({ where: { id: studentId }, include: { orders: { where: { status: { not: 2 } }, select: { id: true, process_status: true, payment_status: true, amount_paid: true } } } });
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });
        if (student.role !== 'student') return res.status(400).json({ success: false, message: "User is not a student" });
        if (student.status === 1) return res.status(400).json({ success: false, message: "Student is already disabled" });
        if (student.status === 2) return res.status(400).json({ success: false, message: "Student is already permanently deleted" });
        if (req.user.role === 'class_representative' && student.class_id !== req.user.class_id)
            return res.status(403).json({ success: false, message: "Unauthorized: student is not in your class" });

        const paidOrders = student.orders.filter(o => o.payment_status === 'paid' || o.payment_status === 'partial');
        if (paidOrders.length > 0)
            return res.status(400).json({ success: false, message: `Cannot disable student. They have ${paidOrders.length} paid/partial order(s).` });

        await prisma.user.update({ where: { id: studentId }, data: { status: 1 } });
        res.json({ success: true, message: `Student "${student.name}" has been disabled.`, data: { student_id: studentId, name: student.name, status: 1 } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const permanentDeleteStudent = async (req, res) => {
    try {
        const studentId = parseInt(req.params.id);
        const { confirm } = req.body;
        if (confirm !== 'DELETE') return res.status(400).json({ success: false, message: "Please confirm by sending { confirm: 'DELETE' } in request body" });

        const student = await prisma.user.findUnique({ where: { id: studentId }, include: { orders: { select: { id: true, payment_status: true } } } });
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });
        if (student.role !== 'student') return res.status(400).json({ success: false, message: "User is not a student" });

        const paidOrders = student.orders.filter(o => o.payment_status === 'paid' || o.payment_status === 'partial');
        if (paidOrders.length > 0)
            return res.status(400).json({ success: false, message: `Cannot permanently delete. Student has ${paidOrders.length} paid/partial order(s).` });

        await prisma.user.delete({ where: { id: studentId } });
        res.json({ success: true, message: `Student "${student.name}" has been permanently deleted.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listAllStudents = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', school_id, class_id, status, order_status } = req.body || {};
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            role: 'student',
            status: status !== undefined ? parseInt(status) : { not: 2 },
            ...(school_id && { school_id: parseInt(school_id) }),
            ...(class_id && { class_id: parseInt(class_id) }),
            ...(search && { OR: [{ name: { contains: search } }, { email: { contains: search } }] })
        };

        const [students, total] = await Promise.all([
            prisma.user.findMany({
                where, skip, take: limitNum, orderBy: { created_at: 'desc' },
                select: { id: true, name: true, email: true, phone_number: true, year_of_birth: true, status: true, consent_marketing: true, consent_production: true, created_at: true, school: true, class: true, orders: { where: { status: { not: 2 } }, select: { id: true, process_status: true, payment_status: true, total_amount: true, amount_paid: true }, orderBy: { created_at: 'desc' }, take: 1 } }
            }),
            prisma.user.count({ where })
        ]);

        let data = students.map(s => {
            const latestOrder = s.orders[0] ?? null;
            return { id: s.id, name: s.name, email: s.email, phone_number: s.phone_number, year_of_birth: s.year_of_birth, status: s.status, consent_marketing: s.consent_marketing, consent_production: s.consent_production, created_at: s.created_at, school: s.school, class: s.class, order_status: latestOrder?.process_status ?? 'no_order', payment_status: latestOrder?.payment_status ?? null, total_amount: latestOrder ? parseFloat(latestOrder.total_amount ?? 0) : null, amount_paid: latestOrder ? parseFloat(latestOrder.amount_paid ?? 0) : null, order_id: latestOrder?.id ?? null, orders: latestOrder ?? null };
        });

        if (order_status) data = data.filter(s => s.order_status === order_status);

        res.json({ success: true, data, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyClassStudentCount = async (req, res) => {
    try {
        const classId = req.user.class_id;
        if (!classId) return res.status(400).json({ success: false, message: "You are not assigned to any class" });

        const [classInfo, totalStudents, studentsWithOrders] = await Promise.all([
            prisma.classes.findUnique({ where: { id: classId }, select: { id: true, name: true, graduation_year: true, expected_students: true } }),
            prisma.user.count({ where: { class_id: classId, role: 'student', status: { not: 2 } } }),
            prisma.order.count({ where: { class_id: classId, status: { not: 2 } } })
        ]);

        if (!classInfo) return res.status(404).json({ success: false, message: "Class not found" });

        res.json({
            success: true,
            data: {
                class_id: classInfo.id,
                class_name: classInfo.name,
                graduation_year: classInfo.graduation_year,
                expected_students: classInfo.expected_students || 0,
                registered_students: totalStudents,
                students_with_orders: studentsWithOrders,
                completion_percentage: classInfo.expected_students > 0
                    ? Math.round((studentsWithOrders / classInfo.expected_students) * 100) : 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
