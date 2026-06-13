// Enumerate visible top-level OS windows for a given display, in bounds that
// match the overlay's CSS coordinate space.
//
// This drives Snagit-style window snapping. Two non-trivial filters live here:
//
//   1. Occlusion: a window that's fully covered by something on top of it
//      isn't actually visible on screen, so it shouldn't be a snap candidate.
//      We march through the windows in OS Z-order (top first), accumulate a
//      256×256 coverage grid over the display, and keep only the windows that
//      contribute >= `MIN_VISIBLE_FRACTION` of *fresh* cells.
//
//   2. Invisible-overlay denylist: some apps (NVIDIA Share's GeForce overlay,
//      etc.) live in the window list at high Z covering the whole screen but
//      paint nothing on it. We skip them from both the candidate list AND the
//      coverage grid — they shouldn't hide what's behind them either.
//
// Pixel-based panel detection in detectPanels.ts complements this for the
// sub-window panels (sidebars, dialogs) the OS doesn't know about.

import { screen } from 'electron'
import { Window as OsWindow } from 'node-screenshots'

export interface SnapWindow {
  /** OS window handle, stringified for IPC safety. */
  id: string
  title: string
  /** Owning program / executable name reported by the OS (e.g., "Slack"). */
  app: string
  /** Bounds in overlay-CSS coordinates (origin = top-left of the display). */
  bounds: { x: number; y: number; width: number; height: number }
  /** OS Z-order — larger == closer to the user. */
  z: number
  /** Fraction of the window that wasn't covered by higher-Z windows (0–1). */
  visibility: number
}

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

const COVERAGE_GRID = 256
const MIN_VISIBLE_FRACTION = 0.1 // < 10 % visible == effectively hidden
const MIN_SIDE_PX = 40

/**
 * App names whose windows we never treat as candidates or as occluders —
 * they're either transparent overlays or system chrome the user can't
 * meaningfully "snap to". Matched case-insensitively against `Window.appName()`.
 */
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

interface RawWindow {
  id: number
  title: string
  app: string
  pid: number
  z: number
  bounds: { x: number; y: number; width: number; height: number }
}

function snapshotWindows(): RawWindow[] {
  let raw: OsWindow[] = []
  try {
    raw = OsWindow.all()
  } catch {
    return []
  }
  const out: RawWindow[] = []
  for (const w of raw) {
    try {
      if (w.isMinimized()) continue
      // node-screenshots reports HWND rects via GetWindowRect. The Electron
      // main process is per-monitor-DPI-aware, so those come back in PHYSICAL
      // screen pixels — but the whole snap pipeline (display bounds from
      // Electron, overlay CSS coords) speaks DIP. Convert here, at the source.
      // (Verified empirically: under DPI-aware Electron a 1138×609-DIP window
      // enumerates as 2843×1521 physical on a 250 % display.)
      let bounds = { x: w.x(), y: w.y(), width: w.width(), height: w.height() }
      if (process.platform === 'win32') {
        const dip = screen.screenToDipRect(null, bounds)
        bounds = {
          x: Math.round(dip.x),
          y: Math.round(dip.y),
          width: Math.round(dip.width),
          height: Math.round(dip.height)
        }
        // GetWindowRect on DWM-composited windows reports a rect whose top
        // edge sits 1-2 DIP above the first row of actual window pixels (the
        // resize-border seam). Shave it off so snap crops don't pick up a
        // thin band of whatever's behind the window.
        const TOP_TRIM = 2
        bounds.y += TOP_TRIM
        bounds.height = Math.max(0, bounds.height - TOP_TRIM)
      }
      if (bounds.width < MIN_SIDE_PX || bounds.height < MIN_SIDE_PX) continue
      out.push({
        id: w.id(),
        title: w.title() || '',
        app: w.appName() || '',
        pid: w.pid(),
        z: w.z(),
        bounds
      })
    } catch {
      /* skip windows we can't read */
    }
  }
  return out
}

/**
 * For each window, count how many coverage cells are still unclaimed inside
 * its display-clipped bounds, then claim them. Top-most first, so a window's
 * fresh-cell count reflects what's actually visible to the user.
 */
function computeVisibility(
  sorted: RawWindow[],
  display: DisplayBounds
): Map<number, { fresh: number; total: number; clipped: DisplayBounds }> {
  const covered = new Uint8Array(COVERAGE_GRID * COVERAGE_GRID)
  const out = new Map<number, { fresh: number; total: number; clipped: DisplayBounds }>()

  for (const w of sorted) {
    const left = Math.max(w.bounds.x, display.x)
    const top = Math.max(w.bounds.y, display.y)
    const right = Math.min(w.bounds.x + w.bounds.width, display.x + display.width)
    const bottom = Math.min(w.bounds.y + w.bounds.height, display.y + display.height)
    const width = right - left
    const height = bottom - top
    if (width < MIN_SIDE_PX || height < MIN_SIDE_PX) {
      out.set(w.id, { fresh: 0, total: 0, clipped: { x: 0, y: 0, width: 0, height: 0 } })
      continue
    }
    const clipped = { x: left - display.x, y: top - display.y, width, height }

    const cx0 = Math.floor((clipped.x / display.width) * COVERAGE_GRID)
    const cy0 = Math.floor((clipped.y / display.height) * COVERAGE_GRID)
    const cx1 = Math.min(
      COVERAGE_GRID,
      Math.ceil(((clipped.x + clipped.width) / display.width) * COVERAGE_GRID)
    )
    const cy1 = Math.min(
      COVERAGE_GRID,
      Math.ceil(((clipped.y + clipped.height) / display.height) * COVERAGE_GRID)
    )

    let fresh = 0
    let total = 0
    const isOccluder = !INVISIBLE_OVERLAYS.has(w.app.toLowerCase())
    for (let cy = cy0; cy < cy1; cy++) {
      const row = cy * COVERAGE_GRID
      for (let cx = cx0; cx < cx1; cx++) {
        total++
        if (!covered[row + cx]) fresh++
        if (isOccluder) covered[row + cx] = 1
      }
    }
    out.set(w.id, { fresh, total, clipped })
  }
  return out
}

/** List snap-eligible top-level windows visible on the given display. */
export function listWindowsForDisplay(display: DisplayBounds, ownPid: number): SnapWindow[] {
  const raw = snapshotWindows().filter((w) => w.pid !== ownPid)

  // Top-most first so the coverage walk reflects what the user actually sees.
  const sorted = raw.slice().sort((a, b) => b.z - a.z)
  const visibility = computeVisibility(sorted, display)

  const candidates: SnapWindow[] = []
  for (const w of sorted) {
    if (INVISIBLE_OVERLAYS.has(w.app.toLowerCase())) continue
    const v = visibility.get(w.id)
    if (!v || v.total === 0) continue
    const fraction = v.fresh / v.total
    if (fraction < MIN_VISIBLE_FRACTION) continue

    candidates.push({
      id: String(w.id),
      title: w.title,
      app: w.app,
      bounds: v.clipped,
      z: w.z,
      visibility: fraction
    })
  }

  // Smaller area first as a tiebreaker so a palette nested inside its parent
  // still wins a hit-test when both report the same visibility.
  candidates.sort(
    (a, b) =>
      b.z - a.z || a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height
  )
  return candidates
}
