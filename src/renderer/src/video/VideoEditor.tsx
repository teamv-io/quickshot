import { useEffect, useRef, useState } from 'react'

/**
 * Recording review window: play the clip back, then decide to save or discard.
 * (Trimming / format export are planned next.)
 */
export default function VideoEditor(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const urlRef = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [empty, setEmpty] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.getVideoBuffer().then((buf) => {
      if (cancelled) return
      if (!buf || buf.byteLength === 0) {
        setEmpty(true)
        return
      }
      const url = URL.createObjectURL(new Blob([buf], { type: 'video/webm' }))
      urlRef.current = url
      if (videoRef.current) {
        videoRef.current.src = url
        videoRef.current.play().catch(() => {})
      }
      setReady(true)
    })
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  async function save(): Promise<void> {
    const res = await window.api.saveVideo()
    if (res.saved) {
      setSaved(true)
      flash(`Saved${res.filePath ? ` · ${res.filePath.split('/').pop()}` : ''}`)
    }
  }

  function discard(): void {
    window.api.discardVideo()
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e22] text-zinc-200">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <span className="text-sm font-medium text-zinc-300">Recording preview</span>
        <div className="flex items-center gap-2">
          <button
            onClick={discard}
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
          >
            {saved ? 'Close' : 'Discard'}
          </button>
          <button
            onClick={save}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
          >
            Save…
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        {empty ? (
          <div className="text-sm text-zinc-500">No recording to preview.</div>
        ) : (
          <video
            ref={videoRef}
            controls
            loop
            playsInline
            className="max-h-full max-w-full rounded-lg bg-black shadow-2xl shadow-black/50"
          />
        )}
        {!ready && !empty && (
          <div className="absolute text-sm text-zinc-500">Loading recording…</div>
        )}
        {toast && (
          <div className="absolute bottom-6 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
