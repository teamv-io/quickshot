import { screen } from 'electron'
import { Monitor } from 'node-screenshots'

export interface CaptureResult {
  /** Full-resolution PNG data URL of the captured display. */
  dataUrl: string
  /** Display bounds in logical points (where to place the overlay window). */
  bounds: { x: number; y: number; width: number; height: number }
  /** Backing-scale factor (e.g. 2 on Retina) — image pixels = points * scaleFactor. */
  scaleFactor: number
}

export interface CaptureSlice extends CaptureResult {
  /** Electron display id this slice corresponds to. */
  displayId: number
}

interface DisplayLike {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

/**
 * Match a Monitor (from `node-screenshots`) to an Electron display.
 *
 * `node-screenshots` reports bounds in physical pixels of the Windows virtual
 * screen. Electron reports bounds in logical DIPs. On mixed-DPI setups (e.g.
 * laptop at 150 % + external at 100 %), naively dividing the Monitor's x/y by
 * its OWN scale factor doesn't reproduce Electron's logical layout, because
 * sibling displays scale at different rates — so an exact top-left match
 * misses the external display and we silently drop its overlay.
 *
 * Robust strategy: match by LOGICAL SIZE first (every monitor scales its own
 * dimensions consistently regardless of siblings), and fall back to whichever
 * Electron display's center is closest to the monitor's logical center when
 * sizes collide.
 */
function findElectronDisplay(
  m: Monitor,
  displays: DisplayLike[],
  taken: Set<number>
): DisplayLike | undefined {
  const ms = m.scaleFactor() || 1
  const lw = Math.round(m.width() / ms)
  const lh = Math.round(m.height() / ms)
  const lx = Math.round(m.x() / ms)
  const ly = Math.round(m.y() / ms)

  const available = displays.filter((d) => !taken.has(d.id))

  // Prefer exact size match (with 1-px tolerance for rounding).
  const sized = available.filter(
    (d) => Math.abs(d.bounds.width - lw) <= 1 && Math.abs(d.bounds.height - lh) <= 1
  )
  if (sized.length === 1) return sized[0]

  // Multiple same-size displays → pick the closest by center distance.
  const pool = sized.length > 0 ? sized : available
  if (pool.length === 0) return undefined
  const mcx = lx + lw / 2
  const mcy = ly + lh / 2
  let best = pool[0]
  let bestDist = Infinity
  for (const d of pool) {
    const dcx = d.bounds.x + d.bounds.width / 2
    const dcy = d.bounds.y + d.bounds.height / 2
    const dist = Math.hypot(mcx - dcx, mcy - dcy)
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  return best
}

/**
 * Snapshot every connected display using the native Rust-based capture path
 * (`node-screenshots`). This sidesteps Chromium's DXGI duplicator, which fails
 * on displays running in 24-bit color and is the same bug that breaks Chrome /
 * Google Meet screen sharing on certain laptop displays.
 *
 * Each entry is a logical bounds + a native-resolution PNG data URL ready for
 * the overlay window to render.
 */
export async function captureAllDisplays(): Promise<CaptureSlice[]> {
  const displays: DisplayLike[] = screen.getAllDisplays()
  const monitors = Monitor.all()

  const slices: CaptureSlice[] = []
  const taken = new Set<number>()
  for (const m of monitors) {
    const d = findElectronDisplay(m, displays, taken)
    if (d) taken.add(d.id)
    if (!d) {
      console.warn(
        `[capture] native monitor at (${m.x()}, ${m.y()}) doesn't match any Electron display — skipped.`
      )
      continue
    }
    try {
      const png = m.captureImageSync().toPngSync()
      slices.push({
        displayId: d.id,
        dataUrl: `data:image/png;base64,${png.toString('base64')}`,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor
      })
    } catch (err) {
      console.warn(`[capture] failed to capture display ${d.id}:`, (err as Error).message)
    }
  }

  if (slices.length === 0) {
    throw new Error('No screen could be captured — verify screen-capture permissions.')
  }
  return slices
}

/** Single-display variant for callers (full-screen capture) that don't need every screen. */
export async function captureActiveDisplay(): Promise<CaptureResult> {
  const point = screen.getCursorScreenPoint()
  const active = screen.getDisplayNearestPoint(point)
  const slices = await captureAllDisplays()
  const slice = slices.find((s) => s.displayId === active.id) ?? slices[0]
  return { dataUrl: slice.dataUrl, bounds: slice.bounds, scaleFactor: slice.scaleFactor }
}
