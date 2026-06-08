import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { LibraryItem } from '../../../preload'
import Filmstrip from './Filmstrip'
import ImageView from './ImageView'
import VideoView from './VideoView'

/**
 * The QuickShot "Studio": a Snagit-style window with a filmstrip of every
 * capture/recording (the library) and a main area that edits images or plays
 * back videos. Captures auto-land here; nothing is exported until you ask.
 */
export default function Studio(): JSX.Element {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [titleDraft, setTitleDraft] = useState('')

  const reload = useCallback(async () => {
    const list = await window.api.libraryList()
    setItems(list)
    setCurrentId((prev) => (prev && list.some((i) => i.id === prev) ? prev : list[0]?.id ?? null))
  }, [])

  useEffect(() => {
    void (async () => {
      const [list, cur] = await Promise.all([
        window.api.libraryList(),
        window.api.studioCurrent()
      ])
      setItems(list)
      setCurrentId(cur ?? list[0]?.id ?? null)
    })()
    const offChanged = window.api.onLibraryChanged(() => void reload())
    const offShow = window.api.onStudioShowItem((id) => setCurrentId(id))
    return () => {
      offChanged()
      offShow()
    }
  }, [reload])

  const current = items.find((i) => i.id === currentId) ?? null

  // Keep the rename field in sync with the selected item.
  useEffect(() => {
    setTitleDraft(current?.title ?? '')
  }, [current?.id, current?.title])

  async function handleDelete(id: string): Promise<void> {
    const list = await window.api.libraryDelete(id)
    setItems(list)
    setCurrentId((prev) => (prev === id ? list[0]?.id ?? null : prev))
  }

  async function commitRename(): Promise<void> {
    if (!current || titleDraft === current.title) return
    setItems(await window.api.libraryRename(current.id, titleDraft.trim()))
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? items.filter(
        (i) => i.title.toLowerCase().includes(q) || i.type.includes(q)
      )
    : items

  return (
    <div className="flex h-full flex-col bg-[#1e1e22] text-zinc-200">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={current ? 'Untitled' : ''}
          disabled={!current}
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
        />
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1">
          <Search size={14} className="text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-40 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {current?.type === 'image' ? (
          <ImageView key={current.id} item={current} />
        ) : current?.type === 'video' ? (
          <VideoView key={current.id} item={current} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
            No captures yet. Press ⌘⇧2 to capture an area, ⌘⇧1 for full screen, or ⌘⇧R to record.
          </div>
        )}
      </div>
      <Filmstrip
        items={filtered}
        currentId={currentId}
        onSelect={setCurrentId}
        onDelete={handleDelete}
      />
    </div>
  )
}
