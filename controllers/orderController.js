import prisma from "../config/prisma.js";

export const placeOrder = async (req, res) => {
    try {
        let { student_id, class_id, garments, delivery_details, logo_id } = req.body;

        if (!student_id || !class_id) return res.status(400).json({ success: false, message: "Missing student_id or class_id" });

        const sid = Number(student_id);
        const cid = Number(class_id);
        const lid = logo_id ? Number(logo_id) : null;

        if (garments && !Array.isArray(garments)) garments = [garments];
        if (!garments || garments.length === 0) return res.status(400).json({ success: false, message: "Garments array empty" });

        const targetClass = await prisma.classes.findUnique({ where: { id: cid } });
        if (!targetClass) return res.status(404).json({ success: false, message: "Class not found" });
        if (targetClass.process_status !== 'active') return res.status(403).json({ success: false, message: "Class is locked" });

        // Check deadline (auto-lock)
        if (targetClass.change_deadline && new Date() > new Date(targetClass.change_deadline)) {
            if (req.user?.role !== 'admin') {
                return res.status(403).json({ 
                    success: false, 
                    message: "Order deadline has passed. Changes are no longer allowed." 
                });
            }
        }

        const existingOrder = await prisma.order.findFirst({ 
            where: { student_id: sid, status: { not: 2 } },
            include: { order_items: true }
        });

        const orderData = {
            student_id: sid,
            class_id: cid,
            delivery_details: delivery_details ? JSON.stringify(delivery_details) : null,
            selected_logo_id: lid,
            status: 0
        };

        let result;
        await prisma.$transaction(async (tx) => {
            let orderId;
            let action = 'created';

            if (existingOrder) {
                if (existingOrder.is_locked) throw new Error("Order is locked");

                action = 'updated';

                await tx.order.update({ 
                    where: { id: existingOrder.id }, 
                    data: { 
                        delivery_details: orderData.delivery_details, 
                        selected_logo_id: lid
                    } 
                });
                orderId = existingOrder.id;
                await tx.orderItem.deleteMany({ where: { order_id: orderId } });
            } else {
                const newOrder = await tx.order.create({ data: orderData });
                orderId = newOrder.id;
            }

            const items = garments.map(item => ({
                order_id: orderId,
                product_type: item.product_type || item.type || "UNKNOWN",
                selectedColor: item.selectedColor || item.color || null,
                selectedSize: item.selectedSize || item.size || null,
                design_config: item.design_config || item,
                status: 0
            }));
            await tx.orderItem.createMany({ data: items });
            result = { 
                orderId, 
                message: action === 'created' ? "Order created" : "Order updated"
            };
        });

        res.json({ success: true, message: result.message, data: { orderId: result.orderId } });
    } catch (err) {
        res.status(err.message === "Order is locked" ? 403 : 500).json({ success: false, error: err.message });
    }
};

export const getMyOrder = async (req, res) => {
    try {
        const studentId = req.user.id;
        const order = await prisma.order.findFirst({
            where: { student_id: parseInt(studentId), status: { not: 2 } },
            include: { order_items: { where: { status: { not: 2 } } }, logo: true }
        });
        res.json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const skip = (page - 1) * limit;

        // Get total count (for frontend pagination)
        const total = await prisma.order.count({
            where: { status: { not: 2 } }
        });

        const orders = await prisma.order.findMany({
            where: { status: { not: 2 } },
            skip,
            take: limit,
            orderBy: { created_at: 'desc' }, // optional but recommended
            include: {
                student: { select: { name: true, email: true } },
                class: { select: { name: true } },
                logo: true
            }
        });

        res.json({
            success: true,
            data: orders,
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

        const history = await prisma.orderHistory.findMany({
            where: { order_id: parseInt(orderId) },
            orderBy: { version: 'desc' }
        });

        res.json({ 
            success: true, 
            data: history,
            count: history.length 
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyOrderHistory = async (req, res) => {
    try {
        const studentId = req.user.id;

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
                data: [] 
            });
        }

        const history = await prisma.orderHistory.findMany({
            where: { order_id: order.id },
            orderBy: { version: 'desc' }
        });

        res.json({ 
            success: true, 
            data: history,
            count: history.length 
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
