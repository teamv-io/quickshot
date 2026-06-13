import { useEffect, useRef, useState } from 'react'
import { Monitor, Circle, Mic, MicOff, Volume2, VolumeX, Video, VideoOff } from 'lucide-react'
import type { OverlaySource, SnapWindow } from '../../../preload'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** OS-reported snap candidate. We used to merge in pixel-detected panels too,
 *  but those produced phantom rectangles for noise/text seams, so snap is now
 *  OS-only — every candidate has an `app`/`title` we can show in the hint. */
interface SnapCandidate extends Rect {
  /** OS Z-order — larger == closer to the user. Drives the hover hit-test. */
  z: number
  app?: string
  title?: string
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

/** Find the snap candidate the user actually SEES under the cursor: walk in
 *  descending Z and return the first rect containing the point. Picking by
 *  smallest size instead (the old behaviour) highlighted windows that were
 *  buried behind the one on screen — a box for something you can't see. */
function pickHoverRect(rects: SnapCandidate[], px: number, py: number): SnapCandidate | null {
  // Rects are already sorted topmost-first, so the first hit wins.
  for (const r of rects) {
    if (px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h) return r
  }
  return null
}

/** Topmost first, matching what's visually stacked under the cursor. */
function sortTopmostFirst(rects: SnapCandidate[]): SnapCandidate[] {
  return rects.slice().sort((a, b) => b.z - a.z)
}

function iou(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = ix * iy
  if (inter === 0) return 0
  return inter / (a.w * a.h + b.w * b.h - inter)
}

/**
 * Collapse near-duplicate rectangles. Walking topmost-first, we keep the
 * current rect only if it's distinct enough (IoU < threshold) from every rect
 * already kept — so a window that's basically the same box as one stacked
 * above it gets dropped, and the visible (topmost) one survives.
 */
function dedupe(rects: SnapCandidate[], iouThreshold = 0.85): SnapCandidate[] {
  const kept: SnapCandidate[] = []
  for (const r of rects) {
    if (r.w < 4 || r.h < 4) continue
    if (kept.some((k) => iou(k, r) > iouThreshold)) continue
    kept.push(r)
  }
  return kept
}

/** Short human-readable label for a candidate — used in the debug HUD and the
 *  live snap hint. */
function labelFor(c: SnapCandidate): string {
  const app = c.app || ''
  const title = c.title || ''
  if (app && title) return `${app} — ${title}`
  return app || title || 'window'
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
  // Snap candidates the user can click-to-select: OS-reported top-level windows
  // for this display, sorted topmost-first so hit-tests match what's on screen.
  const [panels, setPanels] = useState<SnapCandidate[]>([])
  const [hoverCandidate, setHoverCandidate] = useState<SnapCandidate | null>(null)
  // Snagit-style crosshair: dashed horizontal + vertical lines centered on the
  // cursor while the overlay is active. Null until the cursor enters this
  // display, so we don't paint a stale crosshair on idle/secondary screens.
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
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

  // Where the display's top-left lands in THIS window's client space. Ideally
  // (0,0), but Windows can nudge the overlay window by a few px (DPI rounding,
  // bounds adjustments), which used to shift the crop versus the highlight.
  // Anchoring image, candidates and crop math to this measured offset keeps
  // them all consistent regardless of where the window actually ended up.
  const displayOffset = (src: OverlaySource): { x: number; y: number } => ({
    x: src.bounds.x - window.screenX,
    y: src.bounds.y - window.screenY
  })

  // Build the snap-candidate list from OS-reported windows for this display
  // (display-relative DIP coords → window client coords via the measured
  // offset). The OS layer is authoritative for whole-window positions.
  useEffect(() => {
    if (!source) return
    const off = displayOffset(source)
    const osRects: SnapCandidate[] = source.windows.map((w: SnapWindow) => ({
      x: w.bounds.x + off.x,
      y: w.bounds.y + off.y,
      w: w.bounds.width,
      h: w.bounds.height,
      z: w.z,
      app: w.app,
      title: w.title
    }))
    setPanels(dedupe(sortTopmostFirst(osRects)))
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
    // Window client coords → display-relative coords.
    const off = displayOffset(source)
    const dx = sel.x - off.x
    const dy = sel.y - off.y

    // Recording: hand back the region as fractions of the display (resolution-independent).
    if (source.purpose === 'record') {
      window.api.completeRegion(
        {
          fx: dx / source.bounds.width,
          fy: dy / source.bounds.height,
          fw: sel.w / source.bounds.width,
          fh: sel.h / source.bounds.height
        },
        { mic, systemAudio, webcam }
      )
      return
    }

    // Screenshot: crop the frozen image at native resolution. Derive the
    // CSS→image scale from the image's actual pixel size rather than trusting
    // scaleFactor — display DIP bounds can be off by a rounding pixel (a 1440-
    // DIP display reporting 1441), and the natural-size ratio absorbs that.
    const img = imgRef.current
    if (!img) return
    const sx = img.naturalWidth / source.bounds.width
    const sy = img.naturalHeight / source.bounds.height
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sel.w * sx))
    canvas.height = Math.max(1, Math.round(sel.h * sy))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, dx * sx, dy * sy, sel.w * sx, sel.h * sy, 0, 0, canvas.width, canvas.height)
    window.api.completeScreenshot(canvas.toDataURL('image/png'))
  }

  function onMouseDown(e: React.MouseEvent): void {
    setOrigin({ x: e.clientX, y: e.clientY })
    setRect(null)
    setDragging(false)
  }

  function onMouseMove(e: React.MouseEvent): void {
    setCursor({ x: e.clientX, y: e.clientY })
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
        setHoverCandidate(null)
      }
      return
    }
    // Idle hover — show the panel snap candidate.
    const c = pickHoverRect(panels, e.clientX, e.clientY)
    setHoverCandidate(c)
    setHoverRect(c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null)
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
    setHoverCandidate(null)
    setCursor(null)
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
  const off = displayOffset(source)
  // Marching dashed edge for the selection box — same gradient trick as the
  // crosshair; direction flips on bottom/left so the dashes circulate.
  const edgeColor = 'rgba(56,189,248,0.95)'
  const edgeH = (animDir: string): React.CSSProperties => ({
    height: 2,
    backgroundImage: `linear-gradient(to right, ${edgeColor} 60%, transparent 0)`,
    backgroundSize: '32px 2px',
    backgroundRepeat: 'repeat-x',
    animation: `crosshair-march-x 0.4s linear infinite ${animDir}`
  })
  const edgeV = (animDir: string): React.CSSProperties => ({
    width: 2,
    backgroundImage: `linear-gradient(to bottom, ${edgeColor} 60%, transparent 0)`,
    backgroundSize: '2px 32px',
    backgroundRepeat: 'repeat-y',
    animation: `crosshair-march-y 0.4s linear infinite ${animDir}`
  })

  return (
    <div
      className="relative h-full w-full cursor-crosshair overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Frozen screenshot anchored to the DISPLAY's position in this window's
          client space (not stretched to the window), so a window placed a few
          px off the display origin can't shift the image versus reality. */}
      <img
        ref={imgRef}
        src={source.dataUrl}
        className="pointer-events-none absolute max-w-none"
        style={{
          left: off.x,
          top: off.y,
          width: source.bounds.width,
          height: source.bounds.height
        }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-0 bg-black/45" />

      {/* Debug mode (D to toggle): draw every snap candidate so we can see the
          full set the OS enumeration produces, including rejected duplicates. */}
      {debug &&
        panels.map((r, i) => (
          <div
            key={i}
            className="pointer-events-none absolute border border-emerald-400/80"
            style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          >
            <span className="absolute -top-4 left-0 max-w-[40vw] truncate bg-emerald-500/85 px-1 text-[10px] leading-tight text-white">
              {r.w}×{r.h} · {labelFor(r)}
            </span>
          </div>
        ))}
      {debug && active && (
        <div className="pointer-events-none absolute right-4 top-4 rounded bg-black/80 px-3 py-2 font-mono text-xs text-white">
          <div>os windows: {panels.length}</div>
          <div>
            display: {source.bounds.x},{source.bounds.y} {source.bounds.width}×{source.bounds.height}
          </div>
          <div>
            window: {window.screenX},{window.screenY} {window.innerWidth}×{window.innerHeight}
          </div>
          <div>
            offset: {off.x},{off.y} · img: {imgRef.current?.naturalWidth}×
            {imgRef.current?.naturalHeight} · sf: {source.scaleFactor}
          </div>
          <div className="mt-1 text-rose-300">debug — press D to hide</div>
        </div>
      )}
      {liveRect && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: liveRect.x,
            top: liveRect.y,
            width: liveRect.w,
            height: liveRect.h,
            backgroundImage: `url(${source.dataUrl})`,
            backgroundPosition: `${off.x - liveRect.x}px ${off.y - liveRect.y}px`,
            backgroundSize: `${source.bounds.width}px ${source.bounds.height}px`,
            boxShadow: isSnap ? '0 0 0 1px rgba(56,189,248,0.35), 0 8px 28px rgba(0,0,0,0.45)' : undefined
          }}
        >
          {/* Marching dashed border (the crosshair itself stays static).
              Top strip uses top-px (not top-0): when liveRect.y is fractional,
              the parent's top rounds to a whole pixel but the inner strip
              draws at the float position and the 2-px band leaks ~0.5 px above
              the box. The 1-px inset hides that on every pixel grid. */}
          <div className="absolute left-0 right-0 top-px" style={edgeH('normal')} />
          <div className="absolute bottom-0 left-0 right-0" style={edgeH('reverse')} />
          <div className="absolute bottom-0 left-0 top-0" style={edgeV('reverse')} />
          <div className="absolute bottom-0 right-0 top-0" style={edgeV('normal')} />
          <span
            className={`absolute -top-6 left-0 max-w-[80vw] truncate rounded px-1.5 py-0.5 text-xs text-white ${
              isSnap ? 'bg-sky-400/95' : 'bg-sky-500'
            }`}
          >
            {Math.round(liveRect.w)} × {Math.round(liveRect.h)}
            {isSnap && (
              <span className="ml-1 opacity-80">
                · click to snap{hoverCandidate ? ` · ${labelFor(hoverCandidate)}` : ''}
              </span>
            )}
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

      {/* Snagit-style crosshair — static dashed red lines through the cursor
          (the marching animation lives on the selection box border instead).
          Rendered last with a very high z-index so it always paints on top. */}
      {active && cursor && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 z-[9999] h-[2px]"
            style={{
              top: cursor.y - 1,
              backgroundImage:
                'linear-gradient(to right, rgba(239,68,68,0.95) 60%, transparent 0)',
              backgroundSize: '32px 2px',
              backgroundRepeat: 'repeat-x'
            }}
          />
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-[9999] w-[2px]"
            style={{
              left: cursor.x - 1,
              backgroundImage:
                'linear-gradient(to bottom, rgba(239,68,68,0.95) 60%, transparent 0)',
              backgroundSize: '2px 32px',
              backgroundRepeat: 'repeat-y'
            }}
          />
        </>
      )}
    </div>
  )
}
