# QNote

A minimal, keyboard-friendly markdown note editor that uses a **GitHub repository as its backend** — no servers, no databases, no subscriptions. Your notes live in your repo, in plain `.md` files, forever.

---

## Features

### GitHub as storage
Connect any GitHub repository (public or private) and point QNote at a folder. Every note is a real `.md` file committed directly to your repo via the GitHub API. Full history, diffs, and portability come for free.

### Tree view sidebar
Notes are displayed in a collapsible folder tree that mirrors your repo structure. Create subfolders in GitHub and QNote reflects them automatically.

### Markdown editor & preview
Write in a clean textarea and switch to a rendered preview with syntax-highlighted code blocks. A **Copy** button appears on every code block on hover.

### Offline support
QNote caches your file list and note contents locally. If you lose your connection, you can still read and browse every note you've opened before. A yellow banner lets you know when you're working from cache.

### Search
Press `Ctrl+F` to open the search panel. QNote searches both **note titles** and **cached content** in real time, with highlighted snippets showing exactly where your query matched. Selecting a result opens the note, expands its parent folders, and scrolls it into view in the tree.

### Resizable & collapsible sidebar
Drag the sidebar edge to resize it — the width is remembered between sessions. Collapse it entirely with the `‹` button; a tab on the left edge brings it back.

### Themes & fonts
Four built-in themes (Dark, Darker, Dimmed, Light) and five font choices for the editor. Preferences are saved per-device.

### Remembers window state
QNote restores its fullscreen or maximized state when reopened.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current note |
| `Ctrl+F` | Open search |
| `Ctrl+N` | New note |
| `Escape` | Close search / cancel input |

---

## Getting started

### 1. Create a GitHub Personal Access Token

Go to **GitHub → Settings → Developer settings → Personal access tokens** and generate a token with the `repo` scope (or `public_repo` for public repos only).

### 2. Set up a notes folder

Create a folder in any GitHub repo where your notes will live — for example `notes/` in a repo called `my-notes`.

### 3. Configure QNote

On first launch, QNote opens the settings panel. Fill in:

| Field | Example |
|---|---|
| Owner | `your-github-username` |
| Repository | `my-notes` |
| Folder | `notes` |
| Branch | `main` |
| Token | `ghp_...` |

Click **Test connection** to verify, then **Save**.

---

## Running locally

```bash
npm install       # install dependencies
npm run dev       # start Vite dev server + Electron
```

To build a production app:

```bash
npm run build     # compile React to dist/
npm start         # run the built Electron app
```

---

## Data & privacy

- Notes are stored exclusively in your GitHub repository.
- The GitHub token is stored locally in Electron's `userData` directory and never transmitted anywhere other than `api.github.com`.
- A local cache (`cache.json`) is written to `userData` for offline access. It contains only the content of notes you have opened.

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Electron |
| UI | React 18 + Vite |
| Markdown | marked + highlight.js |
| Storage | GitHub Contents & Git Trees API |
| Styling | Plain CSS with theme tokens |
