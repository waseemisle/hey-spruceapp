const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'public', 'logo.png');
const OUT = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const brandBg = { r: 255, g: 255, b: 255, alpha: 1 };

async function run() {
  for (const size of sizes) {
    await sharp(SRC)
      .resize(size, size, { fit: 'contain', background: brandBg })
      .png()
      .toFile(path.join(OUT, `icon-${size}.png`));
  }

  const maskablePadding = 0.2;
  for (const size of [192, 512]) {
    const inner = Math.round(size * (1 - maskablePadding * 2));
    const offset = Math.round((size - inner) / 2);
    const resized = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: brandBg }).png().toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: brandBg },
    })
      .composite([{ input: resized, top: offset, left: offset }])
      .png()
      .toFile(path.join(OUT, `maskable-${size}.png`));
  }

  await sharp(SRC)
    .resize(180, 180, { fit: 'contain', background: brandBg })
    .png()
    .toFile(path.join(OUT, 'apple-touch-icon.png'));

  await sharp(SRC).resize(32, 32).png().toFile(path.join(OUT, 'favicon-32.png'));
  await sharp(SRC).resize(16, 16).png().toFile(path.join(OUT, 'favicon-16.png'));

  console.log('PWA icons generated in public/icons/');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
