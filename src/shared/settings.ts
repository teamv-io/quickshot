// Pure settings model + merge logic. No Electron/Node imports → unit-testable.

export type FloatPosition = 'left-center' | 'right-center' | 'top-center' | 'bottom-center'

export interface Settings {
  floatBar: {
    enabled: boolean
    opacity: number // 0.3 – 1.0
    position: FloatPosition
    /** User-dragged position per edge, in screen coords. Null = use default centered spot. */
    customPos: Partial<Record<FloatPosition, { x: number; y: number }>>
  }
  shortcuts: {
    captureArea: string
    captureFull: string
    record: string
  }
  uploader: {
    provider: 'none' | 'custom' | 'imgur'
    customUrl: string
    customField: string
    customJsonPath: string
    imgurClientId: string
  }
}

export interface SettingsPatch {
  floatBar?: Partial<Settings['floatBar']>
  shortcuts?: Partial<Settings['shortcuts']>
  uploader?: Partial<Settings['uploader']>
}

export const DEFAULT_SETTINGS: Settings = {
  floatBar: { enabled: true, opacity: 0.65, position: 'left-center', customPos: {} },
  shortcuts: {
    captureArea: 'CommandOrControl+Shift+2',
    captureFull: 'CommandOrControl+Shift+1',
    record: 'CommandOrControl+Shift+R'
  },
  uploader: {
    provider: 'none',
    customUrl: '',
    customField: 'file',
    customJsonPath: '',
    imgurClientId: ''
  }
}

/** Deep-merge a patch (or partial persisted blob) onto a base, section by section. */
export function mergeSettings(base: Settings, patch: SettingsPatch | Partial<Settings>): Settings {
  const fb = patch.floatBar ?? {}
  return {
    floatBar: {
      ...base.floatBar,
      ...fb,
      customPos: { ...base.floatBar.customPos, ...(fb as Settings['floatBar']).customPos }
    },
    shortcuts: { ...base.shortcuts, ...(patch.shortcuts ?? {}) },
    uploader: { ...base.uploader, ...(patch.uploader ?? {}) }
  }
}

/** Clamp opacity into the allowed range. */
export function clampOpacity(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SETTINGS.floatBar.opacity
  return Math.min(1, Math.max(0.3, value))
}
