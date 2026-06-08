import { join } from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs'
import { randomUUID } from 'node:crypto'
import { app, nativeImage } from 'electron'
import Database from 'better-sqlite3'

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

let db: Database.Database
let mediaDir: string

export function initLibrary(): void {
  const base = app.getPath('userData')
  mediaDir = join(base, 'library')
  mkdirSync(mediaDir, { recursive: true })
  db = new Database(join(base, 'library.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      filename   TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      width      INTEGER,
      height     INTEGER,
      duration   REAL,
      thumb      TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
}

/** Downscale a PNG to a filmstrip thumbnail data URL via nativeImage. */
function makeThumb(pngBuffer: Buffer): string | null {
  try {
    const img = nativeImage.createFromBuffer(pngBuffer)
    const { width, height } = img.getSize()
    if (!width || !height) return null
    const scale = Math.min(1, 320 / Math.max(width, height))
    const thumb =
      scale < 1
        ? img.resize({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            quality: 'good'
          })
        : img
    return thumb.toDataURL()
  } catch {
    return null
  }
}

export function getItem(id: string): LibraryItem | undefined {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as LibraryItem | undefined
}

export function listItems(): LibraryItem[] {
  return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as LibraryItem[]
}

export function addImage(pngBuffer: Buffer, now: number): LibraryItem {
  const id = randomUUID()
  const filename = `${id}.png`
  writeFileSync(join(mediaDir, filename), pngBuffer)
  const { width, height } = nativeImage.createFromBuffer(pngBuffer).getSize()
  db.prepare(
    `INSERT INTO items (id, type, filename, title, width, height, duration, thumb, created_at, updated_at)
     VALUES (?, 'image', ?, '', ?, ?, NULL, ?, ?, ?)`
  ).run(id, filename, width, height, makeThumb(pngBuffer), now, now)
  return getItem(id)!
}

export function addVideo(buffer: Buffer, durationSec: number | null, now: number): LibraryItem {
  const id = randomUUID()
  const filename = `${id}.webm`
  writeFileSync(join(mediaDir, filename), buffer)
  db.prepare(
    `INSERT INTO items (id, type, filename, title, width, height, duration, thumb, created_at, updated_at)
     VALUES (?, 'video', ?, '', NULL, NULL, ?, NULL, ?, ?)`
  ).run(id, filename, durationSec, now, now)
  return getItem(id)!
}

export function readMedia(id: string): Buffer | null {
  const item = getItem(id)
  if (!item) return null
  const p = join(mediaDir, item.filename)
  return existsSync(p) ? readFileSync(p) : null
}

export function mediaPath(id: string): string | null {
  const item = getItem(id)
  return item ? join(mediaDir, item.filename) : null
}

/** Persist edited image bytes back onto the stored item (overwrites + refreshes thumb). */
export function updateImage(id: string, pngBuffer: Buffer, now: number): void {
  const item = getItem(id)
  if (!item || item.type !== 'image') return
  writeFileSync(join(mediaDir, item.filename), pngBuffer)
  const { width, height } = nativeImage.createFromBuffer(pngBuffer).getSize()
  db.prepare('UPDATE items SET width = ?, height = ?, thumb = ?, updated_at = ? WHERE id = ?').run(
    width,
    height,
    makeThumb(pngBuffer),
    now,
    id
  )
}

export function setTitle(id: string, title: string, now: number): void {
  db.prepare('UPDATE items SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id)
}

/** Set/replace an item's thumbnail (e.g. a lazily-generated video poster frame). */
export function setThumb(id: string, thumb: string, now: number): void {
  db.prepare('UPDATE items SET thumb = ?, updated_at = ? WHERE id = ?').run(thumb, now, id)
}

export function deleteItem(id: string): void {
  const item = getItem(id)
  if (!item) return
  try {
    unlinkSync(join(mediaDir, item.filename))
  } catch {
    // file already gone — ignore
  }
  db.prepare('DELETE FROM items WHERE id = ?').run(id)
}
