import { useEffect, useRef, useState } from 'react'
import { FabricEditor, type Tool } from './FabricEditor'

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Select / Move', icon: '⤧' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'arrow', label: 'Arrow', icon: '↗' },
  { id: 'pen', label: 'Pen', icon: '✎' },
  { id: 'text', label: 'Text', icon: 'T' },
  { id: 'blur', label: 'Blur / Redact', icon: '▒' }
]

const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de', '#000000', '#ffffff']

export default function Editor(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const editorRef = useRef<FabricEditor | null>(null)
  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#ff3b30')
  const [width, setWidth] = useState(4)
  const [, force] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const ed = new FabricEditor(canvasRef.current)
    ed.onChange = () => force((n) => n + 1)
    editorRef.current = ed

    window.api.getEditorImage().then((dataUrl) => {
      if (dataUrl) ed.loadImage(dataUrl).then(() => setReady(true))
    })

    return () => ed.dispose()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ed = editorRef.current
      if (!ed) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        ed.undo()
      } else if (meta && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        ed.redo()
      } else if (meta && e.key === 'c') {
        e.preventDefault()
        copy()
      } else if (meta && e.key === 's') {
        e.preventDefault()
        save()
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && document.activeElement === document.body) {
        ed.deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  async function copy(): Promise<void> {
    const ed = editorRef.current
    if (!ed) return
    await window.api.copyImage(ed.exportPng())
    flash('Copied to clipboard')
  }
  async function save(): Promise<void> {
    const ed = editorRef.current
    if (!ed) return
    const res = await window.api.saveImage(ed.exportPng())
    if (res.saved) flash('Saved')
  }

  const ed = editorRef.current
  const btn = (active: boolean): string =>
    `flex h-9 w-9 items-center justify-center rounded-md text-base transition ${
      active ? 'bg-sky-500 text-white' : 'bg-white/5 text-zinc-300 hover:bg-white/10'
    }`

  return (
    <div className="flex h-full flex-col bg-[#1e1e22] text-zinc-200">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              title={t.label}
              className={btn(tool === t.id)}
              onClick={() => pickTool(t.id)}
            >
              {t.icon}
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
              className={`h-6 w-6 rounded-full border ${
                color === c ? 'border-white' : 'border-white/20'
              }`}
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

        <button
          className={btn(false)}
          title="Undo (⌘Z)"
          disabled={!ed?.canUndo()}
          onClick={() => ed?.undo()}
        >
          ↶
        </button>
        <button
          className={btn(false)}
          title="Redo (⇧⌘Z)"
          disabled={!ed?.canRedo()}
          onClick={() => ed?.redo()}
        >
          ↷
        </button>
        <button className={btn(false)} title="Delete selected (⌫)" onClick={() => ed?.deleteSelected()}>
          🗑
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
            onClick={copy}
          >
            Copy
          </button>
          <button
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
            onClick={save}
          >
            Save PNG
          </button>
        </div>
      </div>

      {/* Canvas stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
        <canvas ref={canvasRef} className="rounded-lg shadow-2xl shadow-black/50" />
        {!ready && (
          <div className="absolute text-sm text-zinc-500">Waiting for capture…</div>
        )}
        {toast && (
          <div className="absolute bottom-6 rounded-full bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
