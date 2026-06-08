import { useCallback, useEffect, useState } from 'react'
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

  async function handleDelete(id: string): Promise<void> {
    const list = await window.api.libraryDelete(id)
    setItems(list)
    setCurrentId((prev) => (prev === id ? list[0]?.id ?? null : prev))
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e22] text-zinc-200">
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
        items={items}
        currentId={currentId}
        onSelect={setCurrentId}
        onDelete={handleDelete}
      />
    </div>
  )
}
