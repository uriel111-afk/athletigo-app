// Convert the layered ATHLETIGO_black.1 JPEG (triangle + ATHLETIGO
// wordmark on white) to a transparent PNG, auto-cropped, max 600px
// wide. Same pipeline as scripts/make-transparent-logo.cjs.
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const SRC = 'F:/AthletiGo/תמונות/Logo/לוגו בשכבות Jpeg/ATHLETIGO_black.1.jpg';
const OUT = path.join(__dirname, '..', 'public', 'logo-with-name.png');

(async () => {
  const stat = fs.statSync(SRC);
  console.log(`source: ${SRC}`);
  console.log(`source size: ${stat.size} bytes`);

  const img = await Jimp.read(SRC);
  console.log(`source dimensions: ${img.bitmap.width} x ${img.bitmap.height}`);

  const { data, width, height } = img.bitmap;
  // Pass 1: full white -> transparent. Soft anti-aliased edges
  // (200..230) get ramped alpha so the wordmark's curves stay clean.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 230 && g > 230 && b > 230) {
      data[i + 3] = 0;
    } else if (r > 200 && g > 200 && b > 200) {
      const avg = (r + g + b) / 3;
      const t = Math.max(0, Math.min(1, (avg - 200) / 30));
      data[i + 3] = Math.round(255 * (1 - t));
    }
  }

  // Auto-crop fully-transparent borders.
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX >= minX && maxY >= minY) {
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    img.crop({ x: minX, y: minY, w: cw, h: ch });
    console.log(`cropped to content: ${cw} x ${ch}`);
  }

  // Resize so width <= 600 (preserve aspect — height is "auto" in CSS).
  const MAX_W = 600;
  if (img.bitmap.width > MAX_W) {
    const ratio = MAX_W / img.bitmap.width;
    const w = Math.round(img.bitmap.width * ratio);
    const h = Math.round(img.bitmap.height * ratio);
    img.resize({ w, h });
    console.log(`resized to: ${w} x ${h}`);
  }

  await img.write(OUT);
  const finalStat = fs.statSync(OUT);
  console.log(`wrote: ${OUT}`);
  console.log(`final size: ${finalStat.size} bytes (${Math.round(finalStat.size / 1024)} KB)`);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
