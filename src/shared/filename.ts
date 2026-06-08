// Pure filename helpers.

/** Build a timestamped filename like "QuickShot-2026-06-08T22-09-31.png". */
export function timestampName(prefix: string, ext: string, iso: string): string {
  const stamp = iso.replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}-${stamp}.${ext}`
}

/** Strip a `data:` URL prefix, returning the raw base64 payload. */
export function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, '')
}
