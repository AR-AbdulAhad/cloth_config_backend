import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendOrderConfirmationEmail } from "../utils/emailService.js";
import { calculateHandlingFeePerStudent } from "../utils/feeCalculator.js";

export const studentLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Basic validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        // Fetch user
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Invalid email or password"
            });
        }
        if (user.role === "admin") {
            return res.status(404).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (user.status === 1) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive. Please contact support."
            });
        }

        // Compare password (async)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Generate JWT
        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                school_id: user.school_id,
                class_id: user.class_id
            },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    school_id: user.school_id,
                    class_id: user.class_id,
                    status: user.status
                }
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message
        });
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
            prisma.logo.findMany({
                where: {
                    school_id: parseInt(schoolId),
                    process_status: 'approved',
                    status: { not: 2 },
                    ...(search && {
                        file_path: { contains: search }
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
                        file_path: { contains: search }
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
                            { name: { contains: search } },
                            { file_path: { contains: search } }
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
                            { name: { contains: search } },
                            { file_path: { contains: search } }
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

        // --- Find Existing Order ---
        const existingOrder = await prisma.order.findFirst({
            where: { student_id: studentId, class_id: classId },
            include: { order_items: true }
        });

        // --- Versioning & History Setup ---
        let versionAction = 'created';
        let previousState = null;

        if (existingOrder) {
            versionAction = 'updated';
            // Fetch detailed previous state for history
            previousState = await prisma.order.findUnique({
                where: { id: existingOrder.id },
                include: { order_items: true }
            });

            if (existingOrder.is_locked) {
                return res.status(403).json({ success: false, message: "Order is locked and cannot be modified." });
            }

            const now = new Date();

            // --- Check Post-Payment Edit Deadline ---
            if (existingOrder.payment_status === 'paid' && existingOrder.edit_deadline) {
                if (now > new Date(existingOrder.edit_deadline)) {
                    await prisma.order.update({
                        where: { id: existingOrder.id },
                        data: { is_locked: true }
                    });
                    return res.status(403).json({
                        success: false,
                        message: "The 3-day post-payment edit window has expired. Order is now locked."
                    });
                }

                // If paid and within deadline, restrict design changes of existing items
                // (Only allow delivery details and logo updates, or adding NEW items)
                // However, for simplicity in this save function, if anything in garments changed 
                // compared to existing, we should check if they are trying to sneak in a design change.
                const existingItems = existingOrder.order_items;
                const isDesignChanged = garments && garments.some(g => {
                    const existing = existingItems.find(ei => ei.product_type === g.product_type);
                    if (!existing) return false; // This is a NEW item, allowed (but should go through payment)
                    return JSON.stringify(existing.design_config) !== JSON.stringify(g.design_config || g);
                });

                if (isDesignChanged) {
                    return res.status(403).json({
                        success: false,
                        message: "Design is locked after payment. You can only update delivery details or add new items."
                    });
                }
            }

            // --- Enforce 3 Business Days Policy for UNPAID orders ---
            if (existingOrder.payment_status === 'unpaid') {
                const createdAt = new Date(existingOrder.created_at);
                let businessDaysDiff = 0;
                let checkDate = new Date(createdAt);
                while (checkDate < now) {
                    checkDate.setDate(checkDate.getDate() + 1);
                    const day = checkDate.getDay();
                    if (day !== 0 && day !== 6) businessDaysDiff++;
                }

                if (businessDaysDiff > 3) {
                    await prisma.order.update({
                        where: { id: existingOrder.id },
                        data: { is_locked: true }
                    });
                    return res.status(403).json({
                        success: false,
                        message: "The 3-business-day change period for unpaid orders has expired. Order is now locked."
                    });
                }
            }

            // Also check class deadline
            if (targetClass.change_deadline && now > new Date(targetClass.change_deadline)) {
                return res.status(403).json({ success: false, message: "Class order deadline has passed." });
            }
        }

        // --- Fetch garment prices from settings ---
        const priceSettings = await prisma.setting.findMany({
            where: { key: { startsWith: 'price_' } }
        });
        const PRICES = Object.fromEntries(
            priceSettings.map(s => [s.key.replace('price_', ''), parseFloat(s.value)])
        );
        // Fallback defaults if settings not seeded yet
        const DEFAULT_PRICES = { 'T-SHIRT': 200, 'SWEATSHIRT': 350, 'HOODIE': 450, 'ZIPPERHOODIE': 500, 'SWEATPANTS': 300, 'SHORTS': 250 };
        const getPriceForType = (type) => PRICES[type] ?? DEFAULT_PRICES[type] ?? 0;

        let currentTotal = 0;
        if (garments && garments.length > 0) {
            garments.forEach(item => {
                const type = item.product_type || item.type;
                currentTotal += getPriceForType(type);
            });
        }

        // Add handling fee per student
        const handlingFee = await calculateHandlingFeePerStudent(classId);
        currentTotal = Math.round((currentTotal + handlingFee) * 100) / 100;

        const orderData = {
            student_id: studentId,
            class_id: classId,
            delivery_details: delivery_details ? JSON.stringify(delivery_details) : null,
            selected_logo_id: logoId,
            process_status: "saved", // Use 'saved' instead of 'in_progress'
            total_amount: currentTotal,
            status: 0,
            version: existingOrder ? existingOrder.version + 1 : 1
        };

        let finalOrderId;
        let changesSummary = [];

        // --- Transaction: Create/Update Order & Items & History ---
        await prisma.$transaction(async (tx) => {
            if (existingOrder) {
                // Capture changes for history
                if (previousState.selected_logo_id !== orderData.selected_logo_id) changesSummary.push("Logo selection");
                if (previousState.delivery_details !== orderData.delivery_details) changesSummary.push("Delivery details");
                // Garments will occupy a summary entry if they change (detected by the update itself)
                changesSummary.push("Design/Garment updates");

                // Update existing order
                await tx.order.update({
                    where: { id: existingOrder.id },
                    data: {
                        delivery_details: orderData.delivery_details,
                        selected_logo_id: orderData.selected_logo_id,
                        process_status: orderData.process_status,
                        total_amount: orderData.total_amount,
                        version: orderData.version,
                        updated_at: new Date()
                    }
                });
                finalOrderId = existingOrder.id;

                // Delete old items
                await tx.orderItem.deleteMany({
                    where: { order_id: finalOrderId }
                });

            } else {
                // Create new order
                const newOrder = await tx.order.create({
                    data: {
                        student_id: orderData.student_id,
                        class_id: orderData.class_id,
                        delivery_details: orderData.delivery_details,
                        selected_logo_id: orderData.selected_logo_id,
                        process_status: orderData.process_status,
                        total_amount: orderData.total_amount,
                        amount_paid: 0,
                        payment_status: "unpaid",
                        version: 1,
                        status: 0
                    }
                });
                finalOrderId = newOrder.id;
                changesSummary.push("Initial order placement");
            }

            // Create order items
            if (garments && Array.isArray(garments)) {
                const itemData = garments.map(item => ({
                    order_id: finalOrderId,
                    product_type: item.product_type || item.type || "UNKNOWN",
                    selectedColor: item.selectedColor || item.color || null,
                    selectedSize: item.selectedSize || item.size || null,
                    design_config: item.design_config || item,
                    status: 0
                }));

                if (itemData.length > 0) {
                    await tx.orderItem.createMany({ data: itemData });
                }
            }

            // --- Track History ---
            if (previousState) {
                await tx.orderHistory.create({
                    data: {
                        order_id: finalOrderId,
                        action: versionAction,
                        changed_by: studentId,
                        version: previousState.version, // Record the state BEFORE this update
                        changes: {
                            previousLogo: previousState.selected_logo_id,
                            previousDelivery: previousState.delivery_details,
                            previousItems: previousState.order_items,
                            previousTotal: previousState.total_amount
                        },
                        changes_summary: `Version ${previousState.version} saved. Changes: ${changesSummary.join(", ")}`
                    }
                });
            }
        });

        // --- Emit Socket Event for real-time update ---
        if (req.io) {
            req.io.emit(`order_update_${studentId}`, { action: versionAction, version: orderData.version });
            req.io.emit('new_order_admin', { studentId, action: versionAction });
        }

        // --- Send Order Confirmation Email (only on first create) ---
        if (!existingOrder) {
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

        // --- Auto-generate production files in background (non-blocking) ---
        setImmediate(async () => {
            try {
                const { generatePDF } = await import("../utils/pdfGenerator.js");
                const { generateExcel } = await import("../utils/excelGenerator.js");

                const order = await prisma.order.findUnique({
                    where: { id: finalOrderId },
                    include: {
                        student:     { select: { name: true, email: true } },
                        class:       { select: { id: true, name: true } },
                        logo:        { select: { file_path: true } },
                        order_items: { where: { status: { not: 2 } } }
                    }
                });

                if (!order || order.order_items.length === 0) return;

                const nameList = await prisma.nameList.findFirst({
                    where: { class_id: order.class.id },
                    include: { items: { orderBy: { position: 'asc' } } }
                });

                const results = order.order_items.map(item => ({
                    class_name:    order.class.name,
                    student_name:  order.student.name,
                    student_email: order.student.email,
                    product_type:  item.product_type,
                    color:         item.selectedColor,
                    size:          item.selectedSize,
                    design_config: item.design_config,
                    logo_path:     order.logo?.file_path || null,
                    name_list:     nameList?.items.map(ni => ni.name).join(', ') || null
                }));

                const pkg = await prisma.productionPackage.create({
                    data: {
                        class_id:          order.class.id,
                        package_name:      `Order_${finalOrderId}_${order.student.name}_${Date.now()}`,
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
                console.error("Auto production file generation failed:", prodErr.message);
            }
        });

        return res.json({
            success: true,
            message: existingOrder ? `Order updated (Version ${orderData.version})` : "Order created",
            data: { orderId: finalOrderId, version: orderData.version }
        });

    } catch (err) {
        if (err.message === "Order is locked and cannot be modified.") {
            return res.status(403).json({ success: false, message: err.message });
        }
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

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
                logo: true,
                class: {
                    select: {
                        name: true,
                        process_status: true,
                        change_deadline: true,
                        order_locked: true
                    }
                }
            }
        });

        res.json({
            success: true,
            data: order ? {
                ...order,
                tracking: {
                    order_status: order.process_status,
                    class_status: order.class?.process_status,
                    is_locked: order.is_locked,
                    change_deadline: order.class?.change_deadline
                }
            } : null
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

        // Get total count for pagination
        const total = await prisma.orderHistory.count({
            where: {
                order: { student_id: parseInt(studentId) },
                status: { not: 2 }
            }
        });

        const history = await prisma.orderHistory.findMany({
            where: {
                order: { student_id: parseInt(studentId) },
                status: { not: 2 }
            },
            include: {
                order: {
                    include: {
                        order_items: true
                    }
                }
            },
            orderBy: { created_at: 'desc' },
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

export const deleteHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = req.user.id;

        // Verify ownership and delete (soft delete)
        const history = await prisma.orderHistory.findUnique({
            where: { id: parseInt(id) },
            include: { order: true }
        });

        if (!history || history.order.student_id !== studentId) {
            return res.status(403).json({ success: false, message: "Unauthorized to delete this history." });
        }

        await prisma.orderHistory.update({
            where: { id: parseInt(id) },
            data: { status: 2 } // Soft delete
        });

        // Emit socket event
        if (req.io) {
            req.io.emit(`history_update_${studentId}`, { action: 'deleted', id });
        }

        res.json({
            success: true,
            message: "History entry deleted."
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getMyProfile = async (req, res) => {
    try {
        const student = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true, name: true, email: true,
                phone_number: true, year_of_birth: true,
                consent_marketing: true, consent_production: true,
                created_at: true,
                class: { select: { id: true, name: true } },
                school: true
            }
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
            select: {
                id: true, name: true, email: true, phone_number: true, year_of_birth: true, consent_marketing: true, consent_production: true, class: { select: { id: true, name: true } },
                school: true
            }
        });
        res.json({ success: true, message: "Profile updated", data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getClassesBySchool = async (req, res) => {
    try {
        const { schoolId } = req.params;

        if (!schoolId || isNaN(parseInt(schoolId))) {
            return res.status(400).json({ success: false, message: "Valid schoolId is required" });
        }

        const classes = await prisma.classes.findMany({
            where: {
                school_id: parseInt(schoolId),
                status: { not: 2 }
            },
            select: {
                id: true,
                name: true,
                graduation_year: true,
                process_status: true
            },
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
            select: {
                class_id: true,
                class: {
                    select: {
                        id: true,
                        name: true,
                        process_status: true,
                        school: true
                    }
                }
            }
        });

        if (!student?.class_id || !student?.class) {
            return res.json({
                success: true,
                signed_up: false,
                message: "Your class needs to be signed up before you can add your own design."
            });
        }

        res.json({
            success: true,
            signed_up: true,
            data: {
                class_id: student.class_id,
                class_name: student.class.name,
                process_status: student.class.process_status,
                school: student.class.school
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getStudentDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = parseInt(id);

        const student = await prisma.user.findUnique({
            where: { id: studentId },
            select: {
                id: true,
                name: true,
                email: true,
                phone_number: true,
                year_of_birth: true,
                role: true,
                status: true,
                consent_marketing: true,
                consent_production: true,
                created_at: true,
                school: true,
               class: true,
                orders: {
                    where: { status: { not: 2 } },
                    select: {
                        id: true,
                        process_status: true,
                        payment_status: true,
                        total_amount: true,
                        amount_paid: true,
                        created_at: true,
                        order_items: {
                            where: { status: { not: 2 } },
                            select: { id: true, product_type: true, selectedColor: true, selectedSize: true }
                        }
                    },
                    orderBy: { created_at: 'desc' }
                }
            }
        });

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ success: false, message: "User is not a student" });
        }

        // Class rep can only view students in their own class
        if (req.user.role === 'class_representative') {
            if (student.class?.id !== req.user.class_id) {
                return res.status(403).json({ success: false, message: "Unauthorized: student is not in your class" });
            }
        }

        res.json({ success: true, data: student });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = parseInt(id);

        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: {
                orders: {
                    where: { status: { not: 2 } },
                    select: {
                        id: true,
                        process_status: true,
                        payment_status: true,
                        amount_paid: true
                    }
                }
            }
        });

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ success: false, message: "User is not a student" });
        }

        if (student.status === 1) {
            return res.status(400).json({ success: false, message: "Student is already disabled" });
        }

        if (student.status === 2) {
            return res.status(400).json({ success: false, message: "Student is already permanently deleted" });
        }

        // Class rep can only disable students in their own class
        if (req.user.role === 'class_representative') {
            if (student.class_id !== req.user.class_id) {
                return res.status(403).json({ success: false, message: "Unauthorized: student is not in your class" });
            }
        }

        // Block if student has any paid or partially paid orders
        const paidOrders = student.orders.filter(o =>
            o.payment_status === 'paid' || o.payment_status === 'partial'
        );

        if (paidOrders.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot disable student. They have ${paidOrders.length} paid/partial order(s). Resolve payments first.`
            });
        }

        // Disable the student — status 1 blocks login and all actions via authMiddleware
        await prisma.user.update({
            where: { id: studentId },
            data: { status: 1 }
        });

        res.json({
            success: true,
            message: `Student "${student.name}" has been disabled. They can no longer login or perform any actions.`,
            data: {
                student_id: studentId,
                name: student.name,
                status: 1
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const permanentDeleteStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const { confirm } = req.body;
        const studentId = parseInt(id);

        if (confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: "Please confirm by sending { confirm: 'DELETE' } in request body"
            });
        }

        const student = await prisma.user.findUnique({
            where: { id: studentId },
            include: {
                orders: { select: { id: true, payment_status: true } }
            }
        });

        if (!student) {
            return res.status(404).json({ success: false, message: "Student not found" });
        }

        if (student.role !== 'student') {
            return res.status(400).json({ success: false, message: "User is not a student" });
        }

        // Must be disabled (status=1) before permanent delete
        // if (student.status !== 1) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Student must be disabled first before permanent deletion. Use the disable endpoint first."
        //     });
        // }

        // Block if student has any paid orders — cannot erase payment records
        const paidOrders = student.orders.filter(o =>
            o.payment_status === 'paid' || o.payment_status === 'partial'
        );
        if (paidOrders.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot permanently delete. Student has ${paidOrders.length} paid/partial order(s) that must be retained for records.`
            });
        }

        // Hard delete — cascades to orders, order_items, order_history, logos via schema onDelete: Cascade
        await prisma.user.delete({ where: { id: studentId } });

        res.json({
            success: true,
            message: `Student "${student.name}" has been permanently deleted from the system`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const listAllStudents = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            school_id,
            class_id,
            status,          // 0 = active, 1 = inactive, 2 = deleted  (omit = all except deleted)
            order_status     // filter by latest order process_status e.g. 'saved', 'completed', 'no_order'
        } = req.body || {};

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        const where = {
            role: 'student',
            // default: exclude deleted, unless caller explicitly sends status: 2
            status: status !== undefined ? parseInt(status) : { not: 2 },
            ...(school_id && { school_id: parseInt(school_id) }),
            ...(class_id && { class_id: parseInt(class_id) }),
            ...(search && {
                OR: [
                    { name: { contains: search } },
                    { email: { contains: search } }
                ]
            })
        };

        const [students, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone_number: true,
                    year_of_birth: true,
                    status: true,
                    consent_marketing: true,
                    consent_production: true,
                    created_at: true,
                    school: true,
                    class: true,
                    orders: {
                        where: { status: { not: 2 } },
                        select: { id: true, process_status: true, payment_status: true, total_amount: true, amount_paid: true },
                        orderBy: { created_at: 'desc' },
                        take: 1
                    }
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: limitNum
            }),
            prisma.user.count({ where })
        ]);

        // Flatten latest order info + optional order_status filter
        let data = students.map(s => {
            const latestOrder = s.orders[0] ?? null;
            return {
                id: s.id,
                name: s.name,
                email: s.email,
                phone_number: s.phone_number,
                year_of_birth: s.year_of_birth,
                status: s.status,
                consent_marketing: s.consent_marketing,
                consent_production: s.consent_production,
                created_at: s.created_at,
                school: s.school,
                class: s.class,
                order_status: latestOrder?.process_status ?? 'no_order',
                payment_status: latestOrder?.payment_status ?? null,
                total_amount: latestOrder ? parseFloat(latestOrder.total_amount ?? 0) : null,
                amount_paid: latestOrder ? parseFloat(latestOrder.amount_paid ?? 0) : null,
                order_id: latestOrder?.id ?? null,
                orders: latestOrder ?? null
            };
        });

        // Client-side filter by order_status if provided
        if (order_status) {
            data = data.filter(s => s.order_status === order_status);
        }

        res.json({
            success: true,
            data,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
