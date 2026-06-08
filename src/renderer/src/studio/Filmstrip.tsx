import { Play, X } from 'lucide-react'
import type { LibraryItem } from '../../../preload'

function fmtDur(s: number | null): string {
  if (s == null) return ''
  const m = Math.floor(s / 60)
  const ss = Math.round(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

interface Props {
  items: LibraryItem[]
  currentId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

export default function Filmstrip({ items, currentId, onSelect, onDelete }: Props): JSX.Element {
  return (
    <div className="shrink-0 border-t border-white/10 bg-black/30 p-2">
      <div className="flex gap-2 overflow-x-auto">
        {items.length === 0 && (
          <div className="px-2 py-6 text-xs text-zinc-600">Captures will appear here</div>
        )}
        {items.map((it) => (
          <div
            key={it.id}
            onClick={() => onSelect(it.id)}
            title={new Date(it.created_at).toLocaleString()}
            className={`group relative h-20 w-32 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-zinc-800 ${
              currentId === it.id
                ? 'border-sky-400 ring-2 ring-sky-400/40'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            {it.type === 'image' && it.thumb ? (
              <img src={it.thumb} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-500">
                <Play size={22} fill="currentColor" />
              </div>
            )}
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] uppercase tracking-wide text-zinc-300">
              {it.type}
              {it.type === 'video' && it.duration != null ? ` ${fmtDur(it.duration)}` : ''}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(it.id)
              }}
              title="Delete"
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-500 group-hover:flex"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
