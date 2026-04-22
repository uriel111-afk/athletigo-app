// Regenerate the full PWA / favicon icon set from
// public/logo-transparent.png. Pipeline:
//   1. Re-clean any stray white pixels in the source PNG (paranoid;
//      the source should already be clean)
//   2. Square-pad onto transparent canvas so the wider-than-tall
//      triangle isn't squished by resize
//   3. Add 8% transparent padding around the logo so it doesn't
//      touch the icon edges
//   4. Emit favicon-16/32/48, icon-192, icon-512, apple-touch-icon
//   5. Emit multi-size favicon.ico (16/32/48 bundled)
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

  // 1. Sweep any opaque-but-near-white pixels back to transparent so
  //    the icon never has a white halo.
  const data = src.bitmap.data;
  let cleaned = 0, softened = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a > 0 && r > 230 && g > 230 && b > 230) {
      data[i + 3] = 0;
      cleaned++;
    } else if (a > 0 && r > 200 && g > 200 && b > 200) {
      const avg = (r + g + b) / 3;
      const newAlpha = Math.round(Math.max(0, Math.min(255, (230 - avg) * (255 / 30))));
      if (newAlpha < a) { data[i + 3] = newAlpha; softened++; }
    }
  }
  console.log(`cleaned ${cleaned} white pixels, softened ${softened} edge pixels`);

  // 2. Square the canvas so circular-shaped favicons don't squish.
  const longest = Math.max(src.bitmap.width, src.bitmap.height);
  const square = new Jimp({ width: longest, height: longest, color: 0x00000000 });
  const offX = Math.floor((longest - src.bitmap.width) / 2);
  const offY = Math.floor((longest - src.bitmap.height) / 2);
  square.composite(src, offX, offY);

  // 3. Add 8% transparent padding around the logo on all sides.
  const PAD_PCT = 0.08;
  const pad = Math.round(longest * PAD_PCT);
  const paddedSize = longest + pad * 2;
  const padded = new Jimp({ width: paddedSize, height: paddedSize, color: 0x00000000 });
  padded.composite(square, pad, pad);
  console.log(`padded canvas: ${paddedSize} x ${paddedSize} (8% pad = ${pad}px)`);

  const outputs = [
    { name: 'favicon-16.png',       size: 16  },
    { name: 'favicon-32.png',       size: 32  },
    { name: 'favicon-48.png',       size: 48  },
    { name: 'icon-192.png',         size: 192 },
    { name: 'icon-512.png',         size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];
  for (const { name, size } of outputs) {
    const copy = padded.clone().resize({ w: size, h: size });
    const out = path.join(PUB, name);
    await copy.write(out);
    const stat = fs.statSync(out);
    console.log(`wrote: ${name} (${size}x${size}, ${stat.size} bytes)`);
  }

  // 4. Multi-size favicon.ico (16+32+48).
  const icoBuf = await pngToIco([
    await padded.clone().resize({ w: 16, h: 16 }).getBuffer('image/png'),
    await padded.clone().resize({ w: 32, h: 32 }).getBuffer('image/png'),
    await padded.clone().resize({ w: 48, h: 48 }).getBuffer('image/png'),
  ]);
  const icoPath = path.join(PUB, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuf);
  const icoStat = fs.statSync(icoPath);
  console.log(`wrote: favicon.ico (16+32+48 multi-res, ${icoStat.size} bytes)`);
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
