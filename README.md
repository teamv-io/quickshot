# QuickShot

Open-source screenshot, annotation, and (soon) screen recording — a free alternative to ShareX / CleanShot / Flameshot. Built with Electron so one codebase ships to **macOS today, Windows & Linux next**.

> Status: early MVP. Region capture → annotate → copy/save works. Recording is on the roadmap.

## Features (current)

- 🎯 **Screenshot — full screen or selected area**
  - `⌘/Ctrl + Shift + 1` → full screen · `⌘/Ctrl + Shift + 2` → drag-select region
- 🎥 **Screen recording — full screen or selected area** (`⌘/Ctrl + Shift + R`)
  - Optional microphone, pause/resume, live timer, floating control bar (kept out of the recording)
  - Region recording crops the stream via a canvas pipeline → WebM (VP9 + Opus)
- 🖍️ **Annotate** — arrow, rectangle, ellipse, freehand pen, text.
- 🌫️ **Blur / redact** — pixelate sensitive areas at full resolution.
- ↩️ **Undo / redo**, delete, color palette + custom color, adjustable stroke size.
- 📋 **Copy to clipboard** or **Save PNG** (full native resolution, Retina-aware).
- 🧭 Lives in the **menu bar** (no Dock clutter).

### Shortcuts

| Action | Shortcut |
|---|---|
| Capture selected area | `⌘/Ctrl + Shift + 2` |
| Capture full screen | `⌘/Ctrl + Shift + 1` |
| Start / stop recording | `⌘/Ctrl + Shift + R` |

(Recording full vs. selected area, and with/without mic, are chosen from the menu-bar menu.)

## Tech stack

| Concern | Choice |
|---|---|
| Shell | Electron + electron-vite |
| UI | React + TypeScript + Tailwind CSS v4 |
| Annotation canvas | Fabric.js v6 |
| Capture | Electron `desktopCapturer` (→ native screen APIs per OS) |

Code is split so platform-specific bits (`src/main`) stay thin and the UI/editor (`src/renderer`) is reused across OSes.

## Develop

```bash
npm install
npm run dev
```

On macOS, grant **Screen Recording** permission the first time (System Settings ▸ Privacy & Security ▸ Screen Recording), then relaunch. Press `⌘ + Shift + 2` to capture.

## Build

```bash
npm run build:mac   # or build:win / build:linux
```

## Roadmap

- [x] Screen recording (WebM) with mic, full-screen or selected-area
- [ ] MP4 / GIF export (ffmpeg), system audio (loopback), webcam overlay
- [ ] Scrolling / full-page capture
- [ ] Numbered step badges, spotlight/dim focus, drop-shadow "pretty" export
- [ ] Pluggable uploaders (S3 / Imgur / custom) → instant share links
- [ ] OCR text extraction
- [ ] Capture history / gallery
- [ ] Windows & Linux capture backends

## License

MIT © byteamv
