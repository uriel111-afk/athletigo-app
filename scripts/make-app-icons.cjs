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

async function makeIcon(srcImg, size, padPct, withWhiteBg, raisePct = 3) {
  // Canvas
  const canvas = new Jimp({
    width: size, height: size,
    color: withWhiteBg ? 0xFFFFFFFF : 0x00000000,
  });

  const pad = Math.round(size * padPct / 100);
  const avail = Math.max(1, size - pad * 2);

  // Resize source preserving aspect ratio (fits inside the available
  // square — the longer side hits the limit, the shorter has a small
  // transparent gap from the aspect ratio).
  const srcW = srcImg.bitmap.width, srcH = srcImg.bitmap.height;
  const ratio = Math.min(avail / srcW, avail / srcH);
  const newW = Math.round(srcW * ratio);
  const newH = Math.round(srcH * ratio);
  const resized = srcImg.clone().resize({ w: newW, h: newH });

  // Center horizontally; raise vertically by raisePct of the canvas
  // (the logo's optical center sits below the geometric center
  // because the triangle has more pixel mass at the bottom — moving
  // up a few percent restores the visual balance).
  const x = Math.floor((size - newW) / 2);
  const y = Math.max(0, Math.floor((size - newH) / 2 - size * raisePct / 100));
  canvas.composite(resized, x, y);
  return canvas;
}

// White-silhouette version — for the Android status bar badge.
// Every opaque pixel becomes (255,255,255,a).
async function makeBadge(srcImg, size) {
  const icon = await makeIcon(srcImg, size, 8, false);
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

  // PWA + Apple touch icons — 100% fill (0% padding) + raised 3%
  // from center to compensate for the triangle's bottom-heavy
  // optical weight. The longest side of the logo hits the canvas
  // edge; the shorter side has a small natural transparent gap
  // from the aspect ratio (white bg shows through).
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
    const icon = await makeIcon(src, size, 0, true, 3);
    const out = path.join(PUB, name);
    await icon.write(out);
    const stat = fs.statSync(out);
    console.log(`wrote: ${name} (${size}x${size}, ${Math.round(stat.size / 1024)} KB)`);
  }

  // Favicons — 100% fill, raised 3% (matches PWA icons)
  for (const size of [16, 32, 48]) {
    const icon = await makeIcon(src, size, 0, true, 3);
    await icon.write(path.join(PUB, `favicon-${size}.png`));
  }
  console.log(`wrote: favicon-16.png, favicon-32.png, favicon-48.png`);

  // Multi-size .ico
  const icoBuf = await pngToIco([
    await (await makeIcon(src, 16, 0, true, 3)).getBuffer(JimpMime.png),
    await (await makeIcon(src, 32, 0, true, 3)).getBuffer(JimpMime.png),
    await (await makeIcon(src, 48, 0, true, 3)).getBuffer(JimpMime.png),
  ]);
  fs.writeFileSync(path.join(PUB, 'favicon.ico'), icoBuf);
  console.log(`wrote: favicon.ico (16+32+48)`);

  // Maskable icon — logo at 65% of canvas (matches the user's
  // sharp-based recipe: mf = Math.round(512*0.65)), centered
  // (no raise — Android crops the outer ~17.5% so vertical
  // shifting would defeat the safe zone). Equivalent to padPct
  // of (100-65)/2 = 17.5%.
  const maskable = await makeIcon(src, 512, 17.5, true, 0);
  await maskable.write(path.join(PUB, 'icon-maskable-512.png'));
  console.log(`wrote: icon-maskable-512.png (512x512, ~17.5% padding, centered)`);

  // Notification icon (transparent bg + 8% padding)
  const notif = await makeIcon(src, 96, 8, false);
  await notif.write(path.join(PUB, 'notification-icon.png'));
  console.log(`wrote: notification-icon.png (96x96, transparent)`);

  // Badge icon (white silhouette on transparent, 8% padding)
  const badge = await makeBadge(src, 96);
  await badge.write(path.join(PUB, 'badge-icon.png'));
  console.log(`wrote: badge-icon.png (96x96, white silhouette)`);
})().catch(err => { console.error('FAILED:', err); process.exit(1); });
