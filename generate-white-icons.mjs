// Regenerate ALL app icons: white (#FFFFFF) background, black AG-triangle logo,
// logo filling ~80% of canvas width (60% for maskable safe zone).
//
// Source: public/logo-transparent.png — already a pure-black triangle on a
// transparent background, so no recolouring is needed; we just composite it
// centred onto a white canvas.
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(__dirname, 'public')
const ANDROID = path.join(__dirname, 'android/app/src/main/res')
const SRC = path.join(PUBLIC, 'logo-transparent.png')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

// Build one square icon: white canvas + black logo centred, logo width = fill * size.
async function makeIcon(size, fill) {
  const logoW = Math.round(size * fill)
  const logo = await sharp(SRC)
    .resize({ width: logoW, fit: 'inside' }) // keep aspect ratio
    // Force pure black while preserving the alpha channel (no-op for an
    // already-black source, but guarantees a black mark regardless).
    .recomb([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
    .png()
    .toBuffer()
  const meta = await sharp(logo).metadata()
  return sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([{
      input: logo,
      top: Math.round((size - meta.height) / 2),
      left: Math.round((size - meta.width) / 2),
    }])
    .png()
    .toBuffer()
}

// Transparent canvas + black logo centred (for Android adaptive foreground).
async function makeForeground(size, fill) {
  const logoW = Math.round(size * fill)
  const logo = await sharp(SRC)
    .resize({ width: logoW, fit: 'inside' })
    .recomb([[0, 0, 0], [0, 0, 0], [0, 0, 0]])
    .png()
    .toBuffer()
  const meta = await sharp(logo).metadata()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: logo,
      top: Math.round((size - meta.height) / 2),
      left: Math.round((size - meta.width) / 2),
    }])
    .png()
    .toBuffer()
}

async function whiteSquare(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .png()
    .toBuffer()
}

// Minimal ICO wrapper around a single embedded PNG (ICO supports PNG payloads).
function pngToIco(pngBuffer, dim) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)      // reserved
  header.writeUInt16LE(1, 2)      // type 1 = icon
  header.writeUInt16LE(1, 4)      // image count
  const entry = Buffer.alloc(16)
  entry.writeUInt8(dim >= 256 ? 0 : dim, 0) // width (0 == 256)
  entry.writeUInt8(dim >= 256 ? 0 : dim, 1) // height
  entry.writeUInt8(0, 2)          // palette
  entry.writeUInt8(0, 3)          // reserved
  entry.writeUInt16LE(1, 4)       // color planes
  entry.writeUInt16LE(32, 6)      // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8)
  entry.writeUInt32LE(6 + 16, 12) // offset of PNG data
  return Buffer.concat([header, entry, pngBuffer])
}

async function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  const m = await sharp(buf).metadata()
  console.log(`  ${path.relative(__dirname, file).replace(/\\/g, '/')}  ${m.width}x${m.height}`)
}

async function main() {
  console.log('Source logo:', path.relative(__dirname, SRC).replace(/\\/g, '/'))

  // ---- PWA / web icons (80% fill) ----
  console.log('\nPWA icons (80% fill):')
  for (const s of [72, 96, 128, 144, 152, 192, 384, 512]) {
    await write(path.join(PUBLIC, `icon-${s}.png`), await makeIcon(s, 0.8))
  }

  // ---- Maskable icons (60% fill for safe zone) ----
  console.log('\nMaskable icons (60% fill):')
  await write(path.join(PUBLIC, 'icon-maskable-192.png'), await makeIcon(192, 0.6))
  await write(path.join(PUBLIC, 'icon-maskable-512.png'), await makeIcon(512, 0.6))

  // ---- Apple touch icon ----
  console.log('\nApple touch icon:')
  await write(path.join(PUBLIC, 'apple-touch-icon.png'), await makeIcon(180, 0.8))

  // ---- Favicons ----
  console.log('\nFavicons:')
  await write(path.join(PUBLIC, 'favicon-16.png'), await makeIcon(16, 0.85))
  await write(path.join(PUBLIC, 'favicon-32.png'), await makeIcon(32, 0.85))
  await write(path.join(PUBLIC, 'favicon-48.png'), await makeIcon(48, 0.85))
  const fav32 = await makeIcon(32, 0.85)
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), pngToIco(fav32, 32))
  console.log('  public/favicon.ico  32x32 (ICO)')

  // ---- Android mipmaps ----
  // Density -> pixel size (matches the project's existing mipmap dimensions).
  const densities = [
    ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
  ]
  console.log('\nAndroid launcher icons (white bg, black logo):')
  for (const [d, s] of densities) {
    const icon = await makeIcon(s, 0.8)
    await write(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher.png'), icon)
    await write(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_round.png'), icon)
  }
  console.log('\nAndroid adaptive foreground (transparent bg, black logo) + background (white):')
  for (const [d, s] of densities) {
    // Foreground logo a touch larger (90%) — the adaptive XML insets it 16.7%,
    // so this lands the mark within the safe zone at a good size.
    await write(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_foreground.png'), await makeForeground(s, 0.9))
    await write(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_background.png'), await whiteSquare(s))
  }

  console.log('\nDone.')
}

main().catch((e) => { console.error(e); process.exit(1) })
