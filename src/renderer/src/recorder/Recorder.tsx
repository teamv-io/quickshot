import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, TriangleAlert } from 'lucide-react'
import type { RegionFraction } from '../../../preload'

type Phase = 'starting' | 'recording' | 'paused' | 'saving' | 'error'

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Floating control bar that records the active display via getDisplayMedia +
 * MediaRecorder (WebM). Lives in a content-protected window so it doesn't
 * appear in the recording itself.
 */
export default function Recorder(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting')
  const [seconds, setSeconds] = useState(0)
  const [hasMic, setHasMic] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const timerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const secondsRef = useRef(0)

  // Keep latest phase available to async callbacks.
  const phaseRef = useRef<Phase>('starting')
  phaseRef.current = phase

  function tickStart(): void {
    if (timerRef.current != null) return
    timerRef.current = window.setInterval(() => {
      secondsRef.current += 1
      setSeconds(secondsRef.current)
    }, 1000)
  }
  function tickStop(): void {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  /** Crop a full-display stream down to the selected region via an offscreen canvas. */
  async function cropToRegion(
    display: MediaStream,
    region: RegionFraction
  ): Promise<MediaStream> {
    const video = document.createElement('video')
    video.srcObject = display
    video.muted = true
    await video.play()
    if (!video.videoWidth) {
      await new Promise<void>((res) => {
        video.onloadedmetadata = () => res()
      })
    }
    videoRef.current = video

    const vw = video.videoWidth
    const vh = video.videoHeight
    const sx = Math.round(region.fx * vw)
    const sy = Math.round(region.fy * vh)
    const sw = Math.max(2, Math.round(region.fw * vw))
    const sh = Math.max(2, Math.round(region.fh * vh))

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')!
    const draw = (): void => {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return canvas.captureStream(30)
  }

  async function start(mic: boolean, region: RegionFraction | null): Promise<void> {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      streamsRef.current.push(display)

      const source = region ? await cropToRegion(display, region) : display
      const tracks: MediaStreamTrack[] = [...source.getVideoTracks()]

      if (mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(micStream)
          tracks.push(...micStream.getAudioTracks())
          setHasMic(true)
        } catch {
          // Mic denied — continue video-only.
          setHasMic(false)
        }
      }

      // Stop if the user ends sharing via the OS.
      display.getVideoTracks()[0].addEventListener('ended', () => stop())

      const combined = new MediaStream(tracks)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm'
      const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = onStop
      rec.start()
      recorderRef.current = rec

      setPhase('recording')
      tickStart()
      window.api.recorderStarted()
    } catch (e) {
      setError((e as Error).message)
      setPhase('error')
    }
  }

  async function onStop(): Promise<void> {
    tickStop()
    setPhase('saving')
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    videoRef.current?.pause()
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const buf = await blob.arrayBuffer()
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    // Hand off to the library + Studio; main closes this bar.
    await window.api.recordingReady(buf, secondsRef.current)
  }

  function stop(): void {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else window.api.recorderDone()
  }

  function togglePause(): void {
    const rec = recorderRef.current
    if (!rec) return
    if (rec.state === 'recording') {
      rec.pause()
      tickStop()
      setPhase('paused')
    } else if (rec.state === 'paused') {
      rec.resume()
      tickStart()
      setPhase('recording')
    }
  }

  useEffect(() => {
    const offConfig = window.api.onRecorderConfig((cfg) => start(cfg.mic, cfg.region))
    const offStop = window.api.onRecorderStop(() => stop())
    return () => {
      offConfig()
      offStop()
      tickStop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recording = phase === 'recording'

  return (
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <div className="flex h-12 items-center gap-3 rounded-full bg-zinc-900/95 px-4 text-zinc-100 shadow-xl ring-1 ring-white/10">
        {phase === 'error' ? (
          <>
            <span className="flex items-center gap-1 text-xs text-red-400">
              <TriangleAlert size={14} /> {error ?? 'Recording failed'}
            </span>
            <button
              onClick={() => window.api.recorderDone()}
              className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
            >
              Close
            </button>
          </>
        ) : phase === 'saving' ? (
          <span className="text-sm text-zinc-300">Finishing…</span>
        ) : (
          <>
            <span
              className={`h-3 w-3 rounded-full bg-red-500 ${recording ? 'animate-pulse' : 'opacity-50'}`}
            />
            <span className="w-14 text-center font-mono text-sm tabular-nums">{fmt(seconds)}</span>
            {hasMic && <Mic size={16} className="text-zinc-300" />}

            <button
              onClick={togglePause}
              disabled={phase === 'starting'}
              title={phase === 'paused' ? 'Resume' : 'Pause'}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
            >
              {phase === 'paused' ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
            </button>
            <button
              onClick={stop}
              disabled={phase === 'starting'}
              title="Stop & save"
              className="flex h-8 items-center gap-1.5 rounded-full bg-red-500 px-3 text-sm font-medium hover:bg-red-400 disabled:opacity-40"
            >
              <Square size={12} fill="currentColor" /> Stop
            </button>
          </>
        )}
      </div>
    </div>
  )
}
