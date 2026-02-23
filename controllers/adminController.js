import prisma from "../config/prisma.js";


export const getDashboardStats = async (req, res) => {
    try {
        const schoolCount = await prisma.school.count();
        const classCount = await prisma.classes.count();
        const userCount = await prisma.user.count();
        const logoCount = await prisma.logo.count();
        const backDesignCount = await prisma.backDesign.count();
        const ordersCount = await prisma.order.count();
        res.json({
            success: true,
            data: {
                schoolCount,
                classCount,
                userCount,
                logoCount,
                backDesignCount,
                ordersCount
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const toggleEntityStatus = async (req, res) => {
    try {
        const { entityType, id } = req.params;
        const { status } = req.body;

        if (status !== 0 && status !== 1) {
            return res.status(400).json({ success: false, message: "Invalid status. Use 0 or 1." });
        }

        const modelMap = {
            'school': prisma.school,
            'class': prisma.classes,
            'user': prisma.user,
            'class-rep': prisma.user,
            'student': prisma.user,
            'logo': prisma.logo,
            'back-design': prisma.backDesign,
            'name-list': prisma.nameList,
            'order': prisma.order,
            'order-item': prisma.orderItem,
            'production-package': prisma.productionPackage
        };

        const model = modelMap[entityType.toLowerCase()];
        if (!model) return res.status(400).json({ success: false, message: "Invalid entity type." });

        const updated = await model.update({
            where: { id: parseInt(id) },
            data: { status: parseInt(status) }
        });

        res.json({ success: true, message: `${entityType} status updated`, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};