import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const src = 'branding/logo-source.jpg';
const out = 'assets';

if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

const BRAND_CREAM = { r: 255, g: 249, b: 240, alpha: 1 };
const BRAND_CREAM_HEX = '#FFF9F0';

// Build a transparent-background version of the logo:
// 1) Greyscale → threshold(240) → negate gives an alpha mask where the
//    black logo pixels become opaque and the white surround becomes
//    transparent.
// 2) Join that mask as the alpha channel onto a solid-black layer to get
//    a clean RGBA logo.
// 3) Trim transparent borders so the logo fills the bounding box.
const trimmedSrc = await sharp(src)
  .trim({ background: '#ffffff', threshold: 10 })
  .toBuffer();

const { width: tw, height: th } = await sharp(trimmedSrc).metadata();

const alphaMask = await sharp(trimmedSrc)
  .greyscale()
  .threshold(240)
  .negate()
  .toBuffer();

const logoRGBA = await sharp({
  create: { width: tw, height: th, channels: 3, background: '#000000' },
})
  .joinChannel(alphaMask)
  .png()
  .toBuffer();

const tightLogo = await sharp(logoRGBA)
  .trim()
  .png()
  .toBuffer();

async function logoOnCanvas(canvasSize, logoSize, outPath) {
  const logo = await sharp(tightLogo)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: BRAND_CREAM,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(outPath);
}

// Logo enlarged 25% (640 → 800) on 1024 canvas so the launcher icon
// reads bigger on the home screen. 800/1024 = 78%, still inside
// Material Design's 80% safe-zone.
await logoOnCanvas(1024, 800, path.join(out, 'icon-only.png'));
await logoOnCanvas(1024, 800, path.join(out, 'icon-foreground.png'));

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: BRAND_CREAM,
  },
}).png().toFile(path.join(out, 'icon-background.png'));

// Splash logo also +25% (900 → 1125) to match.
await logoOnCanvas(2732, 1125, path.join(out, 'splash.png'));
await logoOnCanvas(2732, 1125, path.join(out, 'splash-dark.png'));

console.log('Brand color:', BRAND_CREAM_HEX);
console.log('Assets generated:', fs.readdirSync(out).join(', '));
