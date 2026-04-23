import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { promises as fs } from 'fs';
import path from 'path';

const PUBLIC_DIR = 'public';
const srcPath = path.join(PUBLIC_DIR, 'logo-transparent.png');

const trimmed = await sharp(srcPath).trim().png().toBuffer();
const meta = await sharp(trimmed).metadata();

async function makeIcon(size, fillPercent = 95) {
  const target = Math.floor((size * fillPercent) / 100);
  const ratio = Math.min(target / meta.width, target / meta.height);
  const newW = Math.max(1, Math.round(meta.width * ratio));
  const newH = Math.max(1, Math.round(meta.height * ratio));

  const resized = await sharp(trimmed)
    .resize(newW, newH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
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
  const buf = await makeIcon(size, 95);
  await fs.writeFile(path.join(PUBLIC_DIR, name), buf);
}

const mask = await makeIcon(512, 65);
await fs.writeFile(path.join(PUBLIC_DIR, 'icon-maskable-512.png'), mask);

const icoBufs = await Promise.all([16, 32, 48].map((s) => makeIcon(s, 95)));
const icoData = await pngToIco(icoBufs);
await fs.writeFile(path.join(PUBLIC_DIR, 'favicon.ico'), icoData);

const badgeTarget = Math.floor((96 * 95) / 100);
const badgeRatio = Math.min(badgeTarget / meta.width, badgeTarget / meta.height);
const badgeW = Math.max(1, Math.round(meta.width * badgeRatio));
const badgeH = Math.max(1, Math.round(meta.height * badgeRatio));

const alpha = await sharp(trimmed)
  .resize(badgeW, badgeH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .extractChannel('alpha')
  .toBuffer();

const whiteLogo = await sharp({
  create: {
    width: badgeW,
    height: badgeH,
    channels: 3,
    background: { r: 255, g: 255, b: 255 },
  },
})
  .joinChannel(alpha, { raw: undefined })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 96,
    height: 96,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: whiteLogo, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(PUBLIC_DIR, 'badge-icon.png'));

console.log('All icons: 95% fill');
