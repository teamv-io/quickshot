# QuickShot by TeamV

Open-source screenshot, annotation, and screen recording — a free alternative to ShareX / CleanShot / Flameshot. Built with Electron so one codebase ships to **macOS, Windows, and Linux**.

> Status: active development. Screenshots, annotation, recording, and a Snagit-style library all work.

## Install

Grab the latest **macOS `.dmg`** or **Windows installer** from the [Releases](https://github.com/teamv-io/quickshot/releases) page. Builds are produced automatically by CI on each tagged release.

> Builds are currently **unsigned**, so on first launch macOS may warn — right-click the app → Open. (Code signing / notarization is on the roadmap.)

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

## Quality

```bash
npm run typecheck   # strict TypeScript
npm test            # vitest unit tests (pure logic in src/shared)
npm run lint        # eslint
npm run format      # prettier
```

## Build & release

```bash
npm run build:mac   # or build:win / build:linux  → installers in release/
```

Releases are automated: **push a `v*` tag** and GitHub Actions builds the macOS `.dmg` and Windows installer and attaches them to a GitHub Release.

```bash
npm version patch   # bumps version + creates a tag
git push --follow-tags
```

## Roadmap

- [x] Screenshots (full / region) + annotation (arrow, shapes, text, pen, blur, crop)
- [x] Screen recording (WebM) with mic, full-screen or selected-area
- [x] Snagit-style library (SQLite) with filmstrip, search, rename, drag-out
- [x] Floating launcher bar + settings (opacity, position, custom shortcuts)
- [x] MP4 / GIF export (ffmpeg) + video trim
- [x] "Pretty" export (padding / background / shadow), numbered step badges, highlighter
- [ ] System audio (loopback), webcam overlay, show-clicks
- [ ] Pluggable uploaders (S3 / Imgur / custom) → instant share links
- [ ] Code signing + notarization, auto-update

## License

MIT © TeamV
