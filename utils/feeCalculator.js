import prisma from "../config/prisma.js";

/**
 * Calculate handling fee per student for a class based on expected student count.
 *
 * Logic:
 * - Use class.expected_students, same as the frontend modal
 * - If expected_students <= threshold: totalFee = baseFee
 * - If expected_students > threshold: totalFee = baseFee + extraFee
 * - Per student fee = totalFee / expected_students
 */
export const calculateHandlingFeePerStudent = async (classId) => {
    if (!classId) return 0;   // ← null/undefined classId → no fee

    const settings = await prisma.setting.findMany({
        where: { key: { in: ['handling_fee', 'handling_fee_enabled', 'handling_fee_threshold', 'handling_fee_extra'] } }
    });

    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));

    if (map.handling_fee_enabled !== 'true') return 0;

    const baseFee = parseFloat(map.handling_fee || 500);
    const threshold = parseInt(map.handling_fee_threshold || 20);
    const extraFee = parseFloat(map.handling_fee_extra || 250);

    const classInfo = await prisma.classes.findUnique({
        where: { id: parseInt(classId) },
        select: { expected_students: true }
    });

    const expectedStudents = parseInt(classInfo?.expected_students || 0);
    if (!expectedStudents || expectedStudents <= 0) return 0;

    const totalFee = expectedStudents > threshold ? baseFee + extraFee : baseFee;
    const perStudent = totalFee / expectedStudents;

    return Math.round(perStudent * 100) / 100;
};

/**
 * Calculate shipping fee per student for a class.
 *
 * The class rep picks a shipping option (regular/express) for the whole
 * class (classes.delivery_details.shippingOption) against a country's
 * selectedShippingRate. The base amount is derived fresh from
 * selectedShippingRate[shippingOption + '_delivery_rate'] on every call —
 * NOT from the flat delivery_details.shippingPrice field, which is just a
 * snapshot taken at selection time and can go stale if the admin later
 * changes that country's rate. Falls back to shippingPrice only if
 * selectedShippingRate is missing (older records).
 *
 * Only the class-size threshold is centrally configured (Setting
 * delivery_fee_threshold):
 * - expected_students <= threshold: totalFee = base rate (unchanged)
 * - expected_students > threshold:  totalFee = base rate * 2
 * - Per student fee = totalFee / expected_students
 *
 * Recalculates on every call, so changing expected_students automatically
 * changes the price on the next order total calculation.
 */
export const calculateShippingFeePerStudent = async (classId) => {
    if (!classId) return 0;

    const classInfo = await prisma.classes.findUnique({
        where: { id: parseInt(classId) },
        select: { delivery_details: true, expected_students: true }
    });

    if (!classInfo?.delivery_details) return 0;

    let delivery;
    try {
        delivery = typeof classInfo.delivery_details === 'string'
            ? JSON.parse(classInfo.delivery_details)
            : classInfo.delivery_details;
    } catch {
        return 0;
    }

    const selectedRate = delivery?.selectedShippingRate;
    const shippingOption = delivery?.shippingOption === 'express' ? 'express' : 'regular';

    const shippingPrice = selectedRate && selectedRate[`${shippingOption}_delivery_rate`] != null
        ? parseFloat(selectedRate[`${shippingOption}_delivery_rate`])
        : 0;
    if (!shippingPrice) return 0;

    const expectedStudents = parseInt(classInfo.expected_students || 0);
    if (!expectedStudents || expectedStudents <= 0) return 0;

    const thresholdSetting = await prisma.setting.findUnique({ where: { key: 'delivery_fee_threshold' } });
    const threshold = parseInt(thresholdSetting?.value || 20);

    const totalFee = expectedStudents > threshold ? shippingPrice * 2 : shippingPrice;
    const perStudent = totalFee / expectedStudents;

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
