import prisma from "./config/prisma.js";

async function check() {
    try {
        const list = await prisma.nameList.findMany({
            include: { items: true }
        });
        console.log(JSON.stringify(list, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
