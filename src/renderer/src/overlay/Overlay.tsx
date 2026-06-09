import { useEffect, useRef, useState } from 'react'
import { Monitor, Circle, Mic, MicOff, Volume2, VolumeX, Video, VideoOff } from 'lucide-react'
import type { OverlaySource, SnapWindow } from '../../../preload'
import { detectPanels, type DetectedRect } from './detectPanels'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function normalize(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  }
}

/** Click vs drag threshold: pointer travel below this is treated as a click. */
const DRAG_THRESHOLD = 4

/** Find the smallest detected panel rectangle containing the cursor. */
function pickHoverRect(rects: Rect[], px: number, py: number): Rect | null {
  // Rects are already sorted smallest-first by the detector, so the first hit
  // is the inner-most panel under the cursor.
  for (const r of rects) {
    if (px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h) return r
  }
  return null
}

/** Smallest first so a front-to-back hit-test returns the innermost match. */
function sortSmallestFirst(rects: Rect[]): Rect[] {
  return rects.slice().sort((a, b) => a.w * a.h - b.w * b.h)
}

function iou(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = ix * iy
  if (inter === 0) return 0
  return inter / (a.w * a.h + b.w * b.h - inter)
}

/**
 * Collapse near-duplicate rectangles. Walking smallest-first, we keep the
 * current rect only if it's distinct enough (IoU < threshold) from every rect
 * already kept — so a candidate that's basically the same panel as a smaller
 * neighbour gets dropped. This is what keeps the suggestion list from
 * exploding when both the OS window AND the pixel detector flag the same box.
 */
function dedupe(rects: Rect[], iouThreshold = 0.85): Rect[] {
  const kept: Rect[] = []
  for (const r of rects) {
    if (r.w < 4 || r.h < 4) continue
    if (kept.some((k) => iou(k, r) > iouThreshold)) continue
    kept.push(r)
  }
  return kept
}

/**
 * Full-screen frozen screenshot dimmed with a selectable cut-out.
 * On release, crops the region at native resolution and hands it to the editor.
 *
 * Snap-to-window: as the cursor moves (without dragging), the smallest
 * enclosing OS window is highlighted. Click without dragging to snap-select it;
 * drag instead for a free region.
 */
export default function Overlay(): JSX.Element {
  const [source, setSource] = useState<OverlaySource | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const [hoverRect, setHoverRect] = useState<Rect | null>(null)
  // True when the cursor is over THIS overlay's display. Only the active
  // overlay shows the action bar + center hint, so on multi-monitor setups the
  // chrome isn't duplicated on every screen.
  const [active, setActive] = useState(false)
  // Snap candidates the user can click-to-select. Two sources merged into one
  // sorted list (smallest first, so hit-test returns the inner-most match):
  //   • OS-reported top-level windows for this display (Snagit's primary cue).
  //   • Rectangles detected from the screenshot pixels (catches sidebars,
  //     toolbars and dialog panels the OS can't see inside an app window).
  const [panels, setPanels] = useState<Rect[]>([])
  const [osCount, setOsCount] = useState(0)
  const [pxCount, setPxCount] = useState(0)
  // Press 'D' to overlay every candidate rectangle for tuning.
  const [debug, setDebug] = useState(false)
  const [mic, setMic] = useState(false)
  const [systemAudio, setSystemAudio] = useState(false)
  const [webcam, setWebcam] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(
    () =>
      window.api.onOverlaySource((src) => {
        setSource(src)
        setActive(src.isActive)
      }),
    []
  )

  // Build the snap-candidate list: seed with the OS windows for this display
  // (already in CSS coords), then enrich asynchronously with whatever the
  // pixel detector finds (sub-window panels). Both feed the same list, sorted
  // smallest-first.
  useEffect(() => {
    if (!source) return
    let cancelled = false

    const osRects = source.windows.map((w: SnapWindow) => ({
      x: w.bounds.x,
      y: w.bounds.y,
      w: w.bounds.width,
      h: w.bounds.height
    }))
    const initial = dedupe(sortSmallestFirst(osRects))
    setOsCount(initial.length)
    setPxCount(0)
    setPanels(initial)

    detectPanels(source.dataUrl).then((found: DetectedRect[]) => {
      if (cancelled) return
      const s = source.scaleFactor
      const pixelRects: Rect[] = found.map((r) => ({
        x: Math.round(r.x / s),
        y: Math.round(r.y / s),
        w: Math.round(r.width / s),
        h: Math.round(r.height / s)
      }))
      // Merge with OS rects, then dedupe so we don't end up with a near-dupe
      // for every window (OS + pixel detector usually both flag the same box).
      // Walking smallest-first ensures the tighter rectangle wins ties.
      const merged = dedupe(sortSmallestFirst([...osRects, ...pixelRects]))
      setOsCount(osRects.length)
      setPxCount(pixelRects.length)
      setPanels(merged)
    })

    return () => {
      cancelled = true
    }
  }, [source])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.cancelCapture()
      if (e.key === 'd' || e.key === 'D') setDebug((d) => !d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function finish(sel: Rect): void {
    if (!source) return

    // Recording: hand back the region as fractions of the display (resolution-independent).
    if (source.purpose === 'record') {
      window.api.completeRegion(
        {
          fx: sel.x / window.innerWidth,
          fy: sel.y / window.innerHeight,
          fw: sel.w / window.innerWidth,
          fh: sel.h / window.innerHeight
        },
        { mic, systemAudio, webcam }
      )
      return
    }

    // Screenshot: crop the frozen image at native resolution.
    const img = imgRef.current
    if (!img) return
    const s = source.scaleFactor
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sel.w * s))
    canvas.height = Math.max(1, Math.round(sel.h * s))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, sel.x * s, sel.y * s, sel.w * s, sel.h * s, 0, 0, canvas.width, canvas.height)
    window.api.completeScreenshot(canvas.toDataURL('image/png'))
  }

  function onMouseDown(e: React.MouseEvent): void {
    setOrigin({ x: e.clientX, y: e.clientY })
    setRect(null)
    setDragging(false)
  }

  function onMouseMove(e: React.MouseEvent): void {
    if (origin) {
      const dx = e.clientX - origin.x
      const dy = e.clientY - origin.y
      // Only commit to "dragging" once the pointer has actually traveled — a
      // tiny wobble between mousedown and mouseup should still count as a click
      // and trigger the window snap.
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        setDragging(true)
      }
      if (dragging || Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        setRect(normalize(origin, { x: e.clientX, y: e.clientY }))
        setHoverRect(null)
      }
      return
    }
    // Idle hover — show the panel snap candidate.
    setHoverRect(pickHoverRect(panels, e.clientX, e.clientY))
  }

  function onMouseUp(e: React.MouseEvent): void {
    const o = origin
    const isDrag = dragging
    setOrigin(null)
    setDragging(false)

    if (isDrag && rect && rect.w > 3 && rect.h > 3) {
      finish(rect)
      return
    }

    // Click without drag — snap to the hovered panel if any.
    if (o) {
      const r = pickHoverRect(panels, e.clientX, e.clientY)
      if (r) {
        finish(r)
        return
      }
    }
    // Bare click on empty space cancels.
    window.api.cancelCapture()
  }

  function onMouseEnter(): void {
    setActive(true)
  }

  function onMouseLeave(): void {
    setHoverRect(null)
    // Cursor moved off this display — hand the action-bar baton to the overlay
    // that now has the cursor. (Don't clear the in-progress drag rect: if the
    // user dragged past the edge between displays the drawn region should
    // still be visible while they finish.)
    setActive(false)
  }

  function fullScreen(): void {
    if (!source) return
    if (source.purpose === 'record') window.api.completeRegion(null, { mic, systemAudio, webcam })
    else window.api.completeScreenshot(source.dataUrl)
  }

  if (!source) return <div className="h-full w-full bg-black" />

  const liveRect = rect ?? (origin ? null : hoverRect)
  const isSnap = !rect && !!hoverRect

  return (
    <div
      className="relative h-full w-full cursor-crosshair overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <img
        ref={imgRef}
        src={source.dataUrl}
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/45" />

      {/* Debug mode (D to toggle): draw every snap candidate so we can see the
          full set the detector + OS produce, including rejected duplicates. */}
      {debug &&
        panels.map((r, i) => (
          <div
            key={i}
            className="pointer-events-none absolute border border-rose-400/60"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          >
            <span className="absolute -top-4 left-0 bg-rose-500/80 px-1 text-[10px] leading-tight text-white">
              {r.w}×{r.h}
            </span>
          </div>
        ))}
      {debug && active && (
        <div className="pointer-events-none absolute right-4 top-4 rounded bg-black/80 px-3 py-2 font-mono text-xs text-white">
          <div>panels: {panels.length}</div>
          <div>os windows: {osCount}</div>
          <div>pixel rects: {pxCount}</div>
          <div className="mt-1 text-rose-300">debug — press D to hide</div>
        </div>
      )}
      {liveRect && (
        <div
          className={`pointer-events-none absolute border ${isSnap ? 'border-2 border-sky-300/90' : 'border-sky-400'}`}
          style={{
            left: liveRect.x,
            top: liveRect.y,
            width: liveRect.w,
            height: liveRect.h,
            backgroundImage: `url(${source.dataUrl})`,
            backgroundPosition: `-${liveRect.x}px -${liveRect.y}px`,
            backgroundSize: `${window.innerWidth}px ${window.innerHeight}px`,
            boxShadow: isSnap ? '0 0 0 1px rgba(56,189,248,0.35), 0 8px 28px rgba(0,0,0,0.45)' : undefined
          }}
        >
          <span
            className={`absolute -top-6 left-0 rounded px-1.5 py-0.5 text-xs text-white ${
              isSnap ? 'bg-sky-400/95' : 'bg-sky-500'
            }`}
          >
            {Math.round(liveRect.w)} × {Math.round(liveRect.h)}
            {isSnap && <span className="ml-1 opacity-80">· click to snap</span>}
          </span>
        </div>
      )}
      {active && !liveRect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/70 px-4 py-2 text-sm text-white/90 shadow-lg ring-1 ring-white/10">
            {source.purpose === 'record' ? 'Drag to select area to record' : 'Drag to select a region'}
            {panels.length > 0 ? '  ·  hover a panel to snap' : ''}
            {'  ·  Esc to cancel'}
          </div>
        </div>
      )}

      {/* Action bar — only renders on the screen with the cursor, so a
          multi-monitor capture isn't littered with duplicate chrome. */}
      {active && (
      <div
        className="absolute inset-x-0 bottom-10 flex justify-center"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-full bg-zinc-900/90 px-2 py-2 shadow-xl ring-1 ring-white/10">
          {source.purpose === 'record' && (
            <>
              <button
                onClick={() => setMic((m) => !m)}
                title="Microphone"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  mic ? 'bg-sky-500 text-white' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                }`}
              >
                {mic ? <Mic size={15} /> : <MicOff size={15} />}
                Mic
              </button>
              <button
                onClick={() => setSystemAudio((s) => !s)}
                title="System audio"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  systemAudio ? 'bg-sky-500 text-white' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                }`}
              >
                {systemAudio ? <Volume2 size={15} /> : <VolumeX size={15} />}
                Audio
              </button>
              <button
                onClick={() => setWebcam((w) => !w)}
                title="Webcam overlay"
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  webcam ? 'bg-sky-500 text-white' : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                }`}
              >
                {webcam ? <Video size={15} /> : <VideoOff size={15} />}
                Cam
              </button>
              <div className="mx-1 h-5 w-px bg-white/15" />
            </>
          )}
          <button
            onClick={fullScreen}
            className="flex items-center gap-1.5 rounded-full bg-sky-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
          >
            {source.purpose === 'record' ? <Circle size={15} /> : <Monitor size={15} />}
            {source.purpose === 'record' ? 'Record full screen' : 'Capture full screen'}
          </button>
          <button
            onClick={() => window.api.cancelCapture()}
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/20"
          >
            Cancel
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
