// End-to-end simulation of the snap-crop path OUTSIDE the app:
//   capture display (node-screenshots) → window rect (GetWindowRect, physical)
//   → screenToDipRect → clip to display DIP bounds → crop = rect * ratio
// exactly like windowSnap.ts + Overlay.finish(). Saves each crop so we can
// SEE whether the title bar survives. Runs windowless under Electron.
//
// Usage: npx electron scripts/probe-crop.cjs

const { app, screen } = require('electron')
const { tmpdir } = require('os')
const { join } = require('path')
const { writeFileSync, mkdtempSync } = require('fs')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'qs-probe-')))
app.disableHardwareAcceleration()

// Never linger: this is a one-shot probe.
setTimeout(() => {
  console.error('probe timed out')
  app.exit(2)
}, 30000)

function main() {
  const { Window, Monitor } = require('node-screenshots')
  const OUT = join(__dirname, 'probe-out')

  // Match each monitor to an Electron display by logical size (same logic as capture.ts).
  const displays = screen.getAllDisplays()
  const report = []

  for (const m of Monitor.all()) {
    const ms = m.scaleFactor() || 1
    const lw = Math.round(m.width() / ms)
    const lh = Math.round(m.height() / ms)
    const d = displays.find(
      (dd) => Math.abs(dd.bounds.width - lw) <= 1 && Math.abs(dd.bounds.height - lh) <= 1
    )
    if (!d) continue

    const img = m.captureImageSync()
    const imgW = typeof img.width === 'function' ? img.width() : img.width
    const imgH = typeof img.height === 'function' ? img.height() : img.height
    const ratioX = imgW / d.bounds.width
    const ratioY = imgH / d.bounds.height

    for (const w of Window.all()) {
      try {
        if (w.isMinimized()) continue
        const raw = { x: w.x(), y: w.y(), width: w.width(), height: w.height() }
        if (raw.width < 200 || raw.height < 200) continue
        const dip = screen.screenToDipRect(null, raw)
        // Clip to display DIP bounds, then make display-relative (windowSnap.ts).
        const left = Math.max(dip.x, d.bounds.x)
        const top = Math.max(dip.y, d.bounds.y)
        const right = Math.min(dip.x + dip.width, d.bounds.x + d.bounds.width)
        const bottom = Math.min(dip.y + dip.height, d.bounds.y + d.bounds.height)
        if (right - left < 100 || bottom - top < 100) continue
        const rel = { x: left - d.bounds.x, y: top - d.bounds.y, w: right - left, h: bottom - top }
        // Overlay.finish() crop math.
        const crop = {
          x: Math.round(rel.x * ratioX),
          y: Math.round(rel.y * ratioY),
          w: Math.round(rel.w * ratioX),
          h: Math.round(rel.h * ratioY)
        }
        const cx = Math.max(0, Math.min(crop.x, imgW - 2))
        const cy = Math.max(0, Math.min(crop.y, imgH - 2))
        const cw = Math.min(crop.w, imgW - cx)
        const ch = Math.min(crop.h, imgH - cy)
        const piece = img.cropSync(cx, cy, cw, ch)
        const safe = (w.appName() || 'unknown').replace(/[^a-z0-9]/gi, '_').slice(0, 20)
        const file = `simcrop-d${d.id}-${safe}-${w.id()}.png`
        writeFileSync(join(OUT, file), piece.toPngSync())
        report.push({
          app: w.appName(),
          title: (w.title() || '').slice(0, 50),
          raw,
          dip,
          rel,
          crop,
          ratioX: +ratioX.toFixed(4),
          ratioY: +ratioY.toFixed(4),
          file
        })
      } catch {
        /* skip */
      }
    }
  }

  writeFileSync(join(OUT, 'probe-crop.json'), JSON.stringify(report, null, 2))
  console.log(`${report.length} crops -> scripts/probe-out/`)
}

app.whenReady().then(() => {
  try {
    main()
  } catch (err) {
    console.error('probe failed:', err && err.stack ? err.stack : err)
  }
  app.exit(0)
})
