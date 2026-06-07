import sharp from 'sharp';
import { existsSync } from 'fs';
import { join } from 'path';

const root = 'android/app/src/main/res';
const folders = [
  'drawable-night',
  'drawable-land-ldpi', 'drawable-land-mdpi', 'drawable-land-hdpi',
  'drawable-land-xhdpi', 'drawable-land-xxhdpi', 'drawable-land-xxxhdpi',
  'drawable-land-night-ldpi', 'drawable-land-night-mdpi', 'drawable-land-night-hdpi',
  'drawable-land-night-xhdpi', 'drawable-land-night-xxhdpi', 'drawable-land-night-xxxhdpi',
  'drawable-port-ldpi', 'drawable-port-mdpi', 'drawable-port-hdpi',
  'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi',
  'drawable-port-night-ldpi', 'drawable-port-night-mdpi', 'drawable-port-night-hdpi',
  'drawable-port-night-xhdpi', 'drawable-port-night-xxhdpi', 'drawable-port-night-xxxhdpi',
];

const cream = { r: 255, g: 249, b: 240, alpha: 1 };

for (const folder of folders) {
  const path = join(root, folder, 'splash.png');
  if (!existsSync(path)) {
    console.log('skip (missing): ' + path);
    continue;
  }
  await sharp({
    create: { width: 1, height: 1, channels: 3, background: cream }
  }).png().toFile(path);
  console.log('done: ' + path);
}
