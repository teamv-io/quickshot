import { join } from 'path'
import { writeFile, readFile, rename } from 'fs/promises'
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
import {
  initLibrary,
  listItems,
  getItem,
  addImage,
  addVideo,
  readMedia,
  mediaPath,
  updateImage,
  updateVideoMeta,
  setTitle,
  setThumb,
  deleteItem
} from './library'
import { toMp4, toGif, trimWebm } from './transcode'
import { extractUrlFromResponse } from '../shared/uploader'
import { autoUpdater } from 'electron-updater'
import {
  initSettings,
  getSettings,
  updateSettings,
  type Settings,
  type SettingsPatch,
  type FloatPosition
} from './settings'

type OverlayPurpose = 'screenshot' | 'record'
interface RegionFraction {
  fx: number
  fy: number
  fw: number
  fh: number
}
interface RecordOptions {
  mic: boolean
  systemAudio: boolean
  webcam: boolean
}

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let studioWindow: BrowserWindow | null = null
let recorderWindow: BrowserWindow | null = null
let floatBarWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let floatBarVertical = true
let isRecording = false

/** Item the Studio window should focus when it (re)opens. */
let currentStudioItem: string | null = null

/** Display the region overlay lives on (used to target recordings). */
let overlayDisplayId: number | null = null

/** Target display/region/options for the next recording. */
let recordDisplayId: number | null = null
let recordRegion: RegionFraction | null = null
let recordOptions: RecordOptions = { mic: false, systemAudio: false, webcam: false }

const preload = join(__dirname, '../preload/index.js')

function loadRoute(win: BrowserWindow, hash: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

function broadcastLibraryChanged(): void {
  studioWindow?.webContents.send('library:changed')
}

/** Open (or focus) the Studio window, optionally jumping to a specific item. */
function openStudio(itemId: string | null): void {
  currentStudioItem = itemId
  if (studioWindow) {
    studioWindow.show()
    studioWindow.focus()
    studioWindow.webContents.send('library:changed')
    if (itemId) studioWindow.webContents.send('studio:show-item', itemId)
    return
  }
  studioWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 820,
    minHeight: 560,
    title: 'QuickShot by TeamV',
    backgroundColor: '#1e1e22',
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  loadRoute(studioWindow, 'studio')
  studioWindow.once('ready-to-show', () => studioWindow?.show())
  studioWindow.on('closed', () => {
    studioWindow = null
  })
}

/** Open the full-screen region selector, for either a screenshot or a recording. */
async function openOverlay(purpose: OverlayPurpose): Promise<void> {
  if (overlayWindow) return
  try {
    floatBarWindow?.hide() // keep the launcher clear of the selection
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { dataUrl, bounds, scaleFactor } = await captureActiveDisplay()
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
    overlayWindow.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height })
    // 'screen-saver' level draws above the system menu bar.
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    loadRoute(overlayWindow, 'overlay')

    overlayWindow.webContents.once('did-finish-load', () => {
      overlayWindow?.webContents.send('overlay:source', { dataUrl, bounds, scaleFactor, purpose })
    })
    overlayWindow.on('closed', () => {
      overlayWindow = null
      if (getSettings().floatBar.enabled) floatBarWindow?.showInactive()
    })
  } catch (err) {
    overlayWindow?.close()
    overlayWindow = null
    if (getSettings().floatBar.enabled) floatBarWindow?.showInactive()
    dialog.showErrorBox(
      'Capture failed',
      `${(err as Error).message}\n\nOn macOS, grant Screen Recording permission in System Settings ▸ Privacy & Security, then relaunch.`
    )
  }
}

/** Grab the whole active display, store it in the library, open Studio. */
async function captureFullScreen(): Promise<void> {
  try {
    const { dataUrl } = await captureActiveDisplay()
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
    const item = addImage(buf, Date.now())
    broadcastLibraryChanged()
    openStudio(item.id)
  } catch (err) {
    dialog.showErrorBox(
      'Capture failed',
      `${(err as Error).message}\n\nOn macOS, grant Screen Recording permission in System Settings ▸ Privacy & Security, then relaunch.`
    )
  }
}

function openRecorderBar(): void {
  if (recorderWindow) {
    recorderWindow.focus()
    return
  }
  const display =
    (recordDisplayId != null && screen.getAllDisplays().find((d) => d.id === recordDisplayId)) ||
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
    recorderWindow?.webContents.send('recorder:config', { ...recordOptions, region: recordRegion })
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

// ── Floating launcher bar ────────────────────────────────────────────
function floatBarGeometry(pos: FloatPosition): {
  x: number
  y: number
  width: number
  height: number
  vertical: boolean
} {
  const { workArea } = screen.getPrimaryDisplay()
  const vertical = pos === 'left-center' || pos === 'right-center'
  const longSide = 288
  const shortSide = 56
  const width = vertical ? shortSide : longSide
  const height = vertical ? longSide : shortSide
  const m = 16
  const cx = Math.round(workArea.x + (workArea.width - width) / 2)
  const cy = Math.round(workArea.y + (workArea.height - height) / 2)
  switch (pos) {
    case 'left-center':
      return { x: workArea.x + m, y: cy, width, height, vertical }
    case 'right-center':
      return { x: workArea.x + workArea.width - width - m, y: cy, width, height, vertical }
    case 'top-center':
      return { x: cx, y: workArea.y + m, width, height, vertical }
    case 'bottom-center':
      return { x: cx, y: workArea.y + workArea.height - height - m, width, height, vertical }
  }
}

function dragFallbackIcon(): Electron.NativeImage {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAYElEQVR4nO2UwQ0AIAgD3X9pnYAItErQXsLL0B4fxxCiKdOYktIrMtFyqkS2nCKBlkMSmUCqBBLSX4BxAZThWY6+S+A9geMZf/8DVsguLLOTlogMRGk5KkGltNwrI0Q/FoRHEvzZ3FPdAAAAAElFTkSuQmCC'
  )
}

function showFloatBar(): void {
  const { opacity, position, customPos } = getSettings().floatBar
  const g = floatBarGeometry(position)
  floatBarVertical = g.vertical
  const saved = customPos[position]
  const x = saved ? saved.x : g.x
  const y = saved ? saved.y : g.y

  if (floatBarWindow) {
    floatBarWindow.setBounds({ x, y, width: g.width, height: g.height })
    floatBarWindow.setOpacity(opacity)
    floatBarWindow.showInactive()
    return
  }
  floatBarWindow = new BrowserWindow({
    width: g.width,
    height: g.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false, // moved manually via drag handle (keeps the window non-activating)
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  floatBarWindow.setContentProtection(true) // never appears in captures/recordings
  floatBarWindow.setAlwaysOnTop(true, 'screen-saver')
  floatBarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  floatBarWindow.setOpacity(opacity)
  loadRoute(floatBarWindow, 'floatbar')
  floatBarWindow.once('ready-to-show', () => floatBarWindow?.showInactive())
  floatBarWindow.on('closed', () => {
    floatBarWindow = null
  })
}

function destroyFloatBar(): void {
  floatBarWindow?.close()
  floatBarWindow = null
}

function toggleFloatBar(): void {
  const next = !getSettings().floatBar.enabled
  applySettings(updateSettings({ floatBar: { enabled: next } }))
}

/** (Re)register global shortcuts from settings; returns accelerators that failed to bind. */
function registerShortcuts(sc: Settings['shortcuts']): string[] {
  globalShortcut.unregisterAll()
  const failed: string[] = []
  const bind = (accel: string, fn: () => void): void => {
    if (!accel) return
    try {
      if (!globalShortcut.register(accel, fn)) failed.push(accel)
    } catch {
      failed.push(accel)
    }
  }
  bind(sc.captureArea, () => openOverlay('screenshot'))
  bind(sc.captureFull, () => captureFullScreen())
  bind(sc.record, () => toggleRecording())
  return failed
}

/** Apply a full settings object to the live windows + shortcuts + tray. */
function applySettings(s: Settings): void {
  registerShortcuts(s.shortcuts)
  if (s.floatBar.enabled) {
    // Recreate so geometry/orientation always match the chosen position.
    destroyFloatBar()
    showFloatBar()
  } else {
    destroyFloatBar()
  }
  refreshTray()
}

function setupAutoUpdate(): void {
  if (is.dev) return
  autoUpdater.autoDownload = true
  autoUpdater.on('error', () => {
    /* ignore (e.g. unsigned macOS build can't self-update) */
  })
  autoUpdater.checkForUpdatesAndNotify().catch(() => {})
}

function checkForUpdates(): void {
  if (is.dev) {
    dialog.showMessageBox({ message: 'Update checking runs in the installed app only.' })
    return
  }
  autoUpdater.once('update-not-available', () =>
    dialog.showMessageBox({ message: 'QuickShot by TeamV is up to date.' })
  )
  autoUpdater.once('update-available', () =>
    dialog.showMessageBox({ message: 'An update is available — downloading in the background.' })
  )
  autoUpdater.checkForUpdates().catch((e) => dialog.showErrorBox('Update check failed', String(e)))
}

function openSettings(): void {
  if (settingsWindow) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 540,
    height: 600,
    resizable: false,
    title: 'QuickShot by TeamV — Settings',
    backgroundColor: '#1e1e22',
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  loadRoute(settingsWindow, 'settings')
  settingsWindow.once('ready-to-show', () => settingsWindow?.show())
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
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
  tray.setToolTip('QuickShot by TeamV')
  refreshTray()
}

function refreshTray(): void {
  floatBarWindow?.webContents.send('float:state', { recording: isRecording })
  if (!tray) return
  const sc = getSettings().shortcuts
  const recordItems: Electron.MenuItemConstructorOptions[] = isRecording
    ? [{ label: `■ Stop recording  (${sc.record})`, click: () => stopRecording() }]
    : [{ label: `Record…  (${sc.record})`, click: () => void openOverlay('record') }]
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Capture selected area…  (${sc.captureArea})`,
        enabled: !isRecording,
        click: () => openOverlay('screenshot')
      },
      {
        label: `Capture full screen  (${sc.captureFull})`,
        enabled: !isRecording,
        click: () => captureFullScreen()
      },
      { type: 'separator' },
      ...recordItems,
      { type: 'separator' },
      {
        label: 'Floating bar',
        type: 'checkbox',
        checked: getSettings().floatBar.enabled,
        click: () => toggleFloatBar()
      },
      { label: 'Open Library…', click: () => openStudio(null) },
      { label: 'Settings…', click: () => openSettings() },
      { label: 'Check for Updates…', click: () => checkForUpdates() },
      { label: 'About QuickShot', click: () => shell.openExternal('https://github.com/teamv-io/quickshot') },
      { label: 'Quit QuickShot', click: () => app.quit() }
    ])
  )
}

function registerIpc(): void {
  // Screenshot overlay finished cropping → store in library, open Studio.
  ipcMain.handle('overlay:screenshot', (_e, croppedDataUrl: string) => {
    overlayWindow?.close()
    const buf = Buffer.from(croppedDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
    const item = addImage(buf, Date.now())
    broadcastLibraryChanged()
    openStudio(item.id)
  })

  // Recording overlay returned a region (or null = full screen) + capture options.
  ipcMain.handle('overlay:region', (_e, region: RegionFraction | null, opts: RecordOptions) => {
    recordRegion = region
    recordDisplayId = overlayDisplayId
    recordOptions = opts
    overlayWindow?.close()
    openRecorderBar()
  })

  ipcMain.on('overlay:cancel', () => {
    overlayWindow?.close()
  })

  // Recording lifecycle.
  ipcMain.on('recorder:started', () => {
    isRecording = true
    refreshTray()
  })

  // Recording finished → store in library, open Studio (review/play there).
  ipcMain.handle('recorder:ready', (_e, buffer: ArrayBuffer, durationSec: number | null) => {
    recorderWindow?.close()
    recorderWindow = null
    isRecording = false
    refreshTray()
    const item = addVideo(Buffer.from(buffer), durationSec ?? null, Date.now())
    broadcastLibraryChanged()
    openStudio(item.id)
  })

  ipcMain.on('recorder:done', () => {
    recorderWindow?.close()
    recorderWindow = null
    isRecording = false
    refreshTray()
  })

  // ── Library / Studio ──────────────────────────────────────────────
  ipcMain.handle('studio:current', () => currentStudioItem)
  ipcMain.handle('library:list', () => listItems())
  ipcMain.handle('library:item', (_e, id: string) => getItem(id) ?? null)

  ipcMain.handle('library:image', (_e, id: string) => {
    const buf = readMedia(id)
    return buf ? `data:image/png;base64,${buf.toString('base64')}` : null
  })

  ipcMain.handle('library:video', (_e, id: string) => {
    const buf = readMedia(id)
    if (!buf) return null
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('library:save-edits', (_e, id: string, dataUrl: string) => {
    const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
    updateImage(id, buf, Date.now())
    broadcastLibraryChanged()
    return true
  })

  ipcMain.handle('library:copy-image', (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
    return true
  })

  ipcMain.handle('library:export', async (_e, id: string, dataUrl: string | null) => {
    const item = getItem(id)
    if (!item || item.type !== 'image') return { saved: false }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export image',
      defaultPath: join(app.getPath('pictures'), `QuickShot-${stamp}.png`),
      filters: [{ name: 'PNG image', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { saved: false }
    const buf = dataUrl
      ? Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
      : readMedia(id)
    if (!buf) return { saved: false }
    await writeFile(filePath, buf)
    return { saved: true, filePath }
  })

  // Export a recording as WebM (original), MP4, or GIF.
  ipcMain.handle('video:export', async (_e, id: string, format: 'webm' | 'mp4' | 'gif') => {
    const item = getItem(id)
    const src = mediaPath(id)
    if (!item || item.type !== 'video' || !src) return { saved: false }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filters: Record<string, Electron.FileFilter> = {
      webm: { name: 'WebM video', extensions: ['webm'] },
      mp4: { name: 'MP4 video', extensions: ['mp4'] },
      gif: { name: 'Animated GIF', extensions: ['gif'] }
    }
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export recording',
      defaultPath: join(app.getPath('videos'), `QuickShot-${stamp}.${format}`),
      filters: [filters[format]]
    })
    if (canceled || !filePath) return { saved: false }
    try {
      if (format === 'webm') await writeFile(filePath, readMedia(id)!)
      else if (format === 'mp4') await toMp4(src, filePath)
      else await toGif(src, filePath)
    } catch (err) {
      return { saved: false, error: (err as Error).message }
    }
    return { saved: true, filePath }
  })

  // Trim a recording in place to [start,end] seconds.
  ipcMain.handle('video:trim', async (_e, id: string, start: number, end: number) => {
    const item = getItem(id)
    const src = mediaPath(id)
    if (!item || item.type !== 'video' || !src) return { ok: false }
    const tmp = `${src}.trimming.webm`
    try {
      await trimWebm(src, tmp, start, end)
      await rename(tmp, src)
      updateVideoMeta(id, Math.max(0, end - start), Date.now())
      broadcastLibraryChanged()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('library:upload', async (_e, id: string) => {
    const item = getItem(id)
    const p = mediaPath(id)
    if (!item || !p) return { ok: false, error: 'not found' }
    const cfg = getSettings().uploader
    try {
      const buf = await readFile(p)
      const mime = item.type === 'image' ? 'image/png' : 'video/webm'
      const blob = new Blob([buf], { type: mime })
      let url = ''

      if (cfg.provider === 'imgur') {
        if (item.type !== 'image') return { ok: false, error: 'Imgur supports images only' }
        if (!cfg.imgurClientId) return { ok: false, error: 'Set an Imgur Client-ID in Settings' }
        const form = new FormData()
        form.append('image', blob, item.filename)
        const res = await fetch('https://api.imgur.com/3/image', {
          method: 'POST',
          headers: { Authorization: `Client-ID ${cfg.imgurClientId}` },
          body: form
        })
        const json = (await res.json()) as { success?: boolean; data?: { link?: string } }
        if (!json.success || !json.data?.link) return { ok: false, error: 'Imgur upload failed' }
        url = json.data.link
      } else if (cfg.provider === 'custom') {
        if (!cfg.customUrl) return { ok: false, error: 'Set an upload URL in Settings' }
        const form = new FormData()
        form.append(cfg.customField || 'file', blob, item.filename)
        const res = await fetch(cfg.customUrl, { method: 'POST', body: form })
        url = extractUrlFromResponse(await res.text(), cfg.customJsonPath)
        if (!url) return { ok: false, error: 'No URL found in response' }
      } else {
        return { ok: false, error: 'No uploader configured (set one in Settings)' }
      }

      clipboard.writeText(url)
      return { ok: true, url }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('library:delete', (_e, id: string) => {
    deleteItem(id)
    if (currentStudioItem === id) currentStudioItem = null
    broadcastLibraryChanged()
    return listItems()
  })

  ipcMain.handle('library:rename', (_e, id: string, title: string) => {
    setTitle(id, title, Date.now())
    broadcastLibraryChanged()
    return listItems()
  })

  // Lazily-generated video poster frame from the renderer.
  ipcMain.handle('library:thumb', (_e, id: string, dataUrl: string) => {
    setThumb(id, dataUrl, Date.now())
    broadcastLibraryChanged()
    return true
  })

  ipcMain.on('library:reveal', (_e, id: string) => {
    const p = mediaPath(id)
    if (p) shell.showItemInFolder(p)
  })

  // Native file drag-out (drag a thumbnail into Finder/Slack/email).
  ipcMain.on('library:start-drag', (e, id: string) => {
    const item = getItem(id)
    const p = mediaPath(id)
    if (!item || !p) return
    let icon = item.thumb ? nativeImage.createFromDataURL(item.thumb) : nativeImage.createEmpty()
    if (icon.isEmpty()) icon = dragFallbackIcon()
    e.sender.startDrag({ file: p, icon: icon.resize({ width: 128 }) })
  })

  // ── Floating launcher bar ──────────────────────────────────────────
  ipcMain.on('float:capture', () => void openOverlay('screenshot'))
  ipcMain.on('float:record', () => toggleRecording())
  ipcMain.on('float:library', () => openStudio(null))
  ipcMain.on('float:hide', () => applySettings(updateSettings({ floatBar: { enabled: false } })))
  ipcMain.handle('float:get-state', () => ({ recording: isRecording, vertical: floatBarVertical }))
  ipcMain.on('float:move', (_e, x: number, y: number) =>
    floatBarWindow?.setPosition(Math.round(x), Math.round(y))
  )
  // Persist the dragged position for the current edge.
  ipcMain.on('float:moved', (_e, x: number, y: number) => {
    const pos = getSettings().floatBar.position
    updateSettings({ floatBar: { customPos: { [pos]: { x: Math.round(x), y: Math.round(y) } } } })
  })
  ipcMain.on('float:settings', () => openSettings())

  // ── Settings ───────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) => {
    const next = updateSettings(patch)
    const failed = patch.shortcuts ? registerShortcuts(next.shortcuts) : []
    // Apply float-bar changes (opacity/position/enabled) without double-registering.
    if (patch.floatBar) {
      if (next.floatBar.enabled) {
        destroyFloatBar()
        showFloatBar()
      } else {
        destroyFloatBar()
      }
    }
    refreshTray()
    return { settings: next, failed }
  })
}

app.whenReady().then(() => {
  // Menu-bar utility: no Dock icon, lives in the tray.
  if (process.platform === 'darwin') app.dock?.hide()

  initLibrary()
  initSettings()

  // Feed getDisplayMedia the target display (set when a recording starts), with
  // no picker dialog. Falls back to the display under the cursor.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        const targetId =
          recordDisplayId ?? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id
        const source = sources.find((s) => s.display_id === String(targetId)) ?? sources[0]
        // 'loopback' captures system audio where supported (Windows; macOS 13+).
        callback(recordOptions.systemAudio ? { video: source, audio: 'loopback' } : { video: source })
      })
    },
    { useSystemPicker: false }
  )

  registerIpc()
  buildTray()
  const s = getSettings()
  registerShortcuts(s.shortcuts)
  if (s.floatBar.enabled) showFloatBar()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openStudio(null)
  })
})

// Stay alive in the menu bar after windows close.
app.on('window-all-closed', () => {
  // intentionally no-op; quit only via tray.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
