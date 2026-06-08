import { describe, it, expect } from 'vitest'
import { toAccelerator, prettyAccelerator, type KeyChord } from './shortcut'

const chord = (over: Partial<KeyChord>): KeyChord => ({
  key: 'a',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over
})

describe('toAccelerator', () => {
  it('builds a cmd+shift+digit accelerator', () => {
    expect(toAccelerator(chord({ key: '2', metaKey: true, shiftKey: true }))).toBe(
      'CommandOrControl+Shift+2'
    )
  })

  it('uppercases letter keys', () => {
    expect(toAccelerator(chord({ key: 'r', metaKey: true }))).toBe('CommandOrControl+R')
  })

  it('returns null for modifier-only chords', () => {
    expect(toAccelerator(chord({ key: 'Shift', shiftKey: true }))).toBeNull()
    expect(toAccelerator(chord({ key: 'Meta', metaKey: true }))).toBeNull()
  })

  it('requires a modifier for normal keys', () => {
    expect(toAccelerator(chord({ key: 'a' }))).toBeNull()
  })

  it('allows function keys without a modifier', () => {
    expect(toAccelerator(chord({ key: 'F5' }))).toBe('F5')
  })

  it('maps special keys', () => {
    expect(toAccelerator(chord({ key: 'ArrowUp', altKey: true }))).toBe('Alt+Up')
    expect(toAccelerator(chord({ key: ' ', metaKey: true }))).toBe('CommandOrControl+Space')
  })

  it('keeps Control distinct from Command when meta is absent', () => {
    expect(toAccelerator(chord({ key: 'x', ctrlKey: true }))).toBe('Control+X')
  })

  it('orders modifiers consistently', () => {
    expect(
      toAccelerator(chord({ key: '1', metaKey: true, altKey: true, shiftKey: true }))
    ).toBe('CommandOrControl+Alt+Shift+1')
  })
})

describe('prettyAccelerator', () => {
  it('renders mac glyphs', () => {
    expect(prettyAccelerator('CommandOrControl+Shift+2')).toBe('⌘ ⇧ 2')
  })
})
