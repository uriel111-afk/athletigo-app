import sharp from 'sharp';
import { promises as fs } from 'fs';

async function makeFavicon(size, output) {
  const resized = await sharp('public/logo-transparent.png')
    .resize(size, size, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer({ resolveWithObject: true });

  await sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{
    input: resized.data,
    left: Math.round((size - resized.info.width) / 2),
    top: Math.round((size - resized.info.height) / 2),
  }]).png().toFile(`public/${output}`);
  console.log(`${output}: ${size}x${size} TRANSPARENT`);
}

await makeFavicon(16, 'favicon-16.png');
await makeFavicon(32, 'favicon-32.png');
await makeFavicon(48, 'favicon-48.png');
await fs.copyFile('public/favicon-32.png', 'public/favicon.ico');

const { data } = await sharp('public/favicon-32.png').raw().toBuffer({ resolveWithObject: true });
console.log('Verify alpha:', data[3], data[3] === 0 ? 'TRANSPARENT OK' : 'STILL WHITE');
