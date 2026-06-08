import { execFile } from 'child_process'
import { promisify } from 'util'
import ffmpegStatic from 'ffmpeg-static'

const run = promisify(execFile)

// In a packaged app the binary is unpacked alongside the asar.
const ffmpegPath = (ffmpegStatic as unknown as string)?.replace(
  'app.asar',
  'app.asar.unpacked'
)

function ensureFfmpeg(): string {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found')
  return ffmpegPath
}

/** Re-encode a WebM to an MP4 (H.264/AAC) suitable for sharing everywhere. */
export async function toMp4(input: string, output: string): Promise<void> {
  await run(ensureFfmpeg(), [
    '-y',
    '-i', input,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    output
  ])
}

/** Convert to an optimized GIF via a generated palette (single pass). */
export async function toGif(
  input: string,
  output: string,
  fps = 12,
  width = 640
): Promise<void> {
  await run(ensureFfmpeg(), [
    '-y',
    '-i', input,
    '-filter_complex',
    `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`,
    output
  ])
}

/** Trim [start,end] seconds, re-encoding to WebM (VP9/Opus) for frame accuracy. */
export async function trimWebm(
  input: string,
  output: string,
  start: number,
  end: number
): Promise<void> {
  await run(ensureFfmpeg(), [
    '-y',
    '-ss', String(start),
    '-to', String(end),
    '-i', input,
    '-c:v', 'libvpx-vp9',
    '-deadline', 'realtime',
    '-cpu-used', '6',
    '-b:v', '1M',
    '-c:a', 'libopus',
    output
  ])
}
