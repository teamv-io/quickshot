// Pure keyboard-event → Electron-accelerator conversion. No DOM/React types.

export interface KeyChord {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type Platform = 'mac' | 'win' | 'linux'

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

function detectPlatform(): Platform {
  if (typeof navigator !== 'undefined') {
    const p = (navigator.platform || '') + ' ' + (navigator.userAgent || '')
    if (/Mac|iPhone|iPad/i.test(p)) return 'mac'
    if (/Win/i.test(p)) return 'win'
    return 'linux'
  }
  if (typeof process !== 'undefined' && process.platform) {
    if (process.platform === 'darwin') return 'mac'
    if (process.platform === 'win32') return 'win'
    return 'linux'
  }
  return 'mac'
}

/**
 * Convert a key chord into an Electron accelerator string (e.g. "CommandOrControl+Shift+2"),
 * or null if the chord is incomplete (modifier-only, or a normal key with no modifier).
 *
 * Cross-platform mapping:
 * - macOS: Cmd (metaKey) → CommandOrControl, Ctrl (ctrlKey) → Control
 * - Windows/Linux: Ctrl (ctrlKey) → CommandOrControl, Win/Super (metaKey) is ignored
 *   because Windows reserves it and using it as a global shortcut causes conflicts.
 */
export function toAccelerator(e: KeyChord, platform: Platform = detectPlatform()): string | null {
  const { key } = e
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta' || key === 'OS') {
    return null
  }

  const mods: string[] = []
  if (platform === 'mac') {
    if (e.metaKey) mods.push('CommandOrControl')
    if (e.ctrlKey && !e.metaKey) mods.push('Control')
  } else {
    // Windows/Linux: Ctrl is the primary command modifier. Ignore the Win key.
    if (e.ctrlKey) mods.push('CommandOrControl')
  }
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

/** Pretty-print an accelerator with platform-appropriate labels (mac glyphs vs Ctrl/Alt text). */
export function prettyAccelerator(accel: string, platform: Platform = detectPlatform()): string {
  if (!accel) return ''
  const parts = accel.split('+')
  if (platform === 'mac') {
    return parts
      .map((p) =>
        p === 'CommandOrControl' || p === 'Command' || p === 'Cmd'
          ? '⌘'
          : p === 'Control' || p === 'Ctrl'
            ? '⌃'
            : p === 'Alt' || p === 'Option'
              ? '⌥'
              : p === 'Shift'
                ? '⇧'
                : p
      )
      .join(' ')
  }
  // Windows / Linux: use plain text labels separated by '+'.
  return parts
    .map((p) =>
      p === 'CommandOrControl' || p === 'Command' || p === 'Cmd' || p === 'Control'
        ? 'Ctrl'
        : p === 'Alt' || p === 'Option'
          ? 'Alt'
          : p === 'Shift'
            ? 'Shift'
            : p === 'Super' || p === 'Meta'
              ? 'Win'
              : p
    )
    .join('+')
}
