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
  let fontsCreated = 0;
  for (const font of FONTS) {
    await prisma.font.upsert({
      where: { name: font.name },
      update: { google_font_url: font.url },
      create: { name: font.name, google_font_url: font.url, status: 0 }
    });
    fontsCreated++;
  }
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

  // Seed email templates
  const EMAIL_TEMPLATES = [
    {
      name: 'Graduation Cap Promotion',
      subject: 'Din studenterhue venter på dig 🎓',
      category: 'marketing',
      is_default: true,
      html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#00b96b;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🎓 Studenterhuer</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hej {{name}},</p>
    <p>Du har for nylig bestilt jeres klassebeklædning — nu er det tid til at fuldende looket med en <strong>personlig studenterhue</strong>.</p>
    <p>Vi tilbyder fuldt tilpassede studenterhuer, der matcher jeres klassestil. Gå ikke glip af det!</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk/caps" style="background:#00b96b;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
        Udforsk studenterhuer
      </a>
    </div>
    <p style="color:#999;font-size:12px;">Du modtager denne e-mail, fordi du har bestilt klassebeklædning hos os.</p>
  </div>
</div>`
    },

    {
      name: 'Order Reminder',
      subject: 'Glem ikke at færdiggøre din ordre ⏰',
      category: 'reminder',
      is_default: false,
      html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#e67e22;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">⏰ Påmindelse</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hej {{name}},</p>
    <p>Fristen for jeres klasseordre nærmer sig. Sørg for, at design, logo og leveringsoplysninger er færdiggjort.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#e67e22;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
        Færdiggør min ordre
      </a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
    },

    {
      name: 'Welcome to StudentLife',
      subject: 'Velkommen til StudentLife 🎉',
      category: 'transactional',
      is_default: false,
      html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#006d75;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Velkommen 🎉</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hej {{name}},</p>
    <p>Velkommen til <strong>StudentLife</strong>! Vi glæder os til at hjælpe dig med at skabe den perfekte klassebeklædning og studenteroplevelse.</p>
    <p>Start med at udforske dit dashboard og tilpas jeres klassedesign.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#006d75;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
        Kom i gang
      </a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
    },

    {
      name: 'Special Offer',
      subject: 'Eksklusivt tilbud til jeres klasse 🎁',
      category: 'marketing',
      is_default: false,
      html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#722ed1;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🎁 Særligt tilbud</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hej {{name}},</p>
    <p>Vi har et eksklusivt tilbud specielt til jeres klasse. Fuldfør jeres studenterlook med vores premium produkter til en særlig pris.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="https://studentlife.dk" style="background:#722ed1;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-size:16px;font-weight:bold;">
        Få tilbuddet
      </a>
    </div>
    <p style="color:#999;font-size:12px;">StudentLife – studentlife.dk</p>
  </div>
</div>`
    },

    {
      name: 'Order Shipped',
      subject: 'Din ordre er på vej 🚚',
      category: 'transactional',
      is_default: false,
      html_body: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;">
  <div style="background:#27ae60;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🚚 Ordren er sendt</h1>
  </div>
  <div style="padding:24px;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="font-size:16px;">Hej {{name}},</p>
    <p>Gode nyheder! Din ordre er blevet sendt og er på vej til dig.</p>
    <p>Du vil modtage den inden for den forventede leveringsperiode.</p>
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
