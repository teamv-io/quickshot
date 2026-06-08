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

Maintainers cut releases by pushing a `v*` tag; GitHub Actions builds and publishes
the macOS and Windows installers.
