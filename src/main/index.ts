import { join } from 'path'
import { writeFile } from 'fs/promises'
import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  ipcMain,
  dialog,
  clipboard,
  nativeImage,
  session,
  screen,
  desktopCapturer,
  shell
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { captureActiveDisplay } from './capture'

const CAPTURE_SHORTCUT = 'CommandOrControl+Shift+2'
const CAPTURE_FULL_SHORTCUT = 'CommandOrControl+Shift+1'
const RECORD_SHORTCUT = 'CommandOrControl+Shift+R'

type OverlayPurpose = 'screenshot' | 'record'
interface RegionFraction {
  fx: number
  fy: number
  fw: number
  fh: number
}

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let videoWindow: BrowserWindow | null = null
let isRecording = false

/** Image handed off from the capture overlay to the editor window. */
let pendingEditorImage: string | null = null

/** Recorded clip handed off from the recorder to the video review window. */
let pendingVideoBuffer: ArrayBuffer | null = null

/** What the region overlay is selecting for, and the display it lives on. */
let overlayPurpose: OverlayPurpose = 'screenshot'
let overlayDisplayId: number | null = null

/** Target display/region for the next recording. */
let recordDisplayId: number | null = null
let recordRegion: RegionFraction | null = null

const preload = join(__dirname, '../preload/index.js')

function loadRoute(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

/** Open the full-screen region selector, for either a screenshot or a recording. */
async function openOverlay(purpose: OverlayPurpose): Promise<void> {
  if (overlayWindow) return
  try {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { dataUrl, bounds, scaleFactor } = await captureActiveDisplay()
    overlayPurpose = purpose
    overlayDisplayId = display.id

    overlayWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      transparent: false,
      backgroundColor: '#000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: true,
      enableLargerThanScreen: true,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { preload, sandbox: false }
    })

    // Cover the whole display including the macOS menu bar & Dock.
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    if (process.platform === 'darwin') {
      overlayWindow.setSimpleFullScreen(true)
    }
    overlayWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })
    // 'screen-saver' level draws above the system menu bar.
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    loadRoute(overlayWindow, 'overlay')

    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow?.webContents.send('overlay:source', { dataUrl, bounds, scaleFactor, purpose })
    })
    overlayWindow.on('closed', () => {
      overlayWindow = null
    })
  } catch (err) {
    overlayWindow?.close()
    overlayWindow = null
    dialog.showErrorBox(
      'Capture failed',
      `${(err as Error).message}\n\nOn macOS, grant Screen Recording permission in System Settings ▸ Privacy & Security, then relaunch.`
    )
  }
}

/** Grab the whole active display and jump straight to the editor. */
async function captureFullScreen(): Promise<void> {
  try {
    const { dataUrl } = await captureActiveDisplay()
    pendingEditorImage = dataUrl
    openEditor()
  } catch (err) {
    dialog.showErrorBox(
      'Capture failed',
      `${(err as Error).message}\n\nOn macOS, grant Screen Recording permission in System Settings ▸ Privacy & Security, then relaunch.`
    )
  }
}

function openEditor(): void {
  if (editorWindow) {
    editorWindow.close()
    editorWindow = null
  }
  editorWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'QuickShot — Editor',
    backgroundColor: '#1e1e22',
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  loadRoute(editorWindow, 'editor')
  editorWindow.once('ready-to-show', () => editorWindow?.show())
  editorWindow.on('closed', () => {
    editorWindow = null
  })
}

function openVideoEditor(): void {
  if (videoWindow) {
    videoWindow.close()
    videoWindow = null
  }
  videoWindow = new BrowserWindow({
    width: 1000,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: 'QuickShot — Recording',
    backgroundColor: '#1e1e22',
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  loadRoute(videoWindow, 'video')
  videoWindow.once('ready-to-show', () => videoWindow?.show())
  videoWindow.on('closed', () => {
    videoWindow = null
    pendingVideoBuffer = null
  })
}

function openRecorderBar(withMic: boolean): void {
  if (recorderWindow) {
    recorderWindow.focus()
    return
  }
  const display =
    (recordDisplayId != null &&
      screen.getAllDisplays().find((d) => d.id === recordDisplayId)) ||
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { workArea } = display
  const barW = 320
  const barH = 56

  recorderWindow = new BrowserWindow({
    width: barW,
    height: barH,
    x: Math.round(workArea.x + (workArea.width - barW) / 2),
    y: workArea.y + workArea.height - barH - 24,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: false }
  })

  // Keep the control bar out of the recording itself.
  recorderWindow.setContentProtection(true)
  recorderWindow.setAlwaysOnTop(true, 'screen-saver')
  recorderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRoute(recorderWindow, 'recorder')

  recorderWindow.webContents.once('did-finish-load', () => {
    recorderWindow?.webContents.send('recorder:config', { mic: withMic, region: recordRegion })
  })
  recorderWindow.on('closed', () => {
    recorderWindow = null
    isRecording = false
    refreshTray()
  })
}

function stopRecording(): void {
  recorderWindow?.webContents.send('recorder:stop')
}

function toggleRecording(): void {
  if (isRecording || recorderWindow) stopRecording()
  else void openOverlay('record')
}

function buildTray(): void {
  // Camera-aperture ring template icon (alpha mask; macOS tints it to the menu bar).
  const icon = nativeImage
    .createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAYElEQVR4nO2UwQ0AIAgD3X9pnYAItErQXsLL0B4fxxCiKdOYktIrMtFyqkS2nCKBlkMSmUCqBBLSX4BxAZThWY6+S+A9geMZf/8DVsguLLOTlogMRGk5KkGltNwrI0Q/FoRHEvzZ3FPdAAAAAElFTkSuQmCC'
    )
    .resize({ width: 18, height: 18 })
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('QuickShot')
  refreshTray()
}

function refreshTray(): void {
  if (!tray) return
  const recordItems: Electron.MenuItemConstructorOptions[] = isRecording
    ? [{ label: `■ Stop recording  (${RECORD_SHORTCUT})`, click: () => stopRecording() }]
    : [{ label: `Record…  (${RECORD_SHORTCUT})`, click: () => void openOverlay('record') }]
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Capture selected area…  (${CAPTURE_SHORTCUT})`,
        enabled: !isRecording,
        click: () => openOverlay('screenshot')
      },
      {
        label: `Capture full screen  (${CAPTURE_FULL_SHORTCUT})`,
        enabled: !isRecording,
        click: () => captureFullScreen()
      },
      { type: 'separator' },
      ...recordItems,
      { type: 'separator' },
      { label: 'About QuickShot', click: () => shell.openExternal('https://github.com') },
      { label: 'Quit QuickShot', click: () => app.quit() }
    ])
  )
}

function registerIpc(): void {
  // Screenshot overlay finished selecting & cropping → open the editor.
  ipcMain.handle('overlay:screenshot', (_e, croppedDataUrl: string) => {
    pendingEditorImage = croppedDataUrl
    overlayWindow?.close()
    openEditor()
  })

  // Recording overlay returned a region (fractions) or null for full screen, plus mic choice.
  ipcMain.handle('overlay:region', (_e, region: RegionFraction | null, mic: boolean) => {
    recordRegion = region
    recordDisplayId = overlayDisplayId
    overlayWindow?.close()
    openRecorderBar(mic)
  })

  ipcMain.on('overlay:cancel', () => {
    overlayWindow?.close()
  })

  ipcMain.handle('editor:get-image', () => pendingEditorImage)

  ipcMain.handle('editor:copy', (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    return true
  })

  ipcMain.handle('editor:save', async (_e, dataUrl: string) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save screenshot',
      defaultPath: join(app.getPath('pictures'), `QuickShot-${stamp}.png`),
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { saved: false }
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    await writeFile(filePath, Buffer.from(base64, 'base64'))
    return { saved: true, filePath }
  })

  // Recording lifecycle.
  ipcMain.on('recorder:started', () => {
    isRecording = true
    refreshTray()
  })

  // Recording finished → stash the clip and open the review window (no save yet).
  ipcMain.handle('recorder:ready', (_e, buffer: ArrayBuffer) => {
    pendingVideoBuffer = buffer
    recorderWindow?.close()
    recorderWindow = null
    isRecording = false
    refreshTray()
    openVideoEditor()
  })

  ipcMain.on('recorder:done', () => {
    recorderWindow?.close()
    recorderWindow = null
    isRecording = false
    refreshTray()
  })

  // Video review window.
  ipcMain.handle('video:get', () => pendingVideoBuffer)

  ipcMain.handle('video:save', async () => {
    if (!pendingVideoBuffer) return { saved: false }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save recording',
      defaultPath: join(app.getPath('videos'), `QuickShot-${stamp}.webm`),
      filters: [{ name: 'WebM video', extensions: ['webm'] }]
    })
    if (canceled || !filePath) return { saved: false }
    await writeFile(filePath, Buffer.from(pendingVideoBuffer))
    return { saved: true, filePath }
  })

  ipcMain.on('video:discard', () => {
    videoWindow?.close()
  })
}

app.whenReady().then(() => {
  // Menu-bar utility: no Dock icon, lives in the tray.
  if (process.platform === 'darwin') app.dock?.hide()

  // Feed getDisplayMedia the target display (set when a recording starts), with
  // no picker dialog. Falls back to the display under the cursor.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        const targetId =
          recordDisplayId ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
        const source =
          sources.find((s) => s.display_id === String(targetId)) ?? sources[0]
        callback({ video: source })
      })
    },
    { useSystemPicker: false }
  )

  registerIpc()
  buildTray()
  globalShortcut.register(CAPTURE_SHORTCUT, () => openOverlay('screenshot'))
  globalShortcut.register(CAPTURE_FULL_SHORTCUT, () => captureFullScreen())
  globalShortcut.register(RECORD_SHORTCUT, () => toggleRecording())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openOverlay('screenshot')
  })
})

// Stay alive in the menu bar after windows close.
app.on('window-all-closed', () => {
  // intentionally no-op on all platforms; quit only via tray.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
