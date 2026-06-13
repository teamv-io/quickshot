// Decisive DPI experiment: run node-screenshots Window.all() inside an
// Electron main process (per-monitor DPI aware) and compare against the same
// call under plain node (DPI-virtualized). Opens NO windows; uses a temp
// userData dir so it cannot collide with a running QuickShot instance.
//
// Usage: npx electron scripts/probe-electron.cjs

const { app, screen } = require('electron')
const { tmpdir } = require('os')
const { join } = require('path')
const { writeFileSync, mkdtempSync } = require('fs')

app.setPath('userData', mkdtempSync(join(tmpdir(), 'qs-probe-')))
app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const { Window, Monitor } = require('node-screenshots')

  const displays = screen.getAllDisplays().map((d) => ({
    id: d.id,
    dipBounds: d.bounds,
    scaleFactor: d.scaleFactor
  }))

  const monitors = Monitor.all().map((m) => ({
    id: m.id(),
    x: m.x(),
    y: m.y(),
    width: m.width(),
    height: m.height(),
    scaleFactor: m.scaleFactor()
  }))

  const windows = []
  for (const w of Window.all()) {
    try {
      if (w.isMinimized()) continue
      const raw = { x: w.x(), y: w.y(), width: w.width(), height: w.height() }
      windows.push({
        app: w.appName() || '',
        title: (w.title() || '').slice(0, 60),
        z: w.z(),
        raw,
        // What the raw rect becomes if treated as physical and converted to DIP.
        asDip: process.platform === 'win32' ? screen.screenToDipRect(null, raw) : raw
      })
    } catch {
      /* skip */
    }
  }

  const out = { dpiAware: 'electron-main', displays, monitors, windows }
  writeFileSync(join(__dirname, 'probe-out', 'probe-electron.json'), JSON.stringify(out, null, 2))
  console.log(`displays: ${displays.length}, windows: ${windows.length} — wrote probe-out/probe-electron.json`)
  app.quit()
})
