import { useEffect, useRef, useState } from 'react'
import { Camera, Circle, Square, Images, X, Settings as SettingsIcon, GripVertical, GripHorizontal } from 'lucide-react'

/**
 * Always-on-top launcher pinned to the screen edge. Drag the grip to reposition;
 * buttons trigger capture/record without a hotkey. Content-protected, so it
 * never appears in captures. Lays out vertically or horizontally per position.
 */
export default function FloatBar(): JSX.Element {
  const [recording, setRecording] = useState(false)
  const [vertical, setVertical] = useState(true)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    window.api.floatGetState().then((s) => {
      setRecording(s.recording)
      setVertical(s.vertical)
    })
    return window.api.onFloatState((s) => setRecording(s.recording))
  }, [])

  function onPointerDown(e: React.PointerEvent): void {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = { dx: e.clientX, dy: e.clientY }
  }
  function onPointerMove(e: React.PointerEvent): void {
    if (!dragRef.current) return
    window.api.floatMove(e.screenX - dragRef.current.dx, e.screenY - dragRef.current.dy)
  }
  function onPointerUp(e: React.PointerEvent): void {
    if (dragRef.current) {
      window.api.floatMoved(e.screenX - dragRef.current.dx, e.screenY - dragRef.current.dy)
    }
    dragRef.current = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }

  const iconBtn =
    'flex h-10 w-10 items-center justify-center rounded-md text-zinc-200 transition hover:bg-white/10'

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className={`flex items-center gap-1 rounded-lg bg-zinc-900 p-1.5 ring-1 ring-white/10 ${
          vertical ? 'flex-col' : 'flex-row'
        }`}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title="Drag to move"
          className={`flex cursor-grab items-center justify-center text-zinc-500 active:cursor-grabbing ${
            vertical ? 'h-5 w-10' : 'h-10 w-5'
          }`}
        >
          {vertical ? <GripVertical size={14} /> : <GripHorizontal size={14} />}
        </div>

        <button className={iconBtn} title="Capture image" onClick={() => window.api.floatCaptureImage()}>
          <Camera size={20} />
        </button>
        <button
          className={`${iconBtn} ${recording ? 'bg-red-500/90 text-white hover:bg-red-500' : ''}`}
          title={recording ? 'Stop recording' : 'Record video'}
          onClick={() => window.api.floatRecord()}
        >
          {recording ? <Square size={18} fill="currentColor" /> : <Circle size={20} />}
        </button>
        <button className={iconBtn} title="Open library" onClick={() => window.api.floatOpenLibrary()}>
          <Images size={20} />
        </button>
        <button className={iconBtn} title="Settings" onClick={() => window.api.floatOpenSettings()}>
          <SettingsIcon size={18} />
        </button>

        <div className={vertical ? 'my-0.5 h-px w-7 bg-white/10' : 'mx-0.5 h-7 w-px bg-white/10'} />

        <button
          className={`${iconBtn} text-zinc-500`}
          title="Hide floating bar"
          onClick={() => window.api.floatHide()}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
