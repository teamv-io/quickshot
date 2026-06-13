// Standalone probe for the OS window-snap layer. Runs with plain `node` —
// no Electron, no app windows — so it can be executed safely while the app
// itself stays closed. It dumps exactly what node-screenshots reports and
// what listWindowsForDisplay's filter pipeline would keep, then saves visual
// evidence (full-monitor captures + per-candidate crops) so bounds can be
// checked against reality by eye.
//
// Usage: node scripts/probe-windows.cjs
// Output: scripts/probe-out/probe.json, monitor-*.png, crop-*.png

const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')
const { Monitor, Window } = require('node-screenshots')

const OUT = join(__dirname, 'probe-out')
mkdirSync(OUT, { recursive: true })

const report = { monitors: [], windows: [], perMonitor: [] }

// ---- monitors ----
const monitors = Monitor.all()
for (const m of monitors) {
  report.monitors.push({
    id: m.id(),
    x: m.x(),
    y: m.y(),
    width: m.width(),
    height: m.height(),
    scaleFactor: m.scaleFactor(),
    isPrimary: m.isPrimary()
  })
}

// ---- raw windows ----
const wins = Window.all()
for (const w of wins) {
  try {
    const cm = w.currentMonitor()
    report.windows.push({
      id: w.id(),
      app: w.appName() || '',
      title: w.title() || '',
      pid: w.pid(),
      z: w.z(),
      x: w.x(),
      y: w.y(),
      width: w.width(),
      height: w.height(),
      isMinimized: w.isMinimized(),
      isMaximized: w.isMaximized(),
      monitorId: cm ? cm.id() : null
    })
  } catch (e) {
    report.windows.push({ error: String(e) })
  }
}

// ---- replicate the windowSnap.ts pipeline per monitor, in PHYSICAL pixels
// (what node-screenshots speaks) and also against the LOGICAL bounds the main
// process actually passes in, to expose any coordinate-space mismatch. ----
const COVERAGE_GRID = 256
const MIN_VISIBLE_FRACTION = 0.1
const MIN_SIDE_PX = 40
const INVISIBLE_OVERLAYS = new Set(
  [
    'NVIDIA Share',
    'NVIDIA GeForce Overlay',
    'NVIDIA GeForce Experience',
    'GeForce Experience',
    'Discord Overlay',
    'Steam Overlay',
    'Windows Input Experience',
    'Search'
  ].map((s) => s.toLowerCase())
)

function runPipeline(display, windows) {
  const sorted = windows
    .filter((w) => !w.error && !w.isMinimized && w.width >= MIN_SIDE_PX && w.height >= MIN_SIDE_PX)
    .slice()
    .sort((a, b) => b.z - a.z)
  const covered = new Uint8Array(COVERAGE_GRID * COVERAGE_GRID)
  const kept = []
  const dropped = []
  for (const w of sorted) {
    const left = Math.max(w.x, display.x)
    const top = Math.max(w.y, display.y)
    const right = Math.min(w.x + w.width, display.x + display.width)
    const bottom = Math.min(w.y + w.height, display.y + display.height)
    const cw = right - left
    const ch = bottom - top
    const denylisted = INVISIBLE_OVERLAYS.has(w.app.toLowerCase())
    if (cw < MIN_SIDE_PX || ch < MIN_SIDE_PX) {
      dropped.push({ app: w.app, title: w.title, reason: 'outside-display-or-too-small' })
      continue
    }
    const clipped = { x: left - display.x, y: top - display.y, width: cw, height: ch }
    const cx0 = Math.floor((clipped.x / display.width) * COVERAGE_GRID)
    const cy0 = Math.floor((clipped.y / display.height) * COVERAGE_GRID)
    const cx1 = Math.min(COVERAGE_GRID, Math.ceil(((clipped.x + clipped.width) / display.width) * COVERAGE_GRID))
    const cy1 = Math.min(COVERAGE_GRID, Math.ceil(((clipped.y + clipped.height) / display.height) * COVERAGE_GRID))
    let fresh = 0
    let total = 0
    for (let cy = cy0; cy < cy1; cy++) {
      const row = cy * COVERAGE_GRID
      for (let cx = cx0; cx < cx1; cx++) {
        total++
        if (!covered[row + cx]) fresh++
        if (!denylisted) covered[row + cx] = 1
      }
    }
    const fraction = total ? fresh / total : 0
    if (denylisted) {
      dropped.push({ app: w.app, title: w.title, reason: 'denylist' })
      continue
    }
    if (fraction < MIN_VISIBLE_FRACTION) {
      dropped.push({ app: w.app, title: w.title, reason: `occluded (${(fraction * 100).toFixed(1)}% visible)` })
      continue
    }
    kept.push({ app: w.app, title: w.title, z: w.z, visibility: +fraction.toFixed(3), clipped })
  }
  return { kept, dropped }
}

for (const m of report.monitors) {
  const physical = { x: m.x, y: m.y, width: m.width, height: m.height }
  const logical = {
    x: Math.round(m.x / m.scaleFactor),
    y: Math.round(m.y / m.scaleFactor),
    width: Math.round(m.width / m.scaleFactor),
    height: Math.round(m.height / m.scaleFactor)
  }
  report.perMonitor.push({
    monitorId: m.id,
    physicalBounds: physical,
    logicalBounds: logical,
    pipelinePhysical: runPipeline(physical, report.windows),
    pipelineLogical: runPipeline(logical, report.windows)
  })
}

// ---- visual evidence: full captures + crops of kept candidates ----
const imageMethods = []
for (const m of monitors) {
  const img = m.captureImageSync()
  if (imageMethods.length === 0) {
    imageMethods.push(...Object.getOwnPropertyNames(Object.getPrototypeOf(img)))
  }
  writeFileSync(join(OUT, `monitor-${m.id()}.png`), img.toPngSync())

  const per = report.perMonitor.find((p) => p.monitorId === m.id())
  const kept = per ? per.pipelinePhysical.kept.slice(0, 8) : []
  kept.forEach((k, i) => {
    try {
      const c = img.cropSync(k.clipped.x, k.clipped.y, k.clipped.width, k.clipped.height)
      const safe = (k.app || 'unknown').replace(/[^a-z0-9]/gi, '_').slice(0, 24)
      writeFileSync(join(OUT, `crop-m${m.id()}-${i}-${safe}.png`), c.toPngSync())
      k.cropFile = `crop-m${m.id()}-${i}-${safe}.png`
    } catch (e) {
      k.cropError = String(e)
    }
  })
}
report.imageMethods = imageMethods

writeFileSync(join(OUT, 'probe.json'), JSON.stringify(report, null, 2))
console.log(`monitors: ${report.monitors.length}, windows: ${report.windows.length}`)
console.log(`wrote ${join(OUT, 'probe.json')}`)
