import { useEffect, useRef, useState } from 'react'
import {
  MousePointer2,
  Square,
  Circle,
  MoveUpRight,
  Pencil,
  Highlighter,
  ListOrdered,
  Type,
  EyeOff,
  Crop,
  Undo2,
  Redo2,
  Trash2,
  Copy as CopyIcon,
  Save as SaveIcon,
  Download,
  Sparkles,
  Share2,
  type LucideIcon
} from 'lucide-react'
import type { LibraryItem } from '../../../preload'
import { FabricEditor, type Tool } from '../editor/FabricEditor'
import { composePretty, DEFAULT_PRETTY, BACKGROUNDS, type PrettyOptions } from './pretty'

const TOOLS: { id: Tool; label: string; Icon: LucideIcon }[] = [
  { id: 'select', label: 'Select / Move', Icon: MousePointer2 },
  { id: 'crop', label: 'Crop', Icon: Crop },
  { id: 'rect', label: 'Rectangle', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', Icon: Circle },
  { id: 'arrow', label: 'Arrow', Icon: MoveUpRight },
  { id: 'pen', label: 'Pen', Icon: Pencil },
  { id: 'highlight', label: 'Highlighter', Icon: Highlighter },
  { id: 'step', label: 'Step number', Icon: ListOrdered },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'blur', label: 'Blur / Redact', Icon: EyeOff }
]

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#000000', '#ffffff']

export default function ImageView({ item }: { item: LibraryItem }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const editorRef = useRef<FabricEditor | null>(null)
  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ff3b30')
  const [width, setWidth] = useState(4)
  const [, force] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [pretty, setPretty] = useState(false)
  const [prettyOpts, setPrettyOpts] = useState<PrettyOptions>(DEFAULT_PRETTY)

  useEffect(() => {
    if (!canvasRef.current) return
    const ed = new FabricEditor(canvasRef.current)
    ed.onChange = () => force((n) => n + 1)
    ed.onToolChange = (t) => setTool(t)
    editorRef.current = ed
    window.api.libraryImage(item.id).then((dataUrl) => {
      if (dataUrl) ed.loadImage(dataUrl).then(() => setReady(true))
    })
    return () => ed.dispose()
  }, [item.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ed = editorRef.current
      if (!ed) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        ed.undo()
      } else if (meta && (e.key === 'Z' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        ed.redo()
      } else if (meta && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copy()
      } else if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveToLibrary()
      } else if (
        (e.key === 'Backspace' || e.key === 'Delete') &&
        document.activeElement === document.body
      ) {
        ed.deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickTool(t: Tool): void {
    setTool(t)
    editorRef.current?.setTool(t)
  }
  function pickColor(c: string): void {
    setColor(c)
    editorRef.current?.setColor(c)
  }
  function pickWidth(w: number): void {
    setWidth(w)
    editorRef.current?.setWidth(w)
  }
  function flash(msg: string): void {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1600)
  }

  // Pretty styling is a presentation transform applied to copy/export only —
  // the library keeps the clean annotated source.
  async function rendered(): Promise<string> {
    const png = editorRef.current!.exportPng()
    return pretty ? composePretty(png, prettyOpts) : png
  }

  async function saveToLibrary(): Promise<void> {
    const ed = editorRef.current
    if (!ed) return
    await window.api.librarySaveEdits(item.id, ed.exportPng())
    flash('Saved to library')
  }
  async function copy(): Promise<void> {
    if (!editorRef.current) return
    await window.api.libraryCopyImage(await rendered())
    flash('Copied to clipboard')
  }
  async function exportFile(): Promise<void> {
    if (!editorRef.current) return
    const res = await window.api.libraryExport(item.id, await rendered())
    if (res.saved) flash('Exported')
  }
  async function share(): Promise<void> {
    await window.api.librarySaveEdits(item.id, editorRef.current!.exportPng())
    flash('Uploading…')
    const res = await window.api.libraryUpload(item.id)
    flash(res.ok ? 'Link copied to clipboard' : `Upload failed: ${res.error}`)
  }

  const ed = editorRef.current
  const btn = (active: boolean): string =>
    `flex h-9 w-9 items-center justify-center rounded-md transition ${
      active ? 'bg-sky-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
    }`
  const txtBtn =
    'flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10'

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button key={t.id} title={t.label} className={btn(tool === t.id)} onClick={() => pickTool(t.id)}>
              <t.Icon size={17} />
            </button>
          ))}
        </div>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => pickColor(c)}
              className={`h-6 w-6 rounded-full border ${color === c ? 'border-white' : 'border-white/20'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => pickColor(e.target.value)}
            className="ml-1 h-6 w-6 cursor-pointer rounded border border-white/20 bg-transparent p-0"
            title="Custom color"
          />
        </div>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <label className="flex items-center gap-2 text-xs text-zinc-400">
          Size
          <input
            type="range"
            min={1}
            max={30}
            value={width}
            onChange={(e) => pickWidth(Number(e.target.value))}
            className="w-24"
          />
          <span className="w-6 tabular-nums">{width}</span>
        </label>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button className={btn(false)} title="Undo (⌘Z)" disabled={!ed?.canUndo()} onClick={() => ed?.undo()}>
          <Undo2 size={17} />
        </button>
        <button className={btn(false)} title="Redo (⇧⌘Z)" disabled={!ed?.canRedo()} onClick={() => ed?.redo()}>
          <Redo2 size={17} />
        </button>
        <button className={btn(false)} title="Delete selected (⌫)" onClick={() => ed?.deleteSelected()}>
          <Trash2 size={17} />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            className={`${txtBtn} ${pretty ? 'bg-sky-500 text-white hover:bg-sky-400' : ''}`}
            onClick={() => setPretty((p) => !p)}
            title="Pretty export — padding, background, shadow"
          >
            <Sparkles size={15} /> Pretty
          </button>
          <button className={txtBtn} onClick={share} title="Upload & copy share link">
            <Share2 size={15} /> Share
          </button>
          <button className={txtBtn} onClick={copy}>
            <CopyIcon size={15} /> Copy
          </button>
          <button className={txtBtn} onClick={saveToLibrary} title="Save edits back into the library (⌘S)">
            <SaveIcon size={15} /> Save
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
            onClick={exportFile}
          >
            <Download size={15} /> Export…
          </button>
        </div>
      </div>

      {pretty && (
        <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <span>Background</span>
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                title={b.label}
                onClick={() => setPrettyOpts((o) => ({ ...o, background: b.id }))}
                className={`h-6 w-6 rounded-md border ${
                  prettyOpts.background === b.id ? 'border-sky-400 ring-1 ring-sky-400' : 'border-white/20'
                }`}
                style={{ background: b.swatch }}
              />
            ))}
          </div>
          <label className="flex items-center gap-2">
            Padding
            <input
              type="range"
              min={0}
              max={160}
              value={prettyOpts.padding}
              onChange={(e) => setPrettyOpts((o) => ({ ...o, padding: Number(e.target.value) }))}
              className="w-28 accent-sky-500"
            />
            <span className="w-7 tabular-nums">{prettyOpts.padding}</span>
          </label>
          <label className="flex items-center gap-2">
            Radius
            <input
              type="range"
              min={0}
              max={48}
              value={prettyOpts.radius}
              onChange={(e) => setPrettyOpts((o) => ({ ...o, radius: Number(e.target.value) }))}
              className="w-24 accent-sky-500"
            />
            <span className="w-7 tabular-nums">{prettyOpts.radius}</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={prettyOpts.shadow}
              onChange={(e) => setPrettyOpts((o) => ({ ...o, shadow: e.target.checked }))}
              className="accent-sky-500"
            />
            Shadow
          </label>
          <span className="text-zinc-600">Applies to Copy &amp; Export</span>
        </div>
      )}

      <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
        <canvas ref={canvasRef} className="rounded-lg shadow-2xl shadow-black/50" />
        {!ready && <div className="absolute text-sm text-zinc-500">Loading…</div>}
        {toast && (
          <div className="absolute bottom-6 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
