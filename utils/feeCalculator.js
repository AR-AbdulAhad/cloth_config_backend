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
