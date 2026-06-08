import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings, clampOpacity } from './settings'

describe('mergeSettings', () => {
  it('returns defaults when patch is empty', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS)
  })

  it('overrides only the patched floatBar keys', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { floatBar: { opacity: 0.4 } })
    expect(next.floatBar.opacity).toBe(0.4)
    expect(next.floatBar.position).toBe(DEFAULT_SETTINGS.floatBar.position)
    expect(next.shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts)
  })

  it('overrides only the patched shortcut keys', () => {
    const next = mergeSettings(DEFAULT_SETTINGS, { shortcuts: { record: 'Alt+R' } })
    expect(next.shortcuts.record).toBe('Alt+R')
    expect(next.shortcuts.captureArea).toBe(DEFAULT_SETTINGS.shortcuts.captureArea)
  })

  it('deep-merges customPos per edge', () => {
    const a = mergeSettings(DEFAULT_SETTINGS, {
      floatBar: { customPos: { 'left-center': { x: 10, y: 20 } } }
    })
    const b = mergeSettings(a, {
      floatBar: { customPos: { 'top-center': { x: 5, y: 6 } } }
    })
    expect(b.floatBar.customPos['left-center']).toEqual({ x: 10, y: 20 })
    expect(b.floatBar.customPos['top-center']).toEqual({ x: 5, y: 6 })
  })

  it('does not mutate the base object', () => {
    const snapshot = JSON.stringify(DEFAULT_SETTINGS)
    mergeSettings(DEFAULT_SETTINGS, { floatBar: { opacity: 0.9 } })
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(snapshot)
  })
})

describe('clampOpacity', () => {
  it('clamps below 0.3 and above 1', () => {
    expect(clampOpacity(0.1)).toBe(0.3)
    expect(clampOpacity(2)).toBe(1)
    expect(clampOpacity(0.5)).toBe(0.5)
  })
  it('falls back on NaN', () => {
    expect(clampOpacity(NaN)).toBe(DEFAULT_SETTINGS.floatBar.opacity)
  })
})
