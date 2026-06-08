import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export interface OverlaySource {
  dataUrl: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
}

const api = {
  /** Overlay: receive the frozen screenshot to draw the selection on. */
  onOverlaySource(cb: (src: OverlaySource) => void): () => void {
    const handler = (_e: IpcRendererEvent, src: OverlaySource): void => cb(src)
    ipcRenderer.on('overlay:source', handler)
    return () => ipcRenderer.removeListener('overlay:source', handler)
  },
  /** Overlay: send the cropped region; opens the editor. */
  completeCapture: (croppedDataUrl: string): Promise<void> =>
    ipcRenderer.invoke('overlay:complete', croppedDataUrl),
  cancelCapture: (): void => ipcRenderer.send('overlay:cancel'),

  /** Editor: pull the image that was just captured. */
  getEditorImage: (): Promise<string | null> => ipcRenderer.invoke('editor:get-image'),
  copyImage: (dataUrl: string): Promise<boolean> => ipcRenderer.invoke('editor:copy', dataUrl),
  saveImage: (dataUrl: string): Promise<{ saved: boolean; filePath?: string }> =>
    ipcRenderer.invoke('editor:save', dataUrl)
}

contextBridge.exposeInMainWorld('api', api)

export type QuickShotApi = typeof api
