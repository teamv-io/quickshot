import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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

const api = {
  /** Overlay: receive the frozen screenshot to draw the selection on. */
  onOverlaySource(cb: (src: OverlaySource) => void): () => void {
    const handler = (_e: IpcRendererEvent, src: OverlaySource): void => cb(src)
    ipcRenderer.on('overlay:source', handler)
    return () => ipcRenderer.removeListener('overlay:source', handler)
  },
  /** Overlay (screenshot): send the cropped PNG; opens the editor. */
  completeScreenshot: (croppedDataUrl: string): Promise<void> =>
    ipcRenderer.invoke('overlay:screenshot', croppedDataUrl),
  /** Overlay (record): send region (fractions) or null for full screen, plus mic choice. */
  completeRegion: (region: RegionFraction | null, mic: boolean): Promise<void> =>
    ipcRenderer.invoke('overlay:region', region, mic),
  cancelCapture: (): void => ipcRenderer.send('overlay:cancel'),

  /** Editor: pull the image that was just captured. */
  getEditorImage: (): Promise<string | null> => ipcRenderer.invoke('editor:get-image'),
  copyImage: (dataUrl: string): Promise<boolean> => ipcRenderer.invoke('editor:copy', dataUrl),
  saveImage: (dataUrl: string): Promise<{ saved: boolean; filePath?: string }> =>
    ipcRenderer.invoke('editor:save', dataUrl),

  /** Recorder: receive config (mic + optional crop region) when the bar opens. */
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
  /** Recorder: main asks the bar to stop (hotkey / tray). */
  onRecorderStop(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on('recorder:stop', handler)
    return () => ipcRenderer.removeListener('recorder:stop', handler)
  },
  recorderStarted: (): void => ipcRenderer.send('recorder:started'),
  /** Recorder: hand the finished clip to the review window. */
  recordingReady: (buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recorder:ready', buffer),
  recorderDone: (): void => ipcRenderer.send('recorder:done'),

  /** Video review: pull the recorded clip, save it, or discard. */
  getVideoBuffer: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke('video:get'),
  saveVideo: (): Promise<{ saved: boolean; filePath?: string }> =>
    ipcRenderer.invoke('video:save'),
  discardVideo: (): void => ipcRenderer.send('video:discard')
}

contextBridge.exposeInMainWorld('api', api)

export type QuickShotApi = typeof api
