import { useState } from 'react'

/** Convert a keyboard event into an Electron accelerator string, or null if incomplete. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const key = e.key
  if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null

  const mods: string[] = []
  if (e.metaKey) mods.push('CommandOrControl')
  if (e.ctrlKey && !e.metaKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  let token: string
  const special: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Escape: 'Esc',
    '+': 'Plus'
  }
  if (special[key]) token = special[key]
  else if (/^F\d{1,2}$/.test(key)) token = key
  else if (key.length === 1) token = key.toUpperCase()
  else token = key // Tab, Backspace, Delete, Home, End, PageUp…

  const isFnKey = /^F\d{1,2}$/.test(token)
  if (mods.length === 0 && !isFnKey) return null // require a modifier for normal keys
  return [...mods, token].join('+')
}

/** Pretty-print an accelerator with mac glyphs. */
function pretty(accel: string): string {
  return accel
    .replace('CommandOrControl', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .split('+')
    .join(' ')
}

interface Props {
  value: string
  onChange: (accel: string) => void
}

export default function ShortcutCapture({ value, onChange }: Props): JSX.Element {
  const [capturing, setCapturing] = useState(false)

  function onKeyDown(e: React.KeyboardEvent): void {
    e.preventDefault()
    if (e.key === 'Escape') {
      setCapturing(false)
      return
    }
    const accel = toAccelerator(e)
    if (accel) {
      onChange(accel)
      setCapturing(false)
    }
  }

  return (
    <button
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={capturing ? onKeyDown : undefined}
      className={`min-w-[120px] rounded-md px-3 py-1.5 text-center font-mono text-sm transition ${
        capturing
          ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400'
          : 'bg-white/5 text-zinc-200 hover:bg-white/10'
      }`}
    >
      {capturing ? 'Press keys…' : pretty(value)}
    </button>
  )
}
