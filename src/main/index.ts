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
  shell
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { captureActiveDisplay } from './capture'

const CAPTURE_SHORTCUT = 'CommandOrControl+Shift+2'

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null

/** Image handed off from the capture overlay to the editor window. */
let pendingEditorImage: string | null = null

const preload = join(__dirname, '../preload/index.js')

function loadRoute(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

async function startCapture(): Promise<void> {
  if (overlayWindow) return
  try {
    const { dataUrl, bounds, scaleFactor } = await captureActiveDisplay()

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
      overlayWindow?.webContents.send('overlay:source', { dataUrl, bounds, scaleFactor })
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

function buildTray(): void {
  // Minimal template icon so it renders on the macOS menu bar without an asset.
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQElEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFAGm1AAGwq3GkAAAAAElFTkSuQmCC'
  )
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('QuickShot')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Capture region  (${CAPTURE_SHORTCUT})`, click: () => startCapture() },
      { type: 'separator' },
      { label: 'About QuickShot', click: () => shell.openExternal('https://github.com') },
      { label: 'Quit QuickShot', click: () => app.quit() }
    ])
  )
}

function registerIpc(): void {
  // Overlay finished selecting & cropping → open the editor with the result.
  ipcMain.handle('overlay:complete', (_e, croppedDataUrl: string) => {
    pendingEditorImage = croppedDataUrl
    overlayWindow?.close()
    openEditor()
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
}

app.whenReady().then(() => {
  // Menu-bar utility: no Dock icon, lives in the tray.
  if (process.platform === 'darwin') app.dock?.hide()

  registerIpc()
  buildTray()
  globalShortcut.register(CAPTURE_SHORTCUT, () => startCapture())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) startCapture()
  })
})

// Stay alive in the menu bar after windows close.
app.on('window-all-closed', () => {
  // intentionally no-op on all platforms; quit only via tray.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
