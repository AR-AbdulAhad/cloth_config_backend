import prisma from "../config/prisma.js";
import { calculateOrderTotal } from "../utils/feeCalculator.js";

// export const placeOrder = async (req, res) => {
//     try {
//         let { student_id, class_id, garments, delivery_details, logo_id } = req.body;

//         if (!student_id || !class_id) return res.status(400).json({ success: false, message: "Missing student_id or class_id" });

//         const sid = Number(student_id);
//         const cid = Number(class_id);
//         const lid = logo_id ? Number(logo_id) : null;

//         if (garments && !Array.isArray(garments)) garments = [garments];
//         if (!garments || garments.length === 0) return res.status(400).json({ success: false, message: "Garments array empty" });

//         const targetClass = await prisma.classes.findUnique({ where: { id: cid } });
//         if (!targetClass) return res.status(404).json({ success: false, message: "Class not found" });
//         if (targetClass.process_status !== 'active') return res.status(403).json({ success: false, message: "Class is locked" });

//         // Check deadline (auto-lock)
//         if (targetClass.change_deadline && new Date() > new Date(targetClass.change_deadline)) {
//             if (req.user?.role !== 'admin') {
//                 return res.status(403).json({ 
//                     success: false, 
//                     message: "Order deadline has passed. Changes are no longer allowed." 
//                 });
//             }
//         }

//         const existingOrder = await prisma.order.findFirst({ 
//             where: { student_id: sid, status: { not: 2 } },
//             include: { order_items: true }
//         });

//         const orderData = {
//             student_id: sid,
//             class_id: cid,
//             delivery_details: delivery_details ? JSON.stringify(delivery_details) : null,
//             selected_logo_id: lid,
//             status: 0
//         };

//         let result;
//         await prisma.$transaction(async (tx) => {
//             let orderId;
//             let action = 'created';

//             if (existingOrder) {
//                 if (existingOrder.is_locked) throw new Error("Order is locked");

//                 action = 'updated';

//                 await tx.order.update({ 
//                     where: { id: existingOrder.id }, 
//                     data: { 
//                         delivery_details: orderData.delivery_details, 
//                         selected_logo_id: lid
//                     } 
//                 });
//                 orderId = existingOrder.id;
//                 await tx.orderItem.deleteMany({ where: { order_id: orderId } });
//             } else {
//                 const newOrder = await tx.order.create({ data: orderData });
//                 orderId = newOrder.id;
//             }

//             const items = garments.map(item => ({
//                 order_id: orderId,
//                 product_type: item.product_type || item.type || "UNKNOWN",
//                 selectedColor: item.selectedColor || item.color || null,
//                 selectedSize: item.selectedSize || item.size || null,
//                 design_config: item.design_config || item,
//                 status: 0
//             }));
//             await tx.orderItem.createMany({ data: items });
//             result = { 
//                 orderId, 
//                 message: action === 'created' ? "Order created" : "Order updated"
//             };
//         });

//         res.json({ success: true, message: result.message, data: { orderId: result.orderId } });
//     } catch (err) {
//         res.status(err.message === "Order is locked" ? 403 : 500).json({ success: false, error: err.message });
//     }
// };

export const getMyOrder = async (req, res) => {
    try {
        const studentId = req.user.id;
        const order = await prisma.order.findFirst({
            where: { student_id: parseInt(studentId), status: { not: 2 } },
            include: { order_items: { where: { status: { not: 2 } } }, logo: true }
        });

        if (order) {
            // Calculate VAT breakdown for the order
            const totalAmount = parseFloat(order.total_amount || 0);
            const classId = order.class_id;
            
            // Get garment prices to calculate subtotal
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

            let subtotal = 0;
            order.order_items.forEach(item => {
                subtotal += getPriceForType(item.product_type);
            });

            const pricingBreakdown = await calculateOrderTotal(subtotal, classId);

            res.json({ 
                success: true, 
                data: {
                    ...order,
                    pricing_breakdown: pricingBreakdown
                }
            });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let whereClause = { status: { not: 2 } };
        
        if (req.user.role === 'class_representative') {
            if (!req.user.class_id) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Class representative has no assigned class" 
                });
            }
            whereClause.class_id = req.user.class_id;
        }

        const total = await prisma.order.count({
            where: whereClause
        });

        const orders = await prisma.order.findMany({
            where: whereClause,
            skip,
            take: limit,
            orderBy: { created_at: 'desc' },
            include: {
                student: { 
                    select: { 
                        name: true, 
                        email: true,
                        phone_number: true 
                    } 
                },
                class: { 
                    select: { 
                        name: true,
                        graduation_year: true,
                        change_deadline: true,
                        school_id: true 
                    } 
                },
                logo: true,
                order_items: {
                    where: { status: { not: 2 } }
                }
            }
        });

        const processedOrders = orders.map(order => {
            const deadlinePassed =
                order.class?.change_deadline &&
                new Date() > new Date(order.class.change_deadline);

            let isLocked = order.is_locked || deadlinePassed;
            let status = order.process_status;

            if (deadlinePassed && status === 'in_progress') {
                status = 'completed';
                isLocked = true;
            }

            if (status === 'completed') {
                isLocked = true;
            }

            return {
                ...order,
                is_locked: isLocked,
                process_status: status
            };
        });

        res.json({
            success: true,
            data: processedOrders,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await prisma.order.findUnique({
            where: { id: parseInt(orderId) },
            include: { student: true, class: true, logo: true, order_items: { where: { status: { not: 2 } } } }
        });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getConfiguratorData = async (req, res) => {
    try {
        const { classId, schoolId } = req.params;
        const [logos, backDesigns] = await Promise.all([
            prisma.logo.findMany({ where: { school_id: parseInt(schoolId), process_status: 'approved', status: 0 } }),
            prisma.backDesign.findMany({ where: { class_id: parseInt(classId), status: 0 } })
        ]);
        res.json({ success: true, data: { logos, backDesigns } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getOrderHistory = async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Add pagination support
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; // Default to 50 entries
        const skip = (page - 1) * limit;

        if (!orderId) {
            return res.status(400).json({ 
                success: false, 
                message: "Order ID is required" 
            });
        }

        // Check if orderHistory model exists in Prisma client
        if (!prisma.orderHistory) {
            return res.status(503).json({ 
                success: false, 
                message: "Order history feature not yet migrated. Please run: npx prisma migrate dev --name add_order_versioning",
                data: []
            });
        }

        // Get total count for pagination
        const total = await prisma.orderHistory.count({
            where: { order_id: parseInt(orderId) }
        });

        const history = await prisma.orderHistory.findMany({
            where: { order_id: parseInt(orderId) },
            orderBy: { version: 'desc' },
            skip,
            take: limit
        });

        res.json({ 
            success: true, 
            data: history,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasMore: skip + limit < total
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyOrderHistory = async (req, res) => {
    try {
        const studentId = req.user.id;
        
        // Add pagination support
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; // Default to 50 entries
        const skip = (page - 1) * limit;

        // Check if orderHistory model exists in Prisma client
        if (!prisma.orderHistory) {
            return res.status(503).json({ 
                success: false, 
                message: "Order history feature not yet migrated. Please run: npx prisma migrate dev --name add_order_versioning",
                data: []
            });
        }

        const order = await prisma.order.findFirst({
            where: { 
                student_id: parseInt(studentId), 
                status: { not: 2 } 
            },
            select: { id: true }
        });

        if (!order) {
            return res.json({ 
                success: true, 
                message: "No order found",
                data: [],
                pagination: {
                    total: 0,
                    page: 1,
                    limit,
                    totalPages: 0,
                    hasMore: false
                }
            });
        }

        // Get total count for pagination
        const total = await prisma.orderHistory.count({
            where: { order_id: order.id }
        });

        const history = await prisma.orderHistory.findMany({
            where: { order_id: order.id },
            orderBy: { version: 'desc' },
            skip,
            take: limit
        });

        res.json({ 
            success: true, 
            data: history,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasMore: skip + limit < total
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};



export const unlockOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

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

        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { 
                is_locked: false,
                process_status: 'in_progress'
            }
        });

        res.json({ 
            success: true, 
            message: "Order unlocked successfully. Student can now edit the order." 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};

export const lockOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

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

        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { 
                is_locked: true
            }
        });

        res.json({ 
            success: true, 
            message: "Order locked successfully. Student cannot edit anymore." 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};

// Reset order to start fresh design from scratch
export const resetOrder = async (req, res) => {
    try {
        const studentId = req.user.id;
        const { orderId } = req.params;

        // Find the order
        const order = await prisma.order.findFirst({
            where: { 
                id: parseInt(orderId),
                student_id: parseInt(studentId),
                status: { not: 2 }
            },
            include: { order_items: true }
        });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        // Check if order is locked
        if (order.is_locked) {
            return res.status(403).json({ 
                success: false, 
                message: "Cannot reset locked order" 
            });
        }

        await prisma.$transaction(async (tx) => {
            // Save current state to history before reset
            await tx.orderHistory.create({
                data: {
                    order_id: order.id,
                    action: "reset_order",
                    changed_by: parseInt(studentId),
                    version: order.version,
                    changes: {
                        previousItems: order.order_items,
                        previousTotal: order.total_amount,
                        previousLogo: order.selected_logo_id,
                        previousDelivery: order.delivery_details
                    },
                    changes_summary: `Order reset - Version ${order.version} cleared`
                }
            });

            // Delete all order items
            await tx.orderItem.deleteMany({
                where: { order_id: order.id }
            });

            // Reset order to initial state
            await tx.order.update({
                where: { id: order.id },
                data: {
                    selected_logo_id: null,
                    delivery_details: null,
                    process_status: 'in_progress',
                    version: order.version + 1,
                    total_amount: 0,
                    amount_paid: 0,
                    payment_status: 'unpaid',
                    stripe_payment_intent: null,
                    stripe_session_id: null,
                    updated_at: new Date()
                }
            });
        });

        res.json({ 
            success: true, 
            message: "Order reset successfully. You can start designing from scratch.",
            data: { orderId: order.id, newVersion: order.version + 1 }
        });

    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};

// Create completely new order (alternative to reset)
export const createFreshOrder = async (req, res) => {
    try {
        const studentId = req.user.id;

        // Check if student already has an active order
        const existingOrder = await prisma.order.findFirst({
            where: { 
                student_id: parseInt(studentId),
                status: { not: 2 }
            }
        });

        if (existingOrder && !existingOrder.is_locked) {
            return res.status(400).json({ 
                success: false, 
                message: "You already have an active order. Use reset instead or complete the existing order first.",
                data: { existingOrderId: existingOrder.id }
            });
        }

        // Get student's class
        const student = await prisma.user.findUnique({
            where: { id: parseInt(studentId) },
            select: { class_id: true }
        });

        if (!student || !student.class_id) {
            return res.status(400).json({ 
                success: false, 
                message: "Student class not found" 
            });
        }

        // Create new fresh order
        const newOrder = await prisma.order.create({
            data: {
                student_id: parseInt(studentId),
                class_id: student.class_id,
                process_status: 'in_progress',
                version: 1,
                total_amount: 0,
                amount_paid: 0,
                payment_status: 'unpaid',
                status: 0
            }
        });

        res.json({ 
            success: true, 
            message: "Fresh order created successfully. Start designing from scratch.",
            data: { orderId: newOrder.id, version: 1 }
        });

    } catch (err) {
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
};

// Debug endpoint to check order history status
export const debugOrderHistory = async (req, res) => {
    try {
        // Check if orderHistory model exists
        if (!prisma.orderHistory) {
            return res.json({
                success: false,
                message: "OrderHistory model not available in Prisma client",
                suggestion: "Run: npx prisma db push"
            });
        }

        // Get basic stats
        const totalHistory = await prisma.orderHistory.count();
        const recentHistory = await prisma.orderHistory.findMany({
            take: 5,
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                order_id: true,
                version: true,
                action: true,
                created_at: true
            }
        });

        res.json({
            success: true,
            data: {
                totalHistoryEntries: totalHistory,
                recentEntries: recentHistory,
                modelExists: true
            }
        });
    } catch (err) {
        res.json({
            success: false,
            error: err.message,
            suggestion: "OrderHistory table might not exist. Run: npx prisma db push"
        });
    }
};

