import { useEffect, useRef, useState } from 'react'
import { Download, Scissors, Loader2 } from 'lucide-react'
import type { LibraryItem } from '../../../preload'

type Format = 'webm' | 'mp4' | 'gif'

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

export default function VideoView({ item }: { item: LibraryItem }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [duration, setDuration] = useState(item.duration ?? 0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(item.duration ?? 0)

  useEffect(() => {
    let cancelled = false
    window.api.libraryVideo(item.id).then((buf) => {
      if (cancelled) return
      if (!buf || buf.byteLength === 0) {
        setMissing(true)
        return
      }
      const url = URL.createObjectURL(new Blob([buf], { type: 'video/webm' }))
      urlRef.current = url
      const video = videoRef.current
      if (video) {
        video.src = url
        if (!item.thumb) {
          video.addEventListener('loadeddata', () => capturePoster(video), { once: true })
        }
        video.addEventListener(
          'loadedmetadata',
          () => {
            if (isFinite(video.duration)) {
              setDuration(video.duration)
              setTrimEnd(video.duration)
            }
          },
          { once: true }
        )
        video.play().catch(() => {})
      }
      setReady(true)
    })
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [item.id])

  function capturePoster(video: HTMLVideoElement): void {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (!vw || !vh) return
    const scale = Math.min(1, 320 / Math.max(vw, vh))
    const c = document.createElement('canvas')
    c.width = Math.round(vw * scale)
    c.height = Math.round(vh * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, c.width, c.height)
    try {
      window.api.librarySetThumb(item.id, c.toDataURL('image/webp', 0.85))
    } catch {
      // tainted/unsupported — skip poster
    }
  }

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2000)
  }

  async function exportAs(format: Format): Promise<void> {
    setBusy(format === 'webm' ? 'Exporting…' : `Encoding ${format.toUpperCase()}…`)
    try {
      const res = await window.api.videoExport(item.id, format)
      if (res.saved) flash(`Exported ${format.toUpperCase()}`)
      else if (res.error) flash(`Export failed: ${res.error}`)
    } finally {
      setBusy(null)
    }
  }

  async function applyTrim(): Promise<void> {
    if (trimEnd - trimStart < 0.2) {
      flash('Trim range too short')
      return
    }
    setBusy('Trimming…')
    try {
      const res = await window.api.videoTrim(item.id, trimStart, trimEnd)
      if (!res.ok) flash(`Trim failed: ${res.error ?? 'unknown'}`)
      // library:changed will refresh the item; the view remounts with the new clip.
    } finally {
      setBusy(null)
    }
  }

  function setStartHere(): void {
    if (videoRef.current) setTrimStart(Math.min(videoRef.current.currentTime, trimEnd - 0.1))
  }
  function setEndHere(): void {
    if (videoRef.current) setTrimEnd(Math.max(videoRef.current.currentTime, trimStart + 0.1))
  }

  const btn = 'flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-40'

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-300">Recording</span>

        {/* Trim controls */}
        <div className="ml-2 flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-400">
          <Scissors size={13} />
          <button className="hover:text-white" onClick={setStartHere}>
            Start {fmtTime(trimStart)}
          </button>
          <span className="text-zinc-600">→</span>
          <button className="hover:text-white" onClick={setEndHere}>
            End {fmtTime(trimEnd)}
          </button>
          <button
            className="ml-1 rounded bg-sky-500/80 px-2 py-0.5 text-white hover:bg-sky-500 disabled:opacity-40"
            onClick={applyTrim}
            disabled={!!busy || (trimStart === 0 && Math.abs(trimEnd - duration) < 0.05)}
          >
            Trim
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </span>
          )}
          <button className={btn} disabled={!!busy} onClick={() => exportAs('webm')}>
            <Download size={15} /> WebM
          </button>
          <button className={btn} disabled={!!busy} onClick={() => exportAs('gif')}>
            <Download size={15} /> GIF
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 disabled:opacity-40"
            disabled={!!busy}
            onClick={() => exportAs('mp4')}
          >
            <Download size={15} /> MP4
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        {missing ? (
          <div className="text-sm text-zinc-500">Recording file is missing.</div>
        ) : (
          <video
            ref={videoRef}
            controls
            loop
            playsInline
            className="max-h-full max-w-full rounded-lg bg-black shadow-2xl shadow-black/50"
          />
        )}
        {!ready && !missing && <div className="absolute text-sm text-zinc-500">Loading…</div>}
        {toast && (
          <div className="absolute bottom-6 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
