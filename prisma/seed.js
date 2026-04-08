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
    // Seed default settings
    const defaultSettings = [
        { key: 'handling_fee', value: '500', description: 'Base handling fee for the class (DKK)' },
        { key: 'handling_fee_enabled', value: 'true', description: 'Enable or disable handling fee' },
        { key: 'handling_fee_threshold', value: '20', description: 'Max items covered by base handling fee' },
        { key: 'handling_fee_extra', value: '250', description: 'Extra handling fee when items exceed threshold (DKK)' },
        { key: 'vat_percentage', value: '25', description: 'VAT percentage applied to orders' },
        { key: 'order_edit_days', value: '3', description: 'Number of business days students can edit order' },
        { key: 'price_T-SHIRT', value: '200', description: 'Price for T-Shirt (DKK)' },
        { key: 'price_SWEATSHIRT', value: '350', description: 'Price for Sweatshirt (DKK)' },
        { key: 'price_HOODIE', value: '450', description: 'Price for Hoodie (DKK)' },
        { key: 'price_ZIPPERHOODIE', value: '500', description: 'Price for Zipper Hoodie (DKK)' },
        { key: 'price_SWEATPANTS', value: '300', description: 'Price for Sweatpants (DKK)' },
        { key: 'price_SHORTS', value: '250', description: 'Price for Shorts (DKK)' },
    ];
    for (const s of defaultSettings) {
        await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
    }
    console.log('Settings seeded');

    // Seed email templates
    const EMAIL_TEMPLATES = [
        {
            name: 'Graduation Cap Promotion',
            subject: 'Your graduation cap awaits 🎓',
            category: 'marketing',
            is_default: true,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#00b96b;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🎓 Graduation Caps</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hi {{name}},</p>
    <p>You recently ordered your class clothing — now it's time to complete the look with a <strong>custom graduation cap</strong>.</p>
    <p>We offer fully personalized graduation caps to match your class style. Don't miss out!</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk/caps" style="background:#00b96b;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">Explore Graduation Caps</a>
    </div>
    <p style="color:#999;font-size:12px;">You're receiving this because you ordered class clothing with us.</p>
  </div>
</div>`
        },
        {
            name: 'Order Reminder',
            subject: 'Don\'t forget to complete your order ⏰',
            category: 'reminder',
            is_default: false,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#e67e22;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">⏰ Reminder</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hi {{name}},</p>
    <p>Your class order deadline is approaching. Make sure your design, logo, and delivery details are finalized.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#e67e22;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">Complete My Order</a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
        },
        {
            name: 'Welcome to StudentLife',
            subject: 'Welcome to StudentLife 🎉',
            category: 'transactional',
            is_default: false,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#006d75;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Welcome 🎉</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hi {{name}},</p>
    <p>Welcome to <strong>StudentLife</strong>! We're excited to help you create the perfect class clothing and graduation experience.</p>
    <p>Start by exploring your dashboard and customizing your class design.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#006d75;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">Get Started</a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
        },
        {
            name: 'Special Offer',
            subject: 'Exclusive offer just for your class 🎁',
            category: 'marketing',
            is_default: false,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#722ed1;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🎁 Special Offer</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hi {{name}},</p>
    <p>We have an exclusive offer just for your class. Complete your graduation look with our premium products at a special price.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#722ed1;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">Claim Offer</a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
        },
        {
            name: 'Order Shipped',
            subject: 'Your order is on its way 🚚',
            category: 'transactional',
            is_default: false,
            html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#27ae60;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🚚 Order Shipped</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hi {{name}},</p>
    <p>Great news! Your order has been shipped and is on its way to you.</p>
    <p>You will receive it within the estimated delivery window. Stay tuned!</p>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
        }
    ];

    for (const t of EMAIL_TEMPLATES) {
        await prisma.emailTemplate.upsert({
            where: { name: t.name },
            update: { subject: t.subject, html_body: t.html_body, category: t.category },
            create: t
        });
    }
    console.log(`Email templates seeded: ${EMAIL_TEMPLATES.length}`);

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
