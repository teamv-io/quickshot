// Rasterize the master SVG icons into the platform-specific files
// electron-builder expects, plus a couple of in-app assets:
//
//   build/icon.png      1024×1024  → electron-builder derives .icns from this
//   build/icon.ico      multi-res Windows icon
//   build/tray.png      18×18      monochrome template, used on macOS menubar
//   build/tray@2x.png   36×36      Retina variant
//   src/renderer/public/icon.svg   served at /icon.svg as the renderer favicon
//
// Run with: node build/generate-icons.mjs

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

async function rasterize(srcSvg, outPng, size) {
  const buf = await sharp(srcSvg, { density: 384 }).resize(size, size).png().toBuffer()
  await fs.writeFile(outPng, buf)
  return buf
}

async function main() {
  const appSvg = join(here, 'icon.svg')
  const traySvg = join(here, 'tray.svg')

  // App icon — 1024 master that electron-builder consumes for every platform.
  await rasterize(appSvg, join(here, 'icon.png'), 1024)

  // Windows .ico needs an explicit multi-resolution set baked in. Use the same
  // sizes Windows Explorer actually requests.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoPngs = []
  for (const s of icoSizes) {
    icoPngs.push(await sharp(appSvg, { density: 384 }).resize(s, s).png().toBuffer())
  }
  await fs.writeFile(join(here, 'icon.ico'), await pngToIco(icoPngs))

  // macOS menubar tray glyph — monochrome template image (Electron tints it).
  // 22 is Apple's recommended tray slot; double size lives next to it so the
  // installed app can pick a sharper representation if needed.
  await rasterize(traySvg, join(here, 'tray.png'), 22)
  await rasterize(traySvg, join(here, 'tray@2x.png'), 44)

  // Windows notification area: full-color brand mark. Render at 64 so Windows
  // has a crisp source to downscale to 16/24/32 depending on DPI.
  await rasterize(appSvg, join(here, 'tray-win.png'), 64)

  // Renderer-side favicon. Copy the master SVG into public/ so Vite serves it
  // verbatim at /icon.svg — vector means crisp at any DPI.
  const publicDir = join(root, 'src', 'renderer', 'public')
  await fs.mkdir(publicDir, { recursive: true })
  await fs.copyFile(appSvg, join(publicDir, 'icon.svg'))

  // Also drop a 256 PNG fallback for any browser/devtool that doesn't render
  // the SVG favicon.
  await rasterize(appSvg, join(publicDir, 'icon.png'), 256)

  console.log('icons regenerated.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
