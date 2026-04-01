import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const COUNTRIES = [
    { name: 'Paris', code: 'FR' },
    { name: 'Rome', code: 'IT' },
    { name: 'Barcelona', code: 'ES' },
    { name: 'Amsterdam', code: 'NL' },
    { name: 'Prague', code: 'CZ' },
    { name: 'Vienna', code: 'AT' },
    { name: 'Berlin', code: 'DE' },
    { name: 'London', code: 'GB' },
    { name: 'Lisbon', code: 'PT' },
    { name: 'Athens', code: 'GR' },
    { name: 'Budapest', code: 'HU' },
    { name: 'Copenhagen', code: 'DK' },
    { name: 'Stockholm', code: 'SE' },
    { name: 'Oslo', code: 'NO' },
    { name: 'Helsinki', code: 'FI' },
    { name: 'Brussels', code: 'BE' },
    { name: 'Madrid', code: 'ES' },
    { name: 'Dublin', code: 'IE' },
    { name: 'Edinburgh', code: 'GB' },
    { name: 'Krakow', code: 'PL' },
    { name: 'Dubrovnik', code: 'HR' },
    { name: 'Reykjavik', code: 'IS' },
    { name: 'Tallinn', code: 'EE' },
    { name: 'Riga', code: 'LV' },
    { name: 'Vilnius', code: 'LT' },
    { name: 'Warsaw', code: 'PL' },
    { name: 'Zurich', code: 'CH' },
    { name: 'Geneva', code: 'CH' },
    { name: 'Milan', code: 'IT' },
    { name: 'Florence', code: 'IT' },
];

async function main() {
    // Seed admin
    const hashedPassword = await bcrypt.hash('123123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@admin.com' },
        update: {},
        create: {
            name: 'Admin',
            email: 'admin@admin.com',
            password: hashedPassword,
            role: 'admin',
        },
    });
    console.log('Admin seeded:', admin.email);

    // Seed countries
    let created = 0;
    for (const country of COUNTRIES) {
        await prisma.country.upsert({
            where: { name: country.name },
            update: {},
            create: { name: country.name, code: country.code, status: 0 }
        });
        created++;
    }
    console.log(`Countries seeded: ${created}`);
    process.exit(0);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
