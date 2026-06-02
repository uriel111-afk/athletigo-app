import sharp from 'sharp';
import { existsSync } from 'fs';

const cream = { r: 255, g: 249, b: 240, alpha: 1 };

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
  const path = `public/icon-${size}.png`;
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: cream
    }
  })
  .png()
  .toFile(path);
  console.log('created:', path);
}

await sharp({
  create: { width: 512, height: 512, channels: 3, background: cream }
}).png().toFile('public/icon-maskable-512.png');

await sharp({
  create: { width: 192, height: 192, channels: 3, background: cream }
}).png().toFile('public/icon-maskable-192.png');

await sharp({
  create: { width: 180, height: 180, channels: 3, background: cream }
}).png().toFile('public/apple-touch-icon.png');

console.log('all done');
