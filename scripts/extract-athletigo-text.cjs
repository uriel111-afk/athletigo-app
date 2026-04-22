// Extract just the ATHLETIGO wordmark from the layered black logo
// JPEG (which has the triangle on top and the wordmark below) and
// save it as its own transparent PNG sized for the header (~30px
// tall). Same white->alpha pipeline as the prior logo conversions.
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

const SRC = 'F:/AthletiGo/תמונות/Logo/לוגו בשכבות Jpeg/ATHLETIGO_black.1.jpg';
const OUT_TEXT = path.join(__dirname, '..', 'public', 'athletigo-text.png');

(async () => {
  console.log(`source: ${SRC}`);
  const img = await Jimp.read(SRC);
  const { width, height } = img.bitmap;
  console.log(`source dimensions: ${width} x ${height}`);

  // White -> transparent + soft anti-aliased edges.
  const data = img.bitmap.data;
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

  // Per-row alpha sums so we can find the gap between triangle and text.
  const rowAlpha = new Array(height).fill(0);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const base = y * width * 4;
    for (let x = 0; x < width; x++) sum += data[base + x * 4 + 3];
    rowAlpha[y] = sum;
  }

  // First and last opaque rows (overall content bounds).
  const isOpaque = (y) => rowAlpha[y] > 100;
  let topOpaque = 0; while (topOpaque < height && !isOpaque(topOpaque)) topOpaque++;
  let bottomOpaque = height - 1; while (bottomOpaque > 0 && !isOpaque(bottomOpaque)) bottomOpaque--;
  console.log(`opaque rows: ${topOpaque}..${bottomOpaque}`);

  // Walk down from the middle looking for >=3 consecutive empty rows.
  // That's the gap separating the triangle (top) from the wordmark (bottom).
  let splitY = null;
  for (let y = Math.floor(height * 0.3); y < Math.floor(height * 0.85); y++) {
    if (!isOpaque(y)) {
      let gap = 0;
      for (let y2 = y; y2 < Math.min(y + 20, height); y2++) {
        if (!isOpaque(y2)) gap++;
      }
      if (gap >= 3) { splitY = y; break; }
    }
  }
  if (splitY === null) splitY = Math.floor(height * 0.7);
  console.log(`split at y=${splitY}`);

  // First opaque row below the split = top of the wordmark.
  let textTop = splitY;
  while (textTop < height && !isOpaque(textTop)) textTop++;
  const textBottom = bottomOpaque;
  console.log(`text rows: ${textTop}..${textBottom}`);

  // Find horizontal extent of the wordmark band.
  let minX = width, maxX = -1;
  for (let y = textTop; y <= textBottom; y++) {
    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[base + x * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  const tw = maxX - minX + 1;
  const th = textBottom - textTop + 1;
  console.log(`text bbox: ${tw} x ${th} at (${minX}, ${textTop})`);

  img.crop({ x: minX, y: textTop, w: tw, h: th });

  // Resize to a nominal 30px height (header will display it 18-24px;
  // saving 30 gives @1.5x for crispness on retina displays).
  const targetH = 30;
  const ratio = targetH / th;
  img.resize({ w: Math.round(tw * ratio), h: targetH });

  await img.write(OUT_TEXT);
  const stat = fs.statSync(OUT_TEXT);
  console.log(`wrote: ${OUT_TEXT}`);
  console.log(`final: ${img.bitmap.width} x ${img.bitmap.height}, ${stat.size} bytes (${Math.round(stat.size / 1024)} KB)`);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
