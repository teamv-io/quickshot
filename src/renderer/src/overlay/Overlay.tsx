import { useEffect, useRef, useState } from 'react'
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
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => window.api.onOverlaySource(setSource), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.cancelCapture()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function crop(sel: Rect): void {
    if (!source) return
    const img = imgRef.current
    if (!img) return
    const s = source.scaleFactor
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sel.w * s))
    canvas.height = Math.max(1, Math.round(sel.h * s))
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(
      img,
      sel.x * s,
      sel.y * s,
      sel.w * s,
      sel.h * s,
      0,
      0,
      canvas.width,
      canvas.height
    )
    window.api.completeCapture(canvas.toDataURL('image/png'))
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
    if (rect && rect.w > 3 && rect.h > 3) crop(rect)
    else window.api.cancelCapture()
    setOrigin(null)
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
        <div className="pointer-events-none absolute inset-x-0 top-6 text-center text-sm text-white/80">
          Drag to select a region · Esc to cancel
        </div>
      )}
    </div>
  )
}
