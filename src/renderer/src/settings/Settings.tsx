import { useEffect, useState } from 'react'
import type { Settings as SettingsType, FloatPosition } from '../../../preload'
import ShortcutCapture from './ShortcutCapture'

const POSITIONS: { id: FloatPosition; label: string }[] = [
  { id: 'left-center', label: 'Left' },
  { id: 'right-center', label: 'Right' },
  { id: 'top-center', label: 'Top' },
  { id: 'bottom-center', label: 'Bottom' }
]

const SHORTCUTS: { key: keyof SettingsType['shortcuts']; label: string }[] = [
  { key: 'captureArea', label: 'Capture selected area' },
  { key: 'captureFull', label: 'Capture full screen' },
  { key: 'record', label: 'Start / stop recording' }
]

export default function Settings(): JSX.Element {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => {
    window.api.settingsGet().then(setSettings)
  }, [])

  async function patch(p: Parameters<typeof window.api.settingsUpdate>[0]): Promise<void> {
    const res = await window.api.settingsUpdate(p)
    setSettings(res.settings)
    setFailed(res.failed)
  }

  if (!settings) return <div className="h-full bg-[#1e1e22]" />

  const fb = settings.floatBar

  return (
    <div className="h-full overflow-y-auto bg-[#1e1e22] px-6 py-5 text-zinc-200">
      <h1 className="mb-5 text-lg font-semibold">Settings</h1>

      {/* Floating bar */}
      <section className="mb-7">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Floating bar
        </h2>

        <label className="mb-4 flex items-center justify-between">
          <span className="text-sm">Show floating bar</span>
          <input
            type="checkbox"
            checked={fb.enabled}
            onChange={(e) => patch({ floatBar: { enabled: e.target.checked } })}
            className="h-4 w-4 accent-sky-500"
          />
        </label>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span>Opacity</span>
            <span className="tabular-nums text-zinc-400">{Math.round(fb.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={fb.opacity}
            onChange={(e) => patch({ floatBar: { opacity: Number(e.target.value) } })}
            className="w-full accent-sky-500"
          />
        </div>

        <div>
          <div className="mb-1.5 text-sm">Default position</div>
          <div className="grid grid-cols-4 gap-2">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => patch({ floatBar: { position: p.id } })}
                className={`rounded-md px-3 py-2 text-sm transition ${
                  fb.position === p.id
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Shortcuts */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Shortcuts</h2>
        <div className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{s.label}</span>
              <div className="flex items-center gap-2">
                {failed.includes(settings.shortcuts[s.key]) && (
                  <span className="text-xs text-amber-400">couldn’t bind</span>
                )}
                <ShortcutCapture
                  value={settings.shortcuts[s.key]}
                  onChange={(accel) => patch({ shortcuts: { [s.key]: accel } })}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Click a shortcut, then press the key combo. Use at least one modifier (⌘/Ctrl/⌥/⇧).
        </p>
      </section>
    </div>
  )
}
