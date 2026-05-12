# Qnote — agent instructions

## Commands

```bash
npm install          # install dependencies
npm run dev          # Vite dev server + Electron (concurrently, waits for :5173)
npm run build        # Vite build only (output: dist/)
npm start            # run built Electron app (dist/ must exist)
npm run dist:win     # Vite build + electron-builder NSIS (x64)
npm run dist:mac     # Vite build + electron-builder DMG (x64 + arm64, unsigned)
```

No linter, formatter, typecheck, or test runner is configured.

## Architecture

- **Renderer → Main IPC**: all Node/GitHub access goes through `window.api.*` (exposed via `contextBridge` in `electron/preload.js`). Never import `electron` in renderer code.
- **Two source kinds**: `notes` (markdown `.md` files with YAML front matter, plus `.excalidraw` diagrams) and `files` (arbitrary binary/text files). `App.jsx` holds all top-level state and dispatches operations through `window.api.github.*`.
- **Front matter**: Notes store metadata (`created`, `modified`, `categories`) between `---` delimiters. `parseFrontMatter` / `serializeFrontMatter` in `App.jsx`.
- **Image paths**: Relative image references in markdown are rewritten to GitHub raw URLs for display, and back to relative paths on save (`toEditorMarkdown` / `toStorageMarkdown` in `App.jsx`).
- **Diacritics stripped**: `stripDiacritics` normalizes filenames (ã→a, é→e, etc.) to avoid URL/path issues.
- **Excalidraw fonts**: `scripts/copy-excalidraw-fonts.js` runs in `predev`/`prebuild`. Must set `window.EXCALIDRAW_ASSET_PATH` in `index.html` before Excalidraw loads, otherwise CSP blocks CDN font loads.
- **CSP**: Set in `index.html`. Allows `https://raw.githubusercontent.com` for images, `blob:` for workers, `data:` and `blob:` for fonts. If a feature hits a silent failure, check CSP first.
- **vite.config.js**: `base: './'` (required for `file://` protocol in production Electron).
- **Config** saved to `{userData}/config.json`. **Window state** to `{userData}/window-state.json`. **Cache** to `{userData}/cache.json`.
- **Keyboard shortcuts** in `App.jsx`: Ctrl+S (save), Ctrl+E (toggle edit/view), Ctrl+T (command palette).

## Release

Tags `v*` trigger CI to build Windows + macOS via electron-builder. macOS builds are unsigned (`CSC_IDENTITY_AUTO_DISCOVERY: false`). Artifacts published to a GitHub Release.
