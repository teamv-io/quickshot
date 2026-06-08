import * as fabric from 'fabric'

export type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'pen' | 'blur' | 'crop'

/**
 * Imperative Fabric.js controller for the annotation canvas.
 *
 * The screenshot is kept as a locked background image at scale 1, so scene
 * coordinates equal native image pixels — annotations, blur crops, and the
 * final export all stay at full resolution regardless of on-screen zoom.
 *
 * Undo/redo tracks annotation objects (add/remove), which is predictable for a
 * first milestone. Object *edits* (move/resize) aren't yet on the history stack.
 */
export class FabricEditor {
  readonly canvas: fabric.Canvas
  private bg!: fabric.FabricImage
  private tool: Tool = 'select'
  private color = '#ff3b30'
  private width = 4

  private drawing = false
  private start = { x: 0, y: 0 }
  private temp: fabric.Object | null = null

  private undoStack: fabric.Object[] = []
  private redoStack: fabric.Object[] = []

  /** Fired after any change so the UI can refresh (undo/redo availability). */
  onChange?: () => void
  /** Fired when the editor changes the active tool itself (e.g. after a crop). */
  onToolChange?: (tool: Tool) => void

  constructor(el: HTMLCanvasElement) {
    this.canvas = new fabric.Canvas(el, {
      backgroundColor: '#1e1e22',
      preserveObjectStacking: true,
      selection: false
    })
    this.canvas.on('mouse:down', (o) => this.onDown(o))
    this.canvas.on('mouse:move', (o) => this.onMove(o))
    this.canvas.on('mouse:up', () => this.onUp())
    this.canvas.on('path:created', (e: any) => this.register(e.path))
  }

  async loadImage(dataUrl: string): Promise<void> {
    this.bg = await fabric.FabricImage.fromURL(dataUrl)
    this.bg.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hoverCursor: 'default'
    })
    this.canvas.add(this.bg)
    this.fit(this.bg.width ?? 0, this.bg.height ?? 0)
  }

  fit(W: number, H: number): void {
    if (!W || !H) return
    const maxW = window.innerWidth - 48
    const maxH = window.innerHeight - 150
    const z = Math.min(maxW / W, maxH / H, 1)
    this.canvas.setZoom(z)
    this.canvas.setDimensions({ width: Math.round(W * z), height: Math.round(H * z) })
    this.canvas.requestRenderAll()
  }

  setTool(t: Tool): void {
    this.tool = t
    const c = this.canvas
    c.isDrawingMode = t === 'pen'
    if (t === 'pen') {
      const brush = new fabric.PencilBrush(c)
      brush.color = this.color
      brush.width = this.width
      c.freeDrawingBrush = brush
    }
    c.selection = t === 'select'
    c.forEachObject((o) => {
      if (o !== this.bg) o.selectable = t === 'select'
    })
    c.defaultCursor = t === 'select' ? 'default' : 'crosshair'
    c.discardActiveObject()
    c.requestRenderAll()
  }

  setColor(color: string): void {
    this.color = color
    if (this.canvas.freeDrawingBrush) this.canvas.freeDrawingBrush.color = color
    const a = this.canvas.getActiveObject()
    if (a && a !== this.bg) {
      if (a.type === 'i-text' || a.type === 'text') a.set('fill', color)
      else a.set('stroke', color)
      this.canvas.requestRenderAll()
    }
    this.onChange?.()
  }

  setWidth(width: number): void {
    this.width = width
    if (this.canvas.freeDrawingBrush) this.canvas.freeDrawingBrush.width = width
    const a = this.canvas.getActiveObject()
    if (a && a !== this.bg && a.type !== 'i-text' && a.type !== 'text') {
      a.set('strokeWidth', width)
      this.canvas.requestRenderAll()
    }
    this.onChange?.()
  }

  getColor(): string {
    return this.color
  }
  getWidth(): number {
    return this.width
  }
  getTool(): Tool {
    return this.tool
  }
  canUndo(): boolean {
    return this.undoStack.length > 0
  }
  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private onDown(opt: any): void {
    if (this.tool === 'select' || this.tool === 'pen') return
    const p = this.canvas.getScenePoint(opt.e)
    this.start = { x: p.x, y: p.y }

    if (this.tool === 'text') {
      const t = new fabric.IText('Text', {
        left: p.x,
        top: p.y,
        fill: this.color,
        fontSize: Math.max(18, this.width * 5),
        fontFamily: '-apple-system, system-ui, sans-serif'
      })
      this.canvas.add(t)
      this.register(t)
      t.selectable = true
      this.canvas.setActiveObject(t)
      t.enterEditing()
      t.selectAll()
      return
    }

    this.drawing = true
    let obj: fabric.Object
    switch (this.tool) {
      case 'rect':
        obj = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 0,
          height: 0,
          fill: 'transparent',
          stroke: this.color,
          strokeWidth: this.width,
          strokeUniform: true
        })
        break
      case 'ellipse':
        obj = new fabric.Ellipse({
          left: p.x,
          top: p.y,
          rx: 0,
          ry: 0,
          fill: 'transparent',
          stroke: this.color,
          strokeWidth: this.width,
          strokeUniform: true
        })
        break
      case 'arrow':
        obj = new fabric.Line([p.x, p.y, p.x, p.y], {
          stroke: this.color,
          strokeWidth: this.width,
          strokeUniform: true
        })
        break
      case 'blur':
        obj = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 0,
          height: 0,
          fill: 'rgba(56,189,248,0.15)',
          stroke: '#38bdf8',
          strokeWidth: 1,
          strokeDashArray: [4, 4]
        })
        break
      case 'crop':
        obj = new fabric.Rect({
          left: p.x,
          top: p.y,
          width: 0,
          height: 0,
          fill: 'rgba(255,255,255,0.08)',
          stroke: '#ffffff',
          strokeWidth: 1,
          strokeDashArray: [6, 4]
        })
        break
      default:
        this.drawing = false
        return
    }
    obj.selectable = false
    this.temp = obj
    this.canvas.add(obj)
  }

  private onMove(opt: any): void {
    if (!this.drawing || !this.temp) return
    const p = this.canvas.getScenePoint(opt.e)
    const left = Math.min(this.start.x, p.x)
    const top = Math.min(this.start.y, p.y)
    const w = Math.abs(p.x - this.start.x)
    const h = Math.abs(p.y - this.start.y)

    if (this.tool === 'rect' || this.tool === 'blur' || this.tool === 'crop') {
      this.temp.set({ left, top, width: w, height: h })
    } else if (this.tool === 'ellipse') {
      ;(this.temp as fabric.Ellipse).set({ left, top, rx: w / 2, ry: h / 2 })
    } else if (this.tool === 'arrow') {
      ;(this.temp as fabric.Line).set({ x2: p.x, y2: p.y })
    }
    this.temp.setCoords()
    this.canvas.requestRenderAll()
  }

  private onUp(): void {
    if (!this.drawing) return
    this.drawing = false
    const temp = this.temp
    this.temp = null
    if (!temp) return

    const line = temp as fabric.Line
    const tooSmall =
      this.tool === 'arrow'
        ? Math.hypot((line.x2 ?? 0) - (line.x1 ?? 0), (line.y2 ?? 0) - (line.y1 ?? 0)) < 6
        : (temp.width ?? 0) < 4 && (temp.height ?? 0) < 4
    if (tooSmall) {
      this.canvas.remove(temp)
      this.canvas.requestRenderAll()
      return
    }

    if (this.tool === 'crop') {
      const r = {
        left: temp.left ?? 0,
        top: temp.top ?? 0,
        width: temp.width ?? 0,
        height: temp.height ?? 0
      }
      this.canvas.remove(temp)
      void this.cropTo(r)
      return
    }

    if (this.tool === 'arrow') {
      this.canvas.remove(line)
      const arrow = this.makeArrow(line.x1 ?? 0, line.y1 ?? 0, line.x2 ?? 0, line.y2 ?? 0)
      this.canvas.add(arrow)
      this.register(arrow)
    } else if (this.tool === 'blur') {
      const r = {
        left: temp.left ?? 0,
        top: temp.top ?? 0,
        width: temp.width ?? 0,
        height: temp.height ?? 0
      }
      this.canvas.remove(temp)
      void this.addBlur(r)
    } else {
      this.register(temp)
    }
    this.canvas.requestRenderAll()
  }

  private makeArrow(x1: number, y1: number, x2: number, y2: number): fabric.Group {
    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: this.color,
      strokeWidth: this.width,
      strokeUniform: true
    })
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
    const size = Math.max(this.width * 3.2, 12)
    const head = new fabric.Triangle({
      left: x2,
      top: y2,
      originX: 'center',
      originY: 'center',
      angle: angle + 90,
      width: size,
      height: size,
      fill: this.color
    })
    return new fabric.Group([line, head])
  }

  private async addBlur(r: {
    left: number
    top: number
    width: number
    height: number
  }): Promise<void> {
    const patch = (await this.bg.clone()) as fabric.FabricImage
    patch.set({
      left: r.left,
      top: r.top,
      cropX: r.left,
      cropY: r.top,
      width: r.width,
      height: r.height,
      scaleX: 1,
      scaleY: 1,
      originX: 'left',
      originY: 'top',
      evented: true
    })
    const block = Math.max(6, Math.round(Math.min(r.width, r.height) / 10))
    patch.filters = [new fabric.filters.Pixelate({ blocksize: block })]
    patch.applyFilters()
    this.canvas.add(patch)
    this.register(patch)
    this.canvas.requestRenderAll()
  }

  /** Flatten the canvas to the chosen rect and reload it as the new image. */
  private async cropTo(r: {
    left: number
    top: number
    width: number
    height: number
  }): Promise<void> {
    if (r.width < 4 || r.height < 4) return
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    const z = this.canvas.getZoom() || 1
    const dataUrl = this.canvas.toDataURL({
      format: 'png',
      left: r.left * z,
      top: r.top * z,
      width: r.width * z,
      height: r.height * z,
      multiplier: 1 / z
    })
    this.canvas.clear()
    this.undoStack = []
    this.redoStack = []
    await this.loadImage(dataUrl)
    this.tool = 'select'
    this.onToolChange?.('select')
    this.onChange?.()
  }

  private register(obj: fabric.Object): void {
    obj.selectable = this.tool === 'select'
    this.undoStack.push(obj)
    this.redoStack = []
    this.onChange?.()
  }

  deleteSelected(): void {
    for (const o of this.canvas.getActiveObjects()) {
      if (o === this.bg) continue
      this.canvas.remove(o)
      this.undoStack = this.undoStack.filter((x) => x !== o)
    }
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.onChange?.()
  }

  undo(): void {
    const obj = this.undoStack.pop()
    if (!obj) return
    this.canvas.remove(obj)
    this.redoStack.push(obj)
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.onChange?.()
  }

  redo(): void {
    const obj = this.redoStack.pop()
    if (!obj) return
    this.canvas.add(obj)
    obj.selectable = this.tool === 'select'
    this.undoStack.push(obj)
    this.canvas.requestRenderAll()
    this.onChange?.()
  }

  exportPng(): string {
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    const z = this.canvas.getZoom() || 1
    return this.canvas.toDataURL({ format: 'png', multiplier: 1 / z })
  }

  dispose(): void {
    this.canvas.dispose()
  }
}
