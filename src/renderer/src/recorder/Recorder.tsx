import { useEffect, useRef, useState } from 'react'
import { Mic, Volume2, Video, Pause, Play, Square, TriangleAlert } from 'lucide-react'
import type { RegionFraction, RecordOptions } from '../../../preload'

type Phase = 'starting' | 'recording' | 'paused' | 'saving' | 'error'
type Config = RecordOptions & { region: RegionFraction | null; displayId: number | null }

/** Build a MediaStream from native-screenshots JPEG frames driven by the main
 *  process. The renderer maintains a backing canvas that's painted whenever a
 *  new frame arrives; `canvas.captureStream(fps)` exposes it as a real video
 *  track that MediaRecorder can encode, without ever going through Chromium's
 *  getDisplayMedia (which is what fails on the broken-DXGI laptop display). */
function startNativeDisplayStream(displayId: number, fps = 30): {
  stream: MediaStream
  stop: () => void
} {
  // Use a generously-sized backing canvas; the first frame resizes it to the
  // captured display's real resolution. drawImage scales the JPEG into this.
  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!
  let stopped = false
  let url: string | null = null

  const off = window.api.onNativeRecordFrame((jpg) => {
    if (stopped) return
    const blob = new Blob([new Uint8Array(jpg)], { type: 'image/jpeg' })
    const next = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = (): void => {
      if (stopped) {
        URL.revokeObjectURL(next)
        return
      }
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
      }
      ctx.drawImage(img, 0, 0)
      if (url) URL.revokeObjectURL(url)
      url = next
    }
    img.onerror = (): void => URL.revokeObjectURL(next)
    img.src = next
  })

  window.api.nativeRecordStart(displayId, fps)
  const stream = canvas.captureStream(fps)

  return {
    stream,
    stop: (): void => {
      stopped = true
      window.api.nativeRecordStop()
      off()
      if (url) URL.revokeObjectURL(url)
      stream.getTracks().forEach((t) => t.stop())
    }
  }
}

function fmt(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Floating control bar that records the active display via getDisplayMedia +
 * MediaRecorder (WebM). Optionally crops to a region, overlays a webcam circle,
 * and mixes microphone + system audio. Content-protected so it stays out of the
 * recording.
 */
export default function Recorder(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('starting')
  const [seconds, setSeconds] = useState(0)
  const [active, setActive] = useState({ mic: false, systemAudio: false, webcam: false })
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const elsRef = useRef<HTMLVideoElement[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const nativeStopRef = useRef<(() => void) | null>(null)
  const secondsRef = useRef(0)

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

  async function videoEl(stream: MediaStream): Promise<HTMLVideoElement> {
    const el = document.createElement('video')
    el.srcObject = stream
    el.muted = true
    el.playsInline = true
    await el.play().catch(() => {})
    if (!el.videoWidth) await new Promise<void>((r) => (el.onloadedmetadata = () => r()))
    elsRef.current.push(el)
    return el
  }

  /** Build the recorded video track: crop to region and/or overlay a webcam circle. */
  async function buildVideoStream(
    display: MediaStream,
    region: RegionFraction | null,
    cam: HTMLVideoElement | null
  ): Promise<MediaStream> {
    if (!region && !cam) return display // raw full-screen, no compositing needed
    const disp = await videoEl(display)
    const vw = disp.videoWidth
    const vh = disp.videoHeight
    const sx = region ? Math.round(region.fx * vw) : 0
    const sy = region ? Math.round(region.fy * vh) : 0
    const sw = region ? Math.max(2, Math.round(region.fw * vw)) : vw
    const sh = region ? Math.max(2, Math.round(region.fh * vh)) : vh

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')!

    const draw = (): void => {
      ctx.drawImage(disp, sx, sy, sw, sh, 0, 0, sw, sh)
      if (cam && cam.videoWidth) {
        const d = Math.round(Math.min(sw, sh) * 0.24)
        const m = Math.round(d * 0.2)
        const cx = m + d / 2
        const cy = sh - m - d / 2
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
        ctx.clip()
        const scale = Math.max(d / cam.videoWidth, d / cam.videoHeight)
        const dw = cam.videoWidth * scale
        const dh = cam.videoHeight * scale
        ctx.drawImage(cam, cx - dw / 2, cy - dh / 2, dw, dh)
        ctx.restore()
        ctx.beginPath()
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(2, d * 0.03)
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return canvas.captureStream(30)
  }

  /** Mix multiple audio tracks into one via Web Audio (used when both sources are on). */
  function mixAudio(tracks: MediaStreamTrack[]): MediaStreamTrack[] {
    if (tracks.length <= 1) return tracks
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const dest = ctx.createMediaStreamDestination()
    for (const t of tracks) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest)
    return dest.stream.getAudioTracks()
  }

  async function start(cfg: Config): Promise<void> {
    try {
      // Native video path: poll node-screenshots in main and render frames to
      // a canvas-backed MediaStream. Avoids Chromium's getDisplayMedia / DXGI
      // duplicator, which fails on the laptop display's 24-bit color format.
      if (cfg.displayId == null) throw new Error('No display selected for recording.')
      const native = startNativeDisplayStream(cfg.displayId, 30)
      nativeStopRef.current = native.stop
      const display = native.stream
      streamsRef.current.push(display)

      let cam: HTMLVideoElement | null = null
      let hasWebcam = false
      if (cfg.webcam) {
        try {
          const camStream = await navigator.mediaDevices.getUserMedia({ video: true })
          streamsRef.current.push(camStream)
          cam = await videoEl(camStream)
          hasWebcam = true
        } catch {
          /* no webcam available */
        }
      }

      const videoStream = await buildVideoStream(display, cfg.region, cam)
      const videoTrack = videoStream.getVideoTracks()[0]

      // System-audio: getDisplayMedia is the only Chromium path that exposes
      // WASAPI loopback. We request video+audio but discard the video track —
      // even if the display capture itself is degraded, the audio side often
      // still works. If it fails entirely, just record without system audio.
      let sysTracks: MediaStreamTrack[] = []
      if (cfg.systemAudio) {
        try {
          const sys = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          streamsRef.current.push(sys)
          sys.getVideoTracks().forEach((t) => t.stop())
          sysTracks = sys.getAudioTracks()
        } catch {
          /* system audio unavailable */
        }
      }
      let micTracks: MediaStreamTrack[] = []
      let hasMic = false
      if (cfg.mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamsRef.current.push(micStream)
          micTracks = micStream.getAudioTracks()
          hasMic = true
        } catch {
          /* mic denied */
        }
      }
      const audioTracks = mixAudio([...sysTracks, ...micTracks])

      setActive({ mic: hasMic, systemAudio: sysTracks.length > 0, webcam: hasWebcam })

      // Canvas captureStream tracks rarely end on their own, but keep the
      // listener for defensive parity with the old getDisplayMedia flow.
      display.getVideoTracks()[0].addEventListener('ended', () => stop())

      const combined = new MediaStream([videoTrack, ...audioTracks])
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
    elsRef.current.forEach((el) => el.pause())
    audioCtxRef.current?.close().catch(() => {})
    nativeStopRef.current?.()
    nativeStopRef.current = null
    const blob = new Blob(chunksRef.current, { type: 'video/webm' })
    const buf = await blob.arrayBuffer()
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
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
    const offConfig = window.api.onRecorderConfig((cfg) => start(cfg))
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
            <span className="flex items-center gap-1.5 text-zinc-400">
              {active.mic && <Mic size={15} className="text-sky-400" />}
              {active.systemAudio && <Volume2 size={15} className="text-sky-400" />}
              {active.webcam && <Video size={15} className="text-sky-400" />}
            </span>

            <button
              onClick={togglePause}
              disabled={phase === 'starting'}
              title={phase === 'paused' ? 'Resume' : 'Pause'}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40"
            >
              {phase === 'paused' ? (
                <Play size={15} fill="currentColor" />
              ) : (
                <Pause size={15} fill="currentColor" />
              )}
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
