// Enumerate top-level OS windows visible on a given display, with bounds
// translated into overlay-CSS coordinates (origin = display top-left).
//
// This drives Snagit-style window snapping in the region overlay: as the user
// hovers, the OS-reported window under the cursor is highlighted as a snap
// candidate. Pixel-based panel detection in detectPanels.ts complements this
// for *sub-window* panels (sidebars, toolbars) the OS doesn't know about.
//
// We use `node-screenshots`'s Window API (already a dep for native capture) so
// we get the same native code path on every platform — no separate
// window-listing library to keep rebuilt.

import { Window as OsWindow } from 'node-screenshots'

export interface SnapWindow {
  /** OS window handle, stringified for IPC safety. */
  id: string
  title: string
  /** Bounds in overlay-CSS coordinates (origin = top-left of the display). */
  bounds: { x: number; y: number; width: number; height: number }
  /** OS Z-order — larger == closer to the user. */
  z: number
}

export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

/** List visible top-level windows intersecting the given display. */
export function listWindowsForDisplay(display: DisplayBounds, ownPid: number): SnapWindow[] {
  let windows: OsWindow[] = []
  try {
    windows = OsWindow.all()
  } catch {
    return []
  }

  const out: SnapWindow[] = []
  for (const w of windows) {
    let info: { id: number; title: string; pid: number; z: number; x: number; y: number; width: number; height: number; minimized: boolean }
    try {
      info = {
        id: w.id(),
        title: w.title() || '',
        pid: w.pid(),
        z: w.z(),
        x: w.x(),
        y: w.y(),
        width: w.width(),
        height: w.height(),
        minimized: w.isMinimized()
      }
    } catch {
      continue
    }

    if (info.minimized) continue
    if (info.pid === ownPid) continue // never snap to our own overlays
    if (info.width < 40 || info.height < 40) continue // tooltips, IMEs, drop shadows

    // Intersect with this display, then translate to display-local coords.
    const left = Math.max(info.x, display.x)
    const top = Math.max(info.y, display.y)
    const right = Math.min(info.x + info.width, display.x + display.width)
    const bottom = Math.min(info.y + info.height, display.y + display.height)
    const width = right - left
    const height = bottom - top
    if (width < 40 || height < 40) continue

    out.push({
      id: String(info.id),
      title: info.title,
      bounds: { x: left - display.x, y: top - display.y, width, height },
      z: info.z
    })
  }

  // Highest Z first so a front-to-back hit-test returns the top-most window
  // under the cursor. Smaller area breaks ties (a palette nested inside its
  // parent still wins when both report the same Z).
  out.sort(
    (a, b) =>
      b.z - a.z || a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height
  )
  return out
}
