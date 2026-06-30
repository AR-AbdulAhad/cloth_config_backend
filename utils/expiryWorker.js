import prisma from "../config/prisma.js";

export const checkExpiredHoldOrders = async () => {
    try {
        const now = new Date();
        
        // Find all expired on_hold orders
        const expiredOrders = await prisma.order.findMany({
            where: {
                process_status: 'on_hold',
                status: { not: 2 },
                hold_deadline: {
                    lt: now
                }
            }
        });

        if (expiredOrders.length === 0) {
            return { success: true, count: 0 };
        }

        const orderIds = expiredOrders.map(o => o.id);

        // Update them to locked_awaiting_payment
        const updateResult = await prisma.order.updateMany({
            where: {
                id: { in: orderIds }
            },
            data: {
                process_status: 'locked_awaiting_payment',
                is_locked: true,
                locked_at: now
            }
        });


        return { success: true, count: updateResult.count, lockedIds: orderIds };
    } catch (error) {
        console.error("[Expiry Worker] Error locking expired orders:", error.message);
        return { success: false, error: error.message };
    }
};
