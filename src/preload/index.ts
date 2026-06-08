import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { Settings, SettingsPatch } from '../shared/settings'

export type { Settings, SettingsPatch, FloatPosition } from '../shared/settings'

export interface OverlaySource {
  dataUrl: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  purpose: 'screenshot' | 'record'
}

export interface RegionFraction {
  fx: number
  fy: number
  fw: number
  fh: number
}

export type ItemType = 'image' | 'video'
export interface LibraryItem {
  id: string
  type: ItemType
  filename: string
  title: string
  width: number | null
  height: number | null
  duration: number | null
  thumb: string | null
  created_at: number
  updated_at: number
}

export interface SaveResult {
  saved: boolean
  filePath?: string
}


const api = {
  // ── Capture overlay ──────────────────────────────────────────────
  onOverlaySource(cb: (src: OverlaySource) => void): () => void {
    const handler = (_e: IpcRendererEvent, src: OverlaySource): void => cb(src)
    ipcRenderer.on('overlay:source', handler)
    return () => ipcRenderer.removeListener('overlay:source', handler)
  },
  completeScreenshot: (croppedDataUrl: string): Promise<void> =>
    ipcRenderer.invoke('overlay:screenshot', croppedDataUrl),
  completeRegion: (region: RegionFraction | null, mic: boolean): Promise<void> =>
    ipcRenderer.invoke('overlay:region', region, mic),
  cancelCapture: (): void => ipcRenderer.send('overlay:cancel'),

  // ── Recorder control bar ─────────────────────────────────────────
  onRecorderConfig(
    cb: (cfg: { mic: boolean; region: RegionFraction | null }) => void
  ): () => void {
    const handler = (
      _e: IpcRendererEvent,
      cfg: { mic: boolean; region: RegionFraction | null }
    ): void => cb(cfg)
    ipcRenderer.on('recorder:config', handler)
    return () => ipcRenderer.removeListener('recorder:config', handler)
  },
  onRecorderStop(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on('recorder:stop', handler)
    return () => ipcRenderer.removeListener('recorder:stop', handler)
  },
  recorderStarted: (): void => ipcRenderer.send('recorder:started'),
  recordingReady: (buffer: ArrayBuffer, durationSec: number | null): Promise<void> =>
    ipcRenderer.invoke('recorder:ready', buffer, durationSec),
  recorderDone: (): void => ipcRenderer.send('recorder:done'),

  // ── Studio / Library ─────────────────────────────────────────────
  onStudioShowItem(cb: (id: string) => void): () => void {
    const handler = (_e: IpcRendererEvent, id: string): void => cb(id)
    ipcRenderer.on('studio:show-item', handler)
    return () => ipcRenderer.removeListener('studio:show-item', handler)
  },
  onLibraryChanged(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on('library:changed', handler)
    return () => ipcRenderer.removeListener('library:changed', handler)
  },
  studioCurrent: (): Promise<string | null> => ipcRenderer.invoke('studio:current'),
  libraryList: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:list'),
  libraryItem: (id: string): Promise<LibraryItem | null> => ipcRenderer.invoke('library:item', id),
  libraryImage: (id: string): Promise<string | null> => ipcRenderer.invoke('library:image', id),
  libraryVideo: (id: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke('library:video', id),
  librarySaveEdits: (id: string, dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('library:save-edits', id, dataUrl),
  libraryCopyImage: (dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('library:copy-image', dataUrl),
  libraryExport: (id: string, dataUrl: string | null): Promise<SaveResult> =>
    ipcRenderer.invoke('library:export', id, dataUrl),
  libraryDelete: (id: string): Promise<LibraryItem[]> => ipcRenderer.invoke('library:delete', id),
  libraryRename: (id: string, title: string): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:rename', id, title),
  librarySetThumb: (id: string, dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('library:thumb', id, dataUrl),
  libraryReveal: (id: string): void => ipcRenderer.send('library:reveal', id),
  libraryStartDrag: (id: string): void => ipcRenderer.send('library:start-drag', id),

  // ── Floating launcher bar ────────────────────────────────────────
  onFloatState(cb: (state: { recording: boolean }) => void): () => void {
    const handler = (_e: IpcRendererEvent, state: { recording: boolean }): void => cb(state)
    ipcRenderer.on('float:state', handler)
    return () => ipcRenderer.removeListener('float:state', handler)
  },
  floatGetState: (): Promise<{ recording: boolean; vertical: boolean }> =>
    ipcRenderer.invoke('float:get-state'),
  floatCaptureImage: (): void => ipcRenderer.send('float:capture'),
  floatRecord: (): void => ipcRenderer.send('float:record'),
  floatOpenLibrary: (): void => ipcRenderer.send('float:library'),
  floatHide: (): void => ipcRenderer.send('float:hide'),
  floatMove: (x: number, y: number): void => ipcRenderer.send('float:move', x, y),
  floatMoved: (x: number, y: number): void => ipcRenderer.send('float:moved', x, y),
  floatOpenSettings: (): void => ipcRenderer.send('float:settings'),

  // ── Settings ─────────────────────────────────────────────────────
  settingsGet: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  settingsUpdate: (patch: SettingsPatch): Promise<{ settings: Settings; failed: string[] }> =>
    ipcRenderer.invoke('settings:update', patch)
}

contextBridge.exposeInMainWorld('api', api)

export type QuickShotApi = typeof api
