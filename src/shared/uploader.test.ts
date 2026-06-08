import { describe, it, expect } from 'vitest'
import { extractUrlFromResponse } from './uploader'

describe('extractUrlFromResponse', () => {
  it('returns the trimmed body when no path given', () => {
    expect(extractUrlFromResponse('  https://x.io/a.png\n', '')).toBe('https://x.io/a.png')
  })
  it('walks a dot path into JSON', () => {
    expect(extractUrlFromResponse('{"data":{"link":"https://x.io/b.png"}}', 'data.link')).toBe(
      'https://x.io/b.png'
    )
  })
  it('returns empty for a missing path', () => {
    expect(extractUrlFromResponse('{"data":{}}', 'data.link')).toBe('')
  })
  it('returns empty for invalid JSON with a path', () => {
    expect(extractUrlFromResponse('not json', 'data.link')).toBe('')
  })
  it('returns empty when the resolved value is not a string', () => {
    expect(extractUrlFromResponse('{"data":{"link":123}}', 'data.link')).toBe('')
  })
})
