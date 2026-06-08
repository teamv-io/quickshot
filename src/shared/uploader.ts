// Pure helper for extracting a share URL from a custom uploader's response.

/**
 * If `jsonPath` is set, parse the body as JSON and walk dot-separated keys
 * (e.g. "data.link"); otherwise treat the whole body as the URL. Returns ''
 * when nothing usable is found.
 */
export function extractUrlFromResponse(body: string, jsonPath: string): string {
  if (!jsonPath) return body.trim()
  try {
    const json: unknown = JSON.parse(body)
    const val = jsonPath
      .split('.')
      .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], json)
    return typeof val === 'string' ? val : ''
  } catch {
    return ''
  }
}
