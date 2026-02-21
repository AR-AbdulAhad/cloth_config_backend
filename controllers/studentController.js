import prisma from "../config/prisma.js";

// Get Dashboard Data (Logos, Back Design)
export const getDashboardData = async (req, res) => {
    try {
        const { classId, schoolId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const [logos, logosTotal] = await Promise.all([
            prisma.logo.findMany({
                where: {
                    school_id: parseInt(schoolId),
                    process_status: 'approved',
                    status: { not: 2 },
                    ...(search && {
                        file_path: { contains: search, mode: 'insensitive' }
                    })
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.logo.count({
                where: {
                    school_id: parseInt(schoolId),
                    process_status: 'approved',
                    status: { not: 2 },
                    ...(search && {
                        file_path: { contains: search, mode: 'insensitive' }
                    })
                }
            })
        ]);

        const [backDesign, backDesignTotal] = await Promise.all([
            prisma.backDesign.findMany({
                where: {
                    class_id: parseInt(classId),
                    status: { not: 2 },
                    ...(search && {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { file_path: { contains: search, mode: 'insensitive' } }
                        ]
                    })
                },
                skip,
                take: limit,
                orderBy: { created_at: 'desc' }
            }),
            prisma.backDesign.count({
                where: {
                    class_id: parseInt(classId),
                    status: { not: 2 },
                    ...(search && {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' } },
                            { file_path: { contains: search, mode: 'insensitive' } }
                        ]
                    })
                }
            })
        ]);

        res.json({
            success: true,
            data: {
                logos,
                backDesign
            },
            pagination: {
                logos: {
                    total: logosTotal,
                    page,
                    limit,
                    totalPages: Math.ceil(logosTotal / limit)
                },
                backDesign: {
                    total: backDesignTotal,
                    page,
                    limit,
                    totalPages: Math.ceil(backDesignTotal / limit)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

    export const placeOrder = async (req, res) => {
    try {
        let {
            student_id,
            class_id,
            garments, // Expected as array of { product_type, selectedColor, selectedSize, design_config }
            delivery_details,
            logo_id
        } = req.body;

        // --- Input validation ---
        if (!student_id || isNaN(Number(student_id))) {
            return res.status(400).json({ success: false, message: "Invalid or missing student_id." });
        }
        if (!class_id || isNaN(Number(class_id))) {
            return res.status(400).json({ success: false, message: "Invalid or missing class_id." });
        }

        const studentId = Number(student_id);
        const classId = Number(class_id);
        const logoId = logo_id ? Number(logo_id) : null;

        if (garments && !Array.isArray(garments)) {
            garments = [garments];
        }

        if (garments && garments.length === 0) {
            return res.status(400).json({ success: false, message: "Garments array cannot be empty." });
        }

        if (garments) {
            // Validate each garment
            for (const item of garments) {
                if (!item.product_type && !item.type) {
                    return res.status(400).json({ success: false, message: "Each garment must have a product_type." });
                }
                if (!item.selectedColor && !item.color) {
                    return res.status(400).json({ success: false, message: "Each garment must have a selectedColor." });
                }
                if (!item.selectedSize && !item.size) {
                    return res.status(400).json({ success: false, message: "Each garment must have a selectedSize." });
                }
                if (!item.design_config && Object.keys(item).length === 0) {
                    return res.status(400).json({ success: false, message: "Each garment must have design_config or valid design object." });
                }
            }
        }

        // --- Check Class status ---
        const targetClass = await prisma.classes.findUnique({
            where: { id: classId }
        });

        if (!targetClass) {
            return res.status(404).json({ success: false, message: "Class not found." });
        }

        if (targetClass.process_status !== 'active') {
            return res.status(403).json({ success: false, message: "Class is locked. No new orders or changes allowed." });
        }

        // --- Check existing order ---
        const existingOrder = await prisma.order.findFirst({
            where: {
                student_id: studentId,
                status: { not: 2 } // Assuming 2 is "cancelled" or similar
            }
        });

        const orderData = {
            student_id: studentId,
            class_id: classId,
            delivery_details: delivery_details ? JSON.stringify(delivery_details) : null,
            selected_logo_id: logoId,
            status: 0
        };

        let result;

        // --- Transaction: Create/Update Order & Items ---
        await prisma.$transaction(async (tx) => {
            let orderId;

            if (existingOrder) {
                if (existingOrder.is_locked) {
                    throw new Error("Order is locked and cannot be modified.");
                }

                // Update existing order
                await tx.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        delivery_details: orderData.delivery_details,
                        selected_logo_id: orderData.selected_logo_id
                    }
                });
                orderId = existingOrder.id;

                // Delete old items
                await tx.orderItem.deleteMany({
                    where: { order_id: orderId }
                });

            } else {
                // Create new order
                const newOrder = await tx.order.create({
                    data: orderData
                });
                orderId = newOrder.id;
            }

            // Create order items
            if (garments && Array.isArray(garments)) {
                const itemData = garments.map(item => ({
                    order_id: orderId,
                    product_type: item.product_type || item.type || "UNKNOWN",
                    selectedColor: item.selectedColor || item.color || null,
                    selectedSize: item.selectedSize || item.size || null,
                    design_config: item.design_config || item, // fallback to entire object
                    status: 0
                }));

                if (itemData.length > 0) {
                    await tx.orderItem.createMany({ data: itemData });
                }
            }

            result = { orderId, message: existingOrder ? "Order updated" : "Order created" };
        });

        return res.json({
            success: true,
            message: result.message,
            data: { orderId: result.orderId }
        });

    } catch (err) {
        if (err.message === "Order is locked and cannot be modified.") {
            return res.status(403).json({ success: false, message: err.message });
        }
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
};


// Get current student order
export const getMyOrder = async (req, res) => {
    try {
        const studentId = req.user.id;
        const order = await prisma.order.findFirst({
            where: {
                student_id: parseInt(studentId),
                status: { not: 2 }
            },
            include: {
                order_items: {
                    where: { status: { not: 2 } }
                },
                logo: true
            }
        });

        res.json({
            success: true,
            data: order
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
