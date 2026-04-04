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

const FONTS = [
    { name: 'Roboto', url: 'https://fonts.googleapis.com/css2?family=Roboto&display=swap' },
    { name: 'Open Sans', url: 'https://fonts.googleapis.com/css2?family=Open+Sans&display=swap' },
    { name: 'Lato', url: 'https://fonts.googleapis.com/css2?family=Lato&display=swap' },
    { name: 'Poppins', url: 'https://fonts.googleapis.com/css2?family=Poppins&display=swap' },
    { name: 'Raleway', url: 'https://fonts.googleapis.com/css2?family=Raleway&display=swap' },
    { name: 'Oswald', url: 'https://fonts.googleapis.com/css2?family=Oswald&display=swap' },
    { name: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
    { name: 'Anton', url: 'https://fonts.googleapis.com/css2?family=Anton&display=swap' },
    { name: 'Playfair Display', url: 'https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap' },
    { name: 'Dancing Script', url: 'https://fonts.googleapis.com/css2?family=Dancing+Script&display=swap' },
    { name: 'Pacifico', url: 'https://fonts.googleapis.com/css2?family=Pacifico&display=swap' },
    { name: 'Lobster', url: 'https://fonts.googleapis.com/css2?family=Lobster&display=swap' },
    { name: 'Montserrat', url: 'https://fonts.googleapis.com/css2?family=Montserrat&display=swap' },
    { name: 'Nunito', url: 'https://fonts.googleapis.com/css2?family=Nunito&display=swap' },
    { name: 'Abril Fatface', url: 'https://fonts.googleapis.com/css2?family=Abril+Fatface&display=swap' },
    { name: 'Righteous', url: 'https://fonts.googleapis.com/css2?family=Righteous&display=swap' },
    { name: 'Merriweather', url: 'https://fonts.googleapis.com/css2?family=Merriweather&display=swap' },
    { name: 'Ubuntu', url: 'https://fonts.googleapis.com/css2?family=Ubuntu&display=swap' },
    { name: 'Permanent Marker', url: 'https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap' },
    { name: 'Satisfy', url: 'https://fonts.googleapis.com/css2?family=Satisfy&display=swap' },
];

async function main() {
    // Seed admin
    // const hashedPassword = await bcrypt.hash('123123', 10);
    // const admin = await prisma.user.upsert({
    //     where: { email: 'admin@admin.com' },
    //     update: {},
    //     create: { name: 'Admin', email: 'admin@admin.com', password: hashedPassword, role: 'admin' },
    // });
    // console.log('Admin seeded:', admin.email);

    // Seed countries
    // let countriesCreated = 0;
    // for (const country of COUNTRIES) {
    //     await prisma.country.upsert({
    //         where: { name: country.name },
    //         update: {},
    //         create: { name: country.name, code: country.code, status: 0 }
    //     });
    //     countriesCreated++;
    // }
    // console.log(`Countries seeded: ${countriesCreated}`);

    // Seed fonts
    let fontsCreated = 0;
    for (const font of FONTS) {
        await prisma.font.upsert({
            where: { name: font.name },
            update: { google_font_url: font.url },
            create: { name: font.name, google_font_url: font.url, status: 0 }
        });
        fontsCreated++;
    }
    console.log(`Fonts seeded: ${fontsCreated}`);
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
