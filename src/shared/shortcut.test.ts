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

describe('toAccelerator (mac)', () => {
  it('builds a cmd+shift+digit accelerator', () => {
    expect(toAccelerator(chord({ key: '2', metaKey: true, shiftKey: true }), 'mac')).toBe(
      'CommandOrControl+Shift+2'
    )
  })

  it('uppercases letter keys', () => {
    expect(toAccelerator(chord({ key: 'r', metaKey: true }), 'mac')).toBe('CommandOrControl+R')
  })

  it('returns null for modifier-only chords', () => {
    expect(toAccelerator(chord({ key: 'Shift', shiftKey: true }), 'mac')).toBeNull()
    expect(toAccelerator(chord({ key: 'Meta', metaKey: true }), 'mac')).toBeNull()
  })

  it('requires a modifier for normal keys', () => {
    expect(toAccelerator(chord({ key: 'a' }), 'mac')).toBeNull()
  })

  it('allows function keys without a modifier', () => {
    expect(toAccelerator(chord({ key: 'F5' }), 'mac')).toBe('F5')
  })

  it('maps special keys', () => {
    expect(toAccelerator(chord({ key: 'ArrowUp', altKey: true }), 'mac')).toBe('Alt+Up')
    expect(toAccelerator(chord({ key: ' ', metaKey: true }), 'mac')).toBe('CommandOrControl+Space')
  })

  it('keeps Control distinct from Command when meta is absent', () => {
    expect(toAccelerator(chord({ key: 'x', ctrlKey: true }), 'mac')).toBe('Control+X')
  })

  it('orders modifiers consistently', () => {
    expect(
      toAccelerator(chord({ key: '1', metaKey: true, altKey: true, shiftKey: true }), 'mac')
    ).toBe('CommandOrControl+Alt+Shift+1')
  })
})

describe('toAccelerator (windows)', () => {
  it('maps Ctrl to CommandOrControl so the same accel works on macOS too', () => {
    expect(toAccelerator(chord({ key: '2', ctrlKey: true, shiftKey: true }), 'win')).toBe(
      'CommandOrControl+Shift+2'
    )
  })

  it('uppercases letter keys with Ctrl', () => {
    expect(toAccelerator(chord({ key: 'r', ctrlKey: true }), 'win')).toBe('CommandOrControl+R')
  })

  it('ignores the Win/Meta key as a modifier', () => {
    // Win-key combos are reserved by Windows; ignoring the modifier means a bare
    // letter with only Meta held is treated as "no modifier".
    expect(toAccelerator(chord({ key: 'r', metaKey: true }), 'win')).toBeNull()
  })

  it('still respects Ctrl when Win is also held', () => {
    expect(toAccelerator(chord({ key: 'r', ctrlKey: true, metaKey: true }), 'win')).toBe(
      'CommandOrControl+R'
    )
  })

  it('returns null for the bare Meta keydown', () => {
    expect(toAccelerator(chord({ key: 'Meta', metaKey: true }), 'win')).toBeNull()
  })

  it('orders modifiers consistently', () => {
    expect(
      toAccelerator(chord({ key: '1', ctrlKey: true, altKey: true, shiftKey: true }), 'win')
    ).toBe('CommandOrControl+Alt+Shift+1')
  })
})

describe('prettyAccelerator', () => {
  it('renders mac glyphs on mac', () => {
    expect(prettyAccelerator('CommandOrControl+Shift+2', 'mac')).toBe('⌘ ⇧ 2')
    expect(prettyAccelerator('Control+Alt+Shift+R', 'mac')).toBe('⌃ ⌥ ⇧ R')
  })

  it('renders windows text labels on windows', () => {
    expect(prettyAccelerator('CommandOrControl+Shift+2', 'win')).toBe('Ctrl+Shift+2')
    expect(prettyAccelerator('CommandOrControl+Alt+R', 'win')).toBe('Ctrl+Alt+R')
  })

  it('renders empty for an empty accelerator', () => {
    expect(prettyAccelerator('', 'win')).toBe('')
    expect(prettyAccelerator('', 'mac')).toBe('')
  })
})
