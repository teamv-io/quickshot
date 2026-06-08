import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import type { LibraryItem } from '../../../preload'

export default function VideoView({ item }: { item: LibraryItem }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

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
        // Generate a poster frame for the filmstrip the first time it's viewed.
        if (!item.thumb) {
          video.addEventListener('loadeddata', () => capturePoster(video), { once: true })
        }
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
      // WebP preview — smaller than PNG/JPEG at similar quality.
      window.api.librarySetThumb(item.id, c.toDataURL('image/webp', 0.85))
    } catch {
      // tainted/unsupported — skip poster
    }
  }

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function exportFile(): Promise<void> {
    const res = await window.api.libraryExport(item.id, null)
    if (res.saved) flash('Exported')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-300">Recording</span>
        <button
          onClick={exportFile}
          className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
        >
          <Download size={15} /> Export…
        </button>
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
