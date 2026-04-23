// Regenerate all app icons (PWA, favicon, notification, badge)
// from public/logo-transparent.png. Each icon has a WHITE background
// with the centered black-triangle logo at the right proportion.
//
// Variants:
//   PWA icons (purpose='any')      — white bg + 18% padding
//   Maskable icon (purpose='maskable') — white bg + 30% padding
//                                        (Android safe zone)
//   Favicons (16/32/48 + ico)      — white bg + 12% padding
//   Notification icon              — transparent bg + 10% padding
//   Badge icon                     — white silhouette on transparent
//                                    (monochrome — Android status bar)
const { Jimp, JimpMime } = require('jimp');
const pngToIco = require('png-to-ico').default;
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'public', 'logo-transparent.png');
const PUB = path.join(__dirname, '..', 'public');

async function makeIcon(srcImg, size, padPct, withWhiteBg) {
  // Padded canvas
  const canvas = new Jimp({
    width: size, height: size,
    color: withWhiteBg ? 0xFFFFFFFF : 0x00000000,
  });

  const pad = Math.round(size * padPct / 100);
  const avail = size - pad * 2;

  // Resize source preserving aspect ratio
  const srcW = srcImg.bitmap.width, srcH = srcImg.bitmap.height;
  const ratio = Math.min(avail / srcW, avail / srcH);
  const newW = Math.round(srcW * ratio);
  const newH = Math.round(srcH * ratio);
  const resized = srcImg.clone().resize({ w: newW, h: newH });

  const x = Math.floor((size - newW) / 2);
  const y = Math.floor((size - newH) / 2);
  canvas.composite(resized, x, y);
  return canvas;
}

// White-silhouette version — for the Android status bar badge.
// Every opaque pixel becomes (255,255,255,a).
async function makeBadge(srcImg, size) {
  const icon = await makeIcon(srcImg, size, 10, false);
  const data = icon.bitmap.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
    }
  }
  return icon;
}

(async () => {
  console.log(`source: ${SRC}`);
  const src = await Jimp.read(SRC);
  console.log(`source dimensions: ${src.bitmap.width} x ${src.bitmap.height}`);

  // PWA + Apple touch icons (white bg + 18% padding)
  const pwaSizes = {
    'icon-72.png': 72,
    'icon-96.png': 96,
    'icon-128.png': 128,
    'icon-144.png': 144,
    'icon-152.png': 152,
    'icon-192.png': 192,
    'icon-384.png': 384,
    'icon-512.png': 512,
    'apple-touch-icon.png': 180,
  };
  for (const [name, size] of Object.entries(pwaSizes)) {
    const icon = await makeIcon(src, size, 18, true);
    const out = path.join(PUB, name);
    await icon.write(out);
    const stat = fs.statSync(out);
    console.log(`wrote: ${name} (${size}x${size}, ${Math.round(stat.size / 1024)} KB)`);
  }

  // Favicons (white bg + 12% padding)
  for (const size of [16, 32, 48]) {
    const icon = await makeIcon(src, size, 12, true);
    await icon.write(path.join(PUB, `favicon-${size}.png`));
  }
  console.log(`wrote: favicon-16.png, favicon-32.png, favicon-48.png`);

  // Multi-size .ico
  const icoBuf = await pngToIco([
    await (await makeIcon(src, 16, 12, true)).getBuffer(JimpMime.png),
    await (await makeIcon(src, 32, 12, true)).getBuffer(JimpMime.png),
    await (await makeIcon(src, 48, 12, true)).getBuffer(JimpMime.png),
  ]);
  fs.writeFileSync(path.join(PUB, 'favicon.ico'), icoBuf);
  console.log(`wrote: favicon.ico (16+32+48)`);

  // Maskable icon (white bg + 30% padding — Android crops outer 10-15%)
  const maskable = await makeIcon(src, 512, 30, true);
  await maskable.write(path.join(PUB, 'icon-maskable-512.png'));
  console.log(`wrote: icon-maskable-512.png (512x512, 30% padding)`);

  // Notification icon (transparent bg + 10% padding)
  const notif = await makeIcon(src, 96, 10, false);
  await notif.write(path.join(PUB, 'notification-icon.png'));
  console.log(`wrote: notification-icon.png (96x96, transparent)`);

  // Badge icon (white silhouette on transparent)
  const badge = await makeBadge(src, 96);
  await badge.write(path.join(PUB, 'badge-icon.png'));
  console.log(`wrote: badge-icon.png (96x96, white silhouette)`);
})().catch(err => { console.error('FAILED:', err); process.exit(1); });
