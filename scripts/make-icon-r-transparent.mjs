// One-shot: takes the "Icon R.png" source (which ships with a solid
// black background and no alpha channel) and emits
// public/logo-r-transparent.png with the dark background made fully
// transparent and the edges tight-cropped.
//
// Pixel rule per the install-banner task spec:
//   any pixel where R<40 AND G<40 AND B<40 → alpha = 0
// All other pixels keep their original RGB and full opacity.
import sharp from 'sharp';
import path from 'node:path';

const SRC = 'F:/AthletiGo/תמונות/Logo/לוגו בשכבות Jpeg/Icon R.png';
const DST = path.resolve('public/logo-r-transparent.png');

const raw = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data, info } = raw;

let touched = 0;
for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (r < 40 && g < 40 && b < 40) {
    data[i + 3] = 0;
    touched++;
  }
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim()
  .toFile(DST);

const meta = await sharp(DST).metadata();
console.log(`Source: ${info.width}x${info.height} (channels=${info.channels})`);
console.log(`Pixels made transparent: ${touched} (${((touched / (info.width * info.height)) * 100).toFixed(1)}%)`);
console.log(`Output: ${DST}`);
console.log(`Output dimensions: ${meta.width}x${meta.height}  channels=${meta.channels}  hasAlpha=${meta.hasAlpha}`);
