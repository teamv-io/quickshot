import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import { DEFAULT_SETTINGS, mergeSettings, type Settings, type SettingsPatch } from '../shared/settings'

export type { Settings, SettingsPatch, FloatPosition } from '../shared/settings'

let settings: Settings
let file: string

export function initSettings(): void {
  file = join(app.getPath('userData'), 'settings.json')
  try {
    settings = existsSync(file)
      ? mergeSettings(DEFAULT_SETTINGS, JSON.parse(readFileSync(file, 'utf8')))
      : mergeSettings(DEFAULT_SETTINGS, {})
  } catch {
    settings = mergeSettings(DEFAULT_SETTINGS, {})
  }
}

export function getSettings(): Settings {
  return settings
}

export function updateSettings(patch: SettingsPatch): Settings {
  settings = mergeSettings(settings, patch)
  try {
    writeFileSync(file, JSON.stringify(settings, null, 2))
  } catch {
    // best-effort persistence
  }
  return settings
}
