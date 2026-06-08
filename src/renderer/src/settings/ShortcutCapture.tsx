import { useState } from 'react'
import { toAccelerator, prettyAccelerator } from '../../../shared/shortcut'

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
      {capturing ? 'Press keys…' : prettyAccelerator(value)}
    </button>
  )
}
