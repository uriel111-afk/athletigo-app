// One-shot script: read the source AthletiGo black logo (white bg JPEG),
// drop the white background to transparent, soften the anti-aliased
// edges, downscale to 512px max and write out a PNG.
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const SRC = 'F:/AthletiGo/תמונות/Logo/לוגו בשכבות Jpeg/ATHLETIGO_black.1.5.jpg';
const OUT = path.join(__dirname, '..', 'public', 'logo-transparent.png');

(async () => {
  const stat = fs.statSync(SRC);
  console.log(`source: ${SRC}`);
  console.log(`source size: ${stat.size} bytes`);

  const img = await Jimp.read(SRC);
  console.log(`source dimensions: ${img.bitmap.width} x ${img.bitmap.height}`);

  // Walk every pixel — full white -> alpha 0, near-white -> ramped alpha
  // for smooth edges. Black logo body stays opaque.
  const { data, width, height } = img.bitmap;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 230 && g > 230 && b > 230) {
      data[i + 3] = 0;
    } else if (r > 200 && g > 200 && b > 200) {
      const avg = (r + g + b) / 3;
      // Map [200..230] -> alpha [255..0]
      const t = Math.max(0, Math.min(1, (avg - 200) / 30));
      data[i + 3] = Math.round(255 * (1 - t));
    }
  }

  // Auto-crop fully-transparent borders so the logo fills the frame.
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

  // Resize so the longest side is at most 512px while keeping aspect.
  const MAX = 512;
  const cw = img.bitmap.width;
  const ch = img.bitmap.height;
  const ratio = Math.min(MAX / cw, MAX / ch);
  if (ratio < 1) {
    const w = Math.round(cw * ratio);
    const h = Math.round(ch * ratio);
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
