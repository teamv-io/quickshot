import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'

export type FloatPosition = 'left-center' | 'right-center' | 'top-center' | 'bottom-center'

export interface Settings {
  floatBar: {
    enabled: boolean
    opacity: number // 0.3 – 1.0
    position: FloatPosition
  }
  shortcuts: {
    captureArea: string
    captureFull: string
    record: string
  }
}

const DEFAULTS: Settings = {
  floatBar: { enabled: true, opacity: 0.65, position: 'left-center' },
  shortcuts: {
    captureArea: 'CommandOrControl+Shift+2',
    captureFull: 'CommandOrControl+Shift+1',
    record: 'CommandOrControl+Shift+R'
  }
}

export interface SettingsPatch {
  floatBar?: Partial<Settings['floatBar']>
  shortcuts?: Partial<Settings['shortcuts']>
}

let settings: Settings
let file: string

function merge(base: Settings, patch: SettingsPatch | Partial<Settings>): Settings {
  return {
    floatBar: { ...base.floatBar, ...(patch.floatBar ?? {}) },
    shortcuts: { ...base.shortcuts, ...(patch.shortcuts ?? {}) }
  }
}

export function initSettings(): void {
  file = join(app.getPath('userData'), 'settings.json')
  try {
    settings = existsSync(file)
      ? merge(DEFAULTS, JSON.parse(readFileSync(file, 'utf8')))
      : merge(DEFAULTS, {})
  } catch {
    settings = merge(DEFAULTS, {})
  }
}

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: SettingsPatch): Settings {
  settings = merge(settings, patch)
  try {
    writeFileSync(file, JSON.stringify(settings, null, 2))
  } catch {
    // best-effort persistence
  }
  return settings
}
