// Image-only panel detection. Given a screenshot, returns a list of
// axis-aligned rectangles that the *pixels* suggest are panels, dialogs, or
// windows — without any OS introspection. The approach:
//
//   1. Downscale to a working canvas (max dim 1024) for speed.
//   2. Convert to grayscale, compute |gx|, |gy| via a 3-tap central-difference
//      gradient (cheaper than full Sobel; just as effective for axis-aligned
//      borders).
//   3. Build per-row sums of |gy| and per-column sums of |gx| — UI panels
//      almost always have full-length horizontal/vertical borders, so the rows
//      and columns that contain those borders show up as histogram peaks.
//   4. Pick the local maxima as candidate top/bottom/left/right border lines.
//   5. Build per-row cumulative arrays of |gy| (and per-col of |gx|) so we can
//      score any candidate rectangle's *segment* borders in O(1).
//   6. Enumerate (top, bottom) × (left, right) combinations and keep the ones
//      whose four sides all carry enough edge mass.
//
// Output rectangles are in original-image pixel coordinates. Callers divide by
// the display's scaleFactor to get overlay-CSS coordinates.

export interface DetectedRect {
  x: number
  y: number
  width: number
  height: number
  /** Min edge density across the four sides — higher is a sharper-bordered panel. */
  score: number
}

const WORK_MAX_DIM = 1024
const MIN_SIDE_FRACTION = 0.06 // skip rectangles smaller than 6 % of the working canvas
const MAX_LINES = 40 // cap on peaks per axis to keep the O(P²×Q²) loop bounded
const EDGE_THRESHOLD = 14 // min mean gradient (0–255) along each side to accept

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = (): void => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Find local maxima in a 1-D array, ordered from strongest to weakest, keeping
 * at most `cap` of them. Suppresses any candidate that has a strictly larger
 * neighbour within ±`radius` cells, which prevents a single thick edge from
 * spawning multiple near-duplicate lines.
 */
function findPeaks(values: Float32Array, radius: number, minValue: number, cap: number): number[] {
  const peaks: { idx: number; v: number }[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v < minValue) continue
    let isMax = true
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      if (j !== i && values[j] > v) {
        isMax = false
        break
      }
    }
    if (isMax) peaks.push({ idx: i, v })
  }
  peaks.sort((a, b) => b.v - a.v)
  return peaks.slice(0, cap).map((p) => p.idx).sort((a, b) => a - b)
}

export async function detectPanels(dataUrl: string): Promise<DetectedRect[]> {
  const img = await loadImage(dataUrl)
  const ow = img.naturalWidth
  const oh = img.naturalHeight
  if (ow === 0 || oh === 0) return []

  // Working dimensions — drop to ≤ WORK_MAX_DIM to keep the analysis snappy
  // on 4K screenshots. Linear interpolation when drawing onto the canvas is
  // good enough; we're chasing edges, not pixel-perfect color.
  const scale = Math.min(WORK_MAX_DIM / ow, WORK_MAX_DIM / oh, 1)
  const w = Math.max(2, Math.round(ow * scale))
  const h = Math.max(2, Math.round(oh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  // 1. Grayscale (Rec. 601 weights — fine for edge detection).
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114
  }

  // 2. Central-difference gradients (absolute values only — direction doesn't
  //    matter when we're looking at axis-aligned borders).
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    const row = y * w
    for (let x = 1; x < w - 1; x++) {
      const i = row + x
      gx[i] = Math.abs(gray[i + 1] - gray[i - 1])
      gy[i] = Math.abs(gray[i + w] - gray[i - w])
    }
  }

  // 3. Row sums of |gy| (horizontal-edge histogram) and col sums of |gx|.
  const rowSum = new Float32Array(h)
  const colSum = new Float32Array(w)
  for (let y = 0; y < h; y++) {
    let s = 0
    const row = y * w
    for (let x = 0; x < w; x++) s += gy[row + x]
    rowSum[y] = s
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let y = 0; y < h; y++) s += gx[y * w + x]
    colSum[x] = s
  }

  // 4. Candidate border lines = histogram peaks. Always include the image's
  //    own four edges so a window-sized rectangle is still detectable.
  const peakRadius = Math.max(4, Math.round(Math.min(w, h) * 0.01))
  const rowThreshold = Math.max(w * 4, mean(rowSum) * 1.5)
  const colThreshold = Math.max(h * 4, mean(colSum) * 1.5)
  const hLines = mergeSorted(findPeaks(rowSum, peakRadius, rowThreshold, MAX_LINES), [0, h - 1])
  const vLines = mergeSorted(findPeaks(colSum, peakRadius, colThreshold, MAX_LINES), [0, w - 1])

  // 5. Cumulative arrays for O(1) segment-edge-mass lookups.
  //    cumGy is laid out row-major with an extra leading zero per row so that
  //    cumGy[y*(w+1) + x] holds Σ |gy| over [0, x). Same trick for cumGx.
  const stride = w + 1
  const cumGy = new Float32Array(h * stride)
  for (let y = 0; y < h; y++) {
    let acc = 0
    const out = y * stride
    const row = y * w
    for (let x = 0; x < w; x++) {
      acc += gy[row + x]
      cumGy[out + x + 1] = acc
    }
  }
  const colStride = h + 1
  const cumGx = new Float32Array(w * colStride)
  for (let x = 0; x < w; x++) {
    let acc = 0
    const out = x * colStride
    for (let y = 0; y < h; y++) {
      acc += gx[y * w + x]
      cumGx[out + y + 1] = acc
    }
  }

  // 6. Enumerate rectangles.
  const minSide = Math.max(40, Math.round(Math.min(w, h) * MIN_SIDE_FRACTION))
  const rects: DetectedRect[] = []
  for (let ti = 0; ti < hLines.length - 1; ti++) {
    const top = hLines[ti]
    const topBase = top * stride
    for (let bi = ti + 1; bi < hLines.length; bi++) {
      const bottom = hLines[bi]
      if (bottom - top < minSide) continue
      const bottomBase = bottom * stride

      for (let li = 0; li < vLines.length - 1; li++) {
        const left = vLines[li]
        for (let ri = li + 1; ri < vLines.length; ri++) {
          const right = vLines[ri]
          if (right - left < minSide) continue

          const span = right - left
          const height = bottom - top
          const topDensity = (cumGy[topBase + right + 1] - cumGy[topBase + left]) / span
          const bottomDensity = (cumGy[bottomBase + right + 1] - cumGy[bottomBase + left]) / span
          const leftDensity =
            (cumGx[left * colStride + bottom + 1] - cumGx[left * colStride + top]) / height
          const rightDensity =
            (cumGx[right * colStride + bottom + 1] - cumGx[right * colStride + top]) / height
          const sideDensity = Math.min(topDensity, bottomDensity, leftDensity, rightDensity)
          if (sideDensity < EDGE_THRESHOLD) continue

          // Scale back to original image coordinates.
          rects.push({
            x: Math.round(left / scale),
            y: Math.round(top / scale),
            width: Math.round(span / scale),
            height: Math.round(height / scale),
            score: sideDensity
          })
        }
      }
    }
  }

  // Smallest first so the hit-test from the front returns the inner-most panel
  // (a dialog inside a window inside the desktop).
  rects.sort((a, b) => a.width * a.height - b.width * b.height)
  return rects
}

function mean(arr: Float32Array): number {
  let s = 0
  for (let i = 0; i < arr.length; i++) s += arr[i]
  return arr.length ? s / arr.length : 0
}

function mergeSorted(a: number[], b: number[]): number[] {
  const set = new Set<number>([...a, ...b])
  return [...set].sort((x, y) => x - y)
}
