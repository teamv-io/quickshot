import { desktopCapturer, screen } from 'electron'

export interface CaptureResult {
  /** Full-resolution PNG data URL of the captured display. */
  dataUrl: string
  /** Display bounds in logical points (where to place the overlay window). */
  bounds: { x: number; y: number; width: number; height: number }
  /** Backing-scale factor (e.g. 2 on Retina) — image pixels = points * scaleFactor. */
  scaleFactor: number
}

/**
 * Grab a full-resolution snapshot of the display the cursor is currently on.
 * Requires Screen Recording permission on macOS (prompted on first use).
 */
export async function captureActiveDisplay(): Promise<CaptureResult> {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const { bounds, scaleFactor } = display

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(bounds.width * scaleFactor),
      height: Math.round(bounds.height * scaleFactor)
    }
  })

  const source =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0]

  if (!source) {
    throw new Error('No screen source available — is Screen Recording permission granted?')
  }

  return { dataUrl: source.thumbnail.toDataURL(), bounds, scaleFactor }
}
