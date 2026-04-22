// Regenerate the PWA / favicon icon set from the cleaner
// public/logo-transparent.png (auto-cropped triangle, 512x411).
// Outputs:
//   public/icon-192.png        — PWA icon
//   public/icon-512.png        — PWA icon
//   public/apple-touch-icon.png — iOS home-screen
//   public/favicon.ico          — browser address bar
const { Jimp } = require('jimp');
const pngToIco = require('png-to-ico').default;
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, '..', 'public', 'logo-transparent.png');
const PUB = path.join(__dirname, '..', 'public');

(async () => {
  console.log(`source: ${SRC}`);
  const src = await Jimp.read(SRC);
  console.log(`source dimensions: ${src.bitmap.width} x ${src.bitmap.height}`);

  // The logo is wider than tall (512 x 411). Square-pad on a transparent
  // canvas so favicons aren't squished horizontally.
  const longest = Math.max(src.bitmap.width, src.bitmap.height);
  const square = new Jimp({ width: longest, height: longest, color: 0x00000000 });
  const offX = Math.floor((longest - src.bitmap.width) / 2);
  const offY = Math.floor((longest - src.bitmap.height) / 2);
  square.composite(src, offX, offY);
  console.log(`squared canvas: ${square.bitmap.width} x ${square.bitmap.height}`);

  const sizes = [
    { name: 'icon-192.png',         size: 192 },
    { name: 'icon-512.png',         size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];
  for (const { name, size } of sizes) {
    const copy = square.clone().resize({ w: size, h: size });
    const out = path.join(PUB, name);
    await copy.write(out);
    const stat = fs.statSync(out);
    console.log(`wrote: ${name} (${size}x${size}, ${Math.round(stat.size / 1024)} KB)`);
  }

  // ICO needs a real .ico container — png-to-ico bundles 16/32/48 PNGs.
  const icoBuf = await pngToIco([
    await square.clone().resize({ w: 16, h: 16 }).getBuffer('image/png'),
    await square.clone().resize({ w: 32, h: 32 }).getBuffer('image/png'),
    await square.clone().resize({ w: 48, h: 48 }).getBuffer('image/png'),
  ]);
  const icoPath = path.join(PUB, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuf);
  const icoStat = fs.statSync(icoPath);
  console.log(`wrote: favicon.ico (16+32+48, ${Math.round(icoStat.size / 1024)} KB)`);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
