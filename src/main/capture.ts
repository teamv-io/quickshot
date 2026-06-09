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
 * Match a Monitor (from `node-screenshots`) to an Electron display by comparing
 * top-left position in logical coordinates. `node-screenshots` returns bounds
 * in physical pixels, so we divide by its `scaleFactor` to compare against
 * Electron's logical bounds.
 *
 * Position is unique per monitor in screen-space (no two monitors share a
 * top-left), so this is a stable mapping that doesn't rely on driver-issued
 * IDs (which differ between the two libraries).
 */
function findElectronDisplay(m: Monitor, displays: DisplayLike[]): DisplayLike | undefined {
  const ms = m.scaleFactor() || 1
  const mx = Math.round(m.x() / ms)
  const my = Math.round(m.y() / ms)
  return displays.find((d) => d.bounds.x === mx && d.bounds.y === my)
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
  for (const m of monitors) {
    const d = findElectronDisplay(m, displays)
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
