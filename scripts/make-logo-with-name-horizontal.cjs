// Combine the transparent triangle and the ATHLETIGO wordmark
// side-by-side into a single horizontal PNG. Used by the header
// so the brand is one centered unit at small heights (~28px).
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const PUB = path.join(__dirname, '..', 'public');
const OUT = path.join(PUB, 'logo-with-name.png');

(async () => {
  const triangle = await Jimp.read(path.join(PUB, 'logo-transparent.png'));
  const text = await Jimp.read(path.join(PUB, 'athletigo-text.png'));
  console.log(`triangle: ${triangle.bitmap.width} x ${triangle.bitmap.height}`);
  console.log(`text:     ${text.bitmap.width} x ${text.bitmap.height}`);

  // Normalize both to the same height so they're visually balanced.
  const TARGET_H = 80;
  const triRatio = TARGET_H / triangle.bitmap.height;
  triangle.resize({ w: Math.round(triangle.bitmap.width * triRatio), h: TARGET_H });
  const txtRatio = TARGET_H / text.bitmap.height;
  text.resize({ w: Math.round(text.bitmap.width * txtRatio), h: TARGET_H });

  // Side-by-side layout: text on the left, triangle on the right.
  const GAP = 15;
  const totalW = text.bitmap.width + GAP + triangle.bitmap.width;
  const combined = new Jimp({ width: totalW, height: TARGET_H, color: 0x00000000 });
  combined.composite(text, 0, 0);
  combined.composite(triangle, text.bitmap.width + GAP, 0);

  // Auto-crop transparent edges (probably none, but harmless).
  const data = combined.bitmap.data;
  const w = combined.bitmap.width, h = combined.bitmap.height;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX >= minX && maxY >= minY) {
    combined.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }

  await combined.write(OUT);
  const stat = fs.statSync(OUT);
  console.log(`wrote: ${OUT}`);
  console.log(`final: ${combined.bitmap.width} x ${combined.bitmap.height}, ${stat.size} bytes (${Math.round(stat.size / 1024)} KB)`);
})().catch(err => { console.error('FAILED:', err); process.exit(1); });
