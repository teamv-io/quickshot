# Contributing to QuickShot by TeamV

Thanks for your interest in improving QuickShot!

## Getting started

```bash
npm install
npm run dev
```

## Before opening a PR

Please make sure the checks pass locally (CI runs the same):

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run format` applies Prettier formatting.

## Project layout

- `src/main` — Electron main process (windows, tray, capture, IPC, library, settings)
- `src/preload` — context-isolated bridge exposing a typed `window.api`
- `src/renderer` — React UI (overlay, recorder bar, Studio, floating bar, settings)
- `src/shared` — pure, dependency-free logic with unit tests (`*.test.ts`)

Put non-trivial pure logic in `src/shared` so it can be unit-tested without Electron.

## Releases

Maintainers cut releases by pushing a `v*` tag (e.g. `npm version minor && git push --follow-tags`).
GitHub Actions then builds and publishes installers for **macOS (Apple Silicon / arm64) and Windows**.

### Code signing & notarization (optional)

Builds are unsigned by default and still work. To produce signed + notarized macOS
builds (and signed Windows installers), add these repository **secrets** — CI picks
them up automatically:

| Secret | Purpose |
|---|---|
| `CSC_LINK` | base64 of your `.p12` certificate (mac/win) |
| `CSC_KEY_PASSWORD` | password for the `.p12` |
| `APPLE_ID` | Apple ID email (notarization) |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

When `CSC_LINK` is absent, signing/notarization is skipped cleanly.
