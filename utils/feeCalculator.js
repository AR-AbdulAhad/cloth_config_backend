import prisma from "../config/prisma.js";

/**
 * Calculate handling fee per student for a class based on total order items.
 *
 * Logic:
 * - Count total order items across all orders in the class
 * - If totalItems <= threshold: totalFee = baseFee
 * - If totalItems > threshold: totalFee = baseFee + extraFee
 * - Per student fee = totalFee / number of students with orders
 */
export const calculateHandlingFeePerStudent = async (classId) => {
    const settings = await prisma.setting.findMany({
        where: { key: { in: ['handling_fee', 'handling_fee_enabled', 'handling_fee_threshold', 'handling_fee_extra'] } }
    });

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));

    if (map.handling_fee_enabled !== 'true') return 0;

    const baseFee = parseFloat(map.handling_fee || 500);
    const threshold = parseInt(map.handling_fee_threshold || 20);
    const extraFee = parseFloat(map.handling_fee_extra || 250);

    // Count total order items in this class
    const totalItems = await prisma.orderItem.count({
        where: {
            order: { class_id: parseInt(classId), status: { not: 2 } },
            status: { not: 2 }
        }
    });

    // Count students with active orders
    const studentCount = await prisma.order.count({
        where: { class_id: parseInt(classId), status: { not: 2 } }
    });

    if (studentCount === 0) return 0;

    const totalFee = totalItems > threshold ? baseFee + extraFee : baseFee;
    const perStudent = totalFee / studentCount;

    return Math.round(perStudent * 100) / 100;
};

/**
 * Calculate VAT amount based on subtotal and VAT percentage from settings
 */
export const calculateVAT = async (subtotal) => {
    const vatSetting = await prisma.setting.findUnique({
        where: { key: 'vat_percentage' }
    });

    const vatPercentage = parseFloat(vatSetting?.value || 25); // Default 25% if not found
    const vatAmount = (subtotal * vatPercentage) / 100;

    return {
        vatPercentage,
        vatAmount: Math.round(vatAmount * 100) / 100,
        totalWithVAT: Math.round((subtotal + vatAmount) * 100) / 100
    };
};

/**
 * Calculate complete order pricing including VAT
 */
export const calculateOrderTotal = async (subtotal, classId = null) => {
    const vatCalculation = await calculateVAT(subtotal);
    
    let handlingFee = 0;
    if (classId) {
        handlingFee = await calculateHandlingFeePerStudent(classId);
    }

    const subtotalWithHandling = subtotal + handlingFee;
    const vatOnTotal = await calculateVAT(subtotalWithHandling);

    return {
        subtotal,
        handlingFee,
        subtotalWithHandling,
        vatPercentage: vatOnTotal.vatPercentage,
        vatAmount: vatOnTotal.vatAmount,
        total: vatOnTotal.totalWithVAT
    };
};
