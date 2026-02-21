import prisma from "./config/prisma.js";

async function check() {
    try {
        const updated = await prisma.nameList.update({
            where: { id: 2 },
            data: { process_status: "approved" }
        });
        console.log("Success!", updated);
    } catch (e) {
        console.error("Failed:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
