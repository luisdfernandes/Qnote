# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server (localhost:5173) and Electron concurrently
npm run build      # Build React app to dist/ via Vite
npm start          # Run the built Electron app
```

No linter, formatter, or test runner is configured.

## Architecture

Qnote is an Electron desktop app that uses a GitHub repository as a backend for storing markdown notes. Users configure a GitHub PAT, owner, repo, folder, and branch — all notes are read/written directly via the GitHub API.

**Two-process model (standard Electron):**

- `electron/main.js` — Main process. Handles app lifecycle, creates the BrowserWindow, manages config persistence (`userData/config.json`), and makes all GitHub API calls (list files, get/create/update/delete).
- `electron/preload.js` — Context bridge. Exposes a typed `window.electronAPI` object to the renderer using `contextBridge.exposeInMainWorld`. This is the only communication channel between the renderer and main process.
- `src/` — Renderer process (React + Vite). Calls `window.electronAPI.*` for everything that requires Node/Electron or external network access.

**Renderer component tree:**

```
App.jsx          — owns all state: notes list, active note, edit buffer, settings
├── Sidebar.jsx  — lists markdown files; triggers load/new/delete
├── Toolbar.jsx  — mode toggle (edit/view), save, refresh
├── Editor.jsx   — textarea (edit mode) or rendered HTML preview (view mode)
└── Settings.jsx — GitHub credentials and appearance preferences (theme, font)
```

**GitHub API flow:** All HTTP requests go through `electron/main.js` using the native `fetch` API. File contents are base64-encoded per GitHub API requirements. The `sha` of the current file blob is tracked in state so updates use the correct PUT payload.

**Config persistence:** Settings (owner, repo, folder, branch, token, theme, font) are stored in `{userData}/config.json` via `electron-store`-style manual JSON read/write in `electron/main.js`.

**Security model:** `nodeIntegration` is disabled, `contextIsolation` is enabled. CSP headers are set in `index.html`. All privileged operations go through IPC handlers in `electron/main.js`.

**Markdown rendering:** `marked` with GFM enabled parses markdown in `Editor.jsx`; `highlight.js` provides code block syntax highlighting. The rendered HTML is injected via `dangerouslySetInnerHTML` inside a sandboxed preview `<div>`.
