import { describe, it, expect } from 'vitest'
import { timestampName, stripDataUrl } from './filename'

describe('timestampName', () => {
  it('formats a safe timestamped filename', () => {
    expect(timestampName('QuickShot', 'png', '2026-06-08T22:09:31.123Z')).toBe(
      'QuickShot-2026-06-08T22-09-31.png'
    )
  })
})

describe('stripDataUrl', () => {
  it('strips a png data url prefix', () => {
    expect(stripDataUrl('data:image/png;base64,AAAB')).toBe('AAAB')
  })
  it('strips a webm data url prefix', () => {
    expect(stripDataUrl('data:video/webm;base64,ZZZ')).toBe('ZZZ')
  })
  it('leaves raw base64 untouched', () => {
    expect(stripDataUrl('AAAB')).toBe('AAAB')
  })
})
