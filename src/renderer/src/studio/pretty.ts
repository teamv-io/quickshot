export type PrettyBackground = 'none' | 'light' | 'dark' | 'sunset' | 'ocean' | 'mint'

export interface PrettyOptions {
  padding: number
  radius: number
  shadow: boolean
  background: PrettyBackground
}

export const DEFAULT_PRETTY: PrettyOptions = {
  padding: 56,
  radius: 14,
  shadow: true,
  background: 'sunset'
}

export const BACKGROUNDS: { id: PrettyBackground; label: string; swatch: string }[] = [
  { id: 'none', label: 'None', swatch: 'repeating-conic-gradient(#888 0% 25%, #bbb 0% 50%) 50% / 12px 12px' },
  { id: 'light', label: 'Light', swatch: '#f5f5f7' },
  { id: 'dark', label: 'Dark', swatch: '#1e1e22' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg,#ff7e5f,#feb47b)' },
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg,#2b5876,#4e4376)' },
  { id: 'mint', label: 'Mint', swatch: 'linear-gradient(135deg,#11998e,#38ef7d)' }
]

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: PrettyBackground
): void {
  if (bg === 'none') return
  if (bg === 'light') {
    ctx.fillStyle = '#f5f5f7'
  } else if (bg === 'dark') {
    ctx.fillStyle = '#1e1e22'
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h)
    const stops: Record<string, [string, string]> = {
      sunset: ['#ff7e5f', '#feb47b'],
      ocean: ['#2b5876', '#4e4376'],
      mint: ['#11998e', '#38ef7d']
    }
    const [a, b] = stops[bg]
    g.addColorStop(0, a)
    g.addColorStop(1, b)
    ctx.fillStyle = g
  }
  ctx.fillRect(0, 0, w, h)
}

/** Compose a screenshot onto a padded, optionally-shadowed, rounded backdrop. */
export async function composePretty(src: string, o: PrettyOptions): Promise<string> {
  const img = await loadImage(src)
  const pad = o.padding
  const W = img.naturalWidth + pad * 2
  const H = img.naturalHeight + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  paintBackground(ctx, W, H, o.background)

  const x = pad
  const y = pad
  const w = img.naturalWidth
  const h = img.naturalHeight
  const r = Math.min(o.radius, w / 2, h / 2)

  if (o.shadow) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = Math.max(20, pad * 0.6)
    ctx.shadowOffsetY = Math.max(8, pad * 0.2)
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fillStyle = '#000'
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  ctx.drawImage(img, x, y)
  ctx.restore()

  return canvas.toDataURL('image/png')
}
