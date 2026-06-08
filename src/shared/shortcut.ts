// Pure keyboard-event → Electron-accelerator conversion. No DOM/React types.

export interface KeyChord {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

const SPECIAL: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Esc',
  '+': 'Plus'
}

function isFnKey(token: string): boolean {
  return /^F\d{1,2}$/.test(token)
}

/**
 * Convert a key chord into an Electron accelerator string (e.g. "CommandOrControl+Shift+2"),
 * or null if the chord is incomplete (modifier-only, or a normal key with no modifier).
 */
export function toAccelerator(e: KeyChord): string | null {
  const { key } = e
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null

  const mods: string[] = []
  if (e.metaKey) mods.push('CommandOrControl')
  if (e.ctrlKey && !e.metaKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  let token: string
  if (SPECIAL[key]) token = SPECIAL[key]
  else if (isFnKey(key)) token = key
  else if (key.length === 1) token = key.toUpperCase()
  else token = key // Tab, Backspace, Delete, Home, End, PageUp…

  if (mods.length === 0 && !isFnKey(token)) return null
  return [...mods, token].join('+')
}

/** Pretty-print an accelerator with mac glyphs for display. */
export function prettyAccelerator(accel: string): string {
  return accel
    .replace('CommandOrControl', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .split('+')
    .join(' ')
}
