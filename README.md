# QuickShot

Open-source screenshot, annotation, and (soon) screen recording — a free alternative to ShareX / CleanShot / Flameshot. Built with Electron so one codebase ships to **macOS today, Windows & Linux next**.

> Status: early MVP. Region capture → annotate → copy/save works. Recording is on the roadmap.

## Features (current)

- 🎯 **Region capture** via global hotkey (`⌘/Ctrl + Shift + 2`) — freezes the screen, drag to select.
- 🖍️ **Annotate** — arrow, rectangle, ellipse, freehand pen, text.
- 🌫️ **Blur / redact** — pixelate sensitive areas at full resolution.
- ↩️ **Undo / redo**, delete, color palette + custom color, adjustable stroke size.
- 📋 **Copy to clipboard** or **Save PNG** (full native resolution, Retina-aware).
- 🧭 Lives in the **menu bar** (no Dock clutter).

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

- [ ] Screen recording (MP4 / GIF) with mic + system audio, webcam overlay
- [ ] Scrolling / full-page capture
- [ ] Numbered step badges, spotlight/dim focus, drop-shadow "pretty" export
- [ ] Pluggable uploaders (S3 / Imgur / custom) → instant share links
- [ ] OCR text extraction
- [ ] Capture history / gallery
- [ ] Windows & Linux capture backends

## License

MIT © byteamv
