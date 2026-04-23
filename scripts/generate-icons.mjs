import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { promises as fs } from 'fs';
import path from 'path';

const PUBLIC_DIR = 'public';
const SRC = path.join(PUBLIC_DIR, 'logo-transparent.png');
const FILL = 0.99;

const trimmed = await sharp(SRC).trim().png().toBuffer();

async function makeIcon(size, fill = FILL) {
  const target = Math.round(size * fill);
  const resized = await sharp(trimmed)
    .resize(target, target, { fit: 'inside' })
    .png()
    .toBuffer();
  const { width: rW, height: rH } = await sharp(resized).metadata();
  const left = Math.round((size - rW) / 2);
  const top = Math.round((size - rH) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const sizes = {
  'icon-72.png': 72,
  'icon-96.png': 96,
  'icon-128.png': 128,
  'icon-144.png': 144,
  'icon-152.png': 152,
  'icon-192.png': 192,
  'icon-384.png': 384,
  'icon-512.png': 512,
  'apple-touch-icon.png': 180,
  'favicon-16.png': 16,
  'favicon-32.png': 32,
  'favicon-48.png': 48,
};

for (const [name, size] of Object.entries(sizes)) {
  const buf = await makeIcon(size, FILL);
  await fs.writeFile(path.join(PUBLIC_DIR, name), buf);
  console.log(`  ${name}: ${size}x${size}`);
}

const mask = await makeIcon(512, 0.65);
await fs.writeFile(path.join(PUBLIC_DIR, 'icon-maskable-512.png'), mask);

const icoBufs = await Promise.all([16, 32, 48].map((s) => makeIcon(s, FILL)));
const icoData = await pngToIco(icoBufs);
await fs.writeFile(path.join(PUBLIC_DIR, 'favicon.ico'), icoData);

const badgeTarget = Math.round(96 * FILL);
const alpha = await sharp(trimmed)
  .resize(badgeTarget, badgeTarget, { fit: 'inside' })
  .ensureAlpha()
  .extractChannel('alpha')
  .toBuffer();
const { width: bW, height: bH } = await sharp(alpha).metadata();
const whiteLogo = await sharp({
  create: { width: bW, height: bH, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .joinChannel(alpha)
  .png()
  .toBuffer();
await sharp({
  create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: whiteLogo, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(PUBLIC_DIR, 'badge-icon.png'));

console.log('All icons: 99% fill, centered');
