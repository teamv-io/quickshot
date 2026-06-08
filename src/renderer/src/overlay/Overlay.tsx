import { useEffect, useRef, useState } from 'react'
import { Monitor, Circle, Mic, MicOff, Volume2, VolumeX, Video, VideoOff } from 'lucide-react'
import type { OverlaySource } from '../../../preload'

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

/**
 * Full-screen frozen screenshot dimmed with a selectable cut-out.
 * On release, crops the region at native resolution and hands it to the editor.
 */
export default function Overlay(): JSX.Element {
  const [source, setSource] = useState<OverlaySource | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [mic, setMic] = useState(false)
  const [systemAudio, setSystemAudio] = useState(false)
  const [webcam, setWebcam] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => window.api.onOverlaySource(setSource), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.cancelCapture()
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
    setRect({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }
  function onMouseMove(e: React.MouseEvent): void {
    if (!origin) return
    setRect(normalize(origin, { x: e.clientX, y: e.clientY }))
  }
  function onMouseUp(): void {
    if (rect && rect.w > 3 && rect.h > 3) finish(rect)
    else window.api.cancelCapture()
    setOrigin(null)
  }

  function fullScreen(): void {
    if (!source) return
    if (source.purpose === 'record') window.api.completeRegion(null, { mic, systemAudio, webcam })
    else window.api.completeScreenshot(source.dataUrl)
  }

  if (!source) return <div className="h-full w-full bg-black" />

  return (
    <div
      className="relative h-full w-full cursor-crosshair overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <img
        ref={imgRef}
        src={source.dataUrl}
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />
      {/* Dim layer with a punched-out selection via box-shadow. */}
      <div className="pointer-events-none absolute inset-0 bg-black/45" />
      {rect && (
        <div
          className="pointer-events-none absolute border border-sky-400"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            backgroundImage: `url(${source.dataUrl})`,
            backgroundPosition: `-${rect.x}px -${rect.y}px`,
            backgroundSize: `${window.innerWidth}px ${window.innerHeight}px`
          }}
        >
          <span className="absolute -top-6 left-0 rounded bg-sky-500 px-1.5 py-0.5 text-xs text-white">
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </span>
        </div>
      )}
      {!rect && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/70 px-4 py-2 text-sm text-white/90 shadow-lg ring-1 ring-white/10">
            {source.purpose === 'record' ? 'Drag to select area to record' : 'Drag to select a region'}
            {'  ·  Esc to cancel'}
          </div>
        </div>
      )}

      {/* Action bar — clickable, so stop drag from starting underneath it. */}
      <div
        className="absolute inset-x-0 bottom-10 flex justify-center"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
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
    </div>
  )
}
