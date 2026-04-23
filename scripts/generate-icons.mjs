import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const FILL = 0.99;
const src = 'public/logo-transparent.png';

async function makeIcon(size, outputName, fill = FILL) {
  const target = Math.round(size * fill);
  const resized = await sharp(src)
    .resize(target, target, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });

  const rW = resized.info.width;
  const rH = resized.info.height;
  const left = Math.round((size - rW) / 2);
  const top = Math.round((size - rH) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized.data, left, top }])
    .png()
    .toFile(`public/${outputName}`);

  console.log(`  ${outputName}: ${size}x${size}`);
}

async function makeIcoBuffer(size, fill = FILL) {
  const target = Math.round(size * fill);
  const resized = await sharp(src)
    .resize(target, target, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((size - resized.info.width) / 2);
  const top = Math.round((size - resized.info.height) / 2);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: resized.data, left, top }])
    .png()
    .toBuffer();
}

const sizes = [
  ['icon-72.png', 72],
  ['icon-96.png', 96],
  ['icon-128.png', 128],
  ['icon-144.png', 144],
  ['icon-152.png', 152],
  ['icon-192.png', 192],
  ['icon-384.png', 384],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['favicon-48.png', 48],
];

for (const [name, size] of sizes) {
  await makeIcon(size, name, 0.99);
}

await makeIcon(512, 'icon-maskable-512.png', 0.65);

const icoBufs = await Promise.all([16, 32, 48].map((s) => makeIcoBuffer(s, 0.99)));
const icoData = await pngToIco(icoBufs);
const fs = await import('fs/promises');
await fs.writeFile('public/favicon.ico', icoData);
console.log('  favicon.ico: 16+32+48');

await sharp(src).resize(86, 86, { fit: 'inside' }).negate({ alpha: false }).toFile('public/badge-icon.png');

console.log('All icons: 99% fill, centered');
