const { app, BrowserWindow, ipcMain, shell, Menu, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

// ── Config store ────────────────────────────────────────────────────────────
const configPath = path.join(app.getPath('userData'), 'config.json')

function getConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return { owner: '', repo: '', folder: 'notes', branch: 'main', token: '' }
  }
}

function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
}

// ── Window state ─────────────────────────────────────────────────────────────
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json')

function getWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveWindowState(win) {
  try {
    fs.writeFileSync(windowStatePath, JSON.stringify({
      fullscreen: win.isFullScreen(),
      maximized: win.isMaximized(),
    }))
  } catch { /* non-fatal */ }
}

// ── Local cache ──────────────────────────────────────────────────────────────
const cachePath = path.join(app.getPath('userData'), 'cache.json')

function getCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    // Migrate legacy { files, contents } → { filesByFolder, contents }
    if (raw.files && !raw.filesByFolder) {
      return { filesByFolder: { '': raw.files }, contents: raw.contents || {} }
    }
    return { filesByFolder: raw.filesByFolder || {}, contents: raw.contents || {} }
  } catch {
    return { filesByFolder: {}, contents: {} }
  }
}

function allCachedFiles(cache) {
  const out = []
  for (const arr of Object.values(cache.filesByFolder || {})) out.push(...arr)
  return out
}

function saveCache(data) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(data))
  } catch { /* non-fatal */ }
}

// ── Front matter (categories only — minimal extractor) ─────────────────────
function extractCategories(md) {
  if (!md) return []
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return []
  const line = m[1].split(/\r?\n/).find(l => /^categories\s*:/i.test(l))
  if (!line) return []
  const v = line.replace(/^categories\s*:\s*/i, '').trim()
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }
  return v ? [v] : []
}

function encodePath(p) {
  return String(p || '').split('/').map(encodeURIComponent).join('/')
}

// ── GitHub API (fetch is built-in in Node 18+ / Electron 28+) ───────────────
async function ghRequest(method, endpoint, body, token) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'QNote-App',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const msg = err.message || res.statusText
    throw new Error(`${res.status} ${msg} [${method} ${endpoint.split('?')[0]}]`)
  }

  if (res.status === 204) return null
  return res.json()
}

// ── Window ───────────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  const windowState = getWindowState()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 780,
    minHeight: 560,
    backgroundColor: '#1e1e1e',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (windowState.fullscreen) {
    mainWindow.setFullScreen(true)
  } else if (windowState.maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('close', () => saveWindowState(mainWindow))

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Apply saved zoom level
  mainWindow.webContents.once('did-finish-load', () => {
    const zoom = getConfig().zoom ?? 1
    mainWindow.webContents.setZoomFactor(zoom)
  })

  // Cut / Copy / Paste context menu
  mainWindow.webContents.on('context-menu', (_, params) => {
    const { isEditable, selectionText, editFlags } = params
    const hasSelection = selectionText.trim().length > 0
    if (!isEditable && !hasSelection) return
    const template = []
    if (isEditable) template.push({ label: 'Cut',   role: 'cut',   enabled: editFlags.canCut })
    if (isEditable || hasSelection) template.push({ label: 'Copy', role: 'copy', enabled: editFlags.canCopy })
    if (isEditable) template.push({ label: 'Paste', role: 'paste', enabled: editFlags.canPaste })
    Menu.buildFromTemplate(template).popup()
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Inject GitHub token for raw.githubusercontent.com so private repo images load
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ['https://raw.githubusercontent.com/*'] },
    (details, callback) => {
      const { token } = getConfig()
      if (token) details.requestHeaders['Authorization'] = `token ${token}`
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── IPC: Config ──────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => getConfig())
ipcMain.handle('config:save', (_, cfg) => { saveConfig(cfg); return true })
ipcMain.handle('zoom:set', (_, factor) => {
  mainWindow.webContents.setZoomFactor(factor)
})

ipcMain.handle('shell:openExternal', (_, url) => {
  if (typeof url !== 'string') return
  if (!/^https?:\/\//i.test(url)) return
  shell.openExternal(url)
})

ipcMain.handle('clipboard:readImage', () => {
  const img = clipboard.readImage()
  if (img.isEmpty()) return null
  return img.toPNG().toString('base64')
})

// ── IPC: GitHub ──────────────────────────────────────────────────────────────
ipcMain.handle('github:testConnection', async (_, cfg) => {
  const { owner, repo, branch, token } = cfg
  if (!token) throw new Error('No token provided.')
  if (!owner || !repo) throw new Error('Owner and repository are required.')

  // 1. Check repo access
  const repoData = await ghRequest('GET', `/repos/${owner}/${repo}`, null, token)

  // 2. Check branch exists
  await ghRequest('GET', `/repos/${owner}/${repo}/branches/${branch}`, null, token)

  return {
    full_name: repoData.full_name,
    private: repoData.private,
    default_branch: repoData.default_branch,
  }
})

ipcMain.handle('github:listFiles', async (_, arg) => {
  const { owner, repo, branch, token } = getConfig()
  if (!token || !owner || !repo) throw new Error('GitHub is not configured yet.')

  // Backward compat: arg may be a string folder, an object {folder, includeAll}, or undefined.
  const opts = typeof arg === 'string' ? { folder: arg } : (arg || {})
  const folder = opts.folder ?? getConfig().folder ?? ''
  const includeAll = !!opts.includeAll

  const folderPath = (folder || '').replace(/^\/|\/$/g, '')
  const prefix = folderPath ? `${folderPath}/` : ''
  const cacheKey = folderPath

  try {
    const branchData = await ghRequest('GET', `/repos/${owner}/${repo}/branches/${branch}`, null, token)
    const treeSha = branchData.commit.commit.tree.sha
    const treeData = await ghRequest(
      'GET',
      `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
      null,
      token,
    )

    const files = (treeData.tree || [])
      .filter(f => {
        if (f.type !== 'blob') return false
        if (folderPath && !f.path.startsWith(prefix)) return false
        if (includeAll) return true
        return f.path.endsWith('.md') ||
               f.path.endsWith('.excalidraw') ||
               f.path.endsWith('/.gitkeep') ||
               f.path === `${prefix}.gitkeep`
      })
      .map(f => ({
        name: path.basename(f.path),
        path: f.path,
        sha: f.sha,
        relativePath: f.path.slice(prefix.length),
      }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    const cache = getCache()
    cache.filesByFolder = cache.filesByFolder || {}
    cache.filesByFolder[cacheKey] = files
    saveCache(cache)

    return { files, fromCache: false }
  } catch (err) {
    const cache = getCache()
    const cached = cache.filesByFolder?.[cacheKey]
    if (cached?.length) return { files: cached, fromCache: true }
    throw err
  }
})

ipcMain.handle('github:loadAllMetadata', async (_, folder) => {
  const { owner, repo, branch, token } = getConfig()
  if (!token || !owner || !repo) return {}
  const cache = getCache()
  const folderKey = (folder ?? getConfig().folder ?? '').replace(/^\/|\/$/g, '')
  const folderFiles = cache.filesByFolder?.[folderKey] || []
  const mdFiles = folderFiles.filter(f => f.path.endsWith('.md'))
  cache.contents = cache.contents || {}

  const tasks = mdFiles.map(async file => {
    const cached = cache.contents[file.path]
    if (cached?.sha === file.sha) return
    try {
      const data = await ghRequest(
        'GET',
        `/repos/${owner}/${repo}/contents/${encodePath(file.path)}?ref=${branch}`,
        null,
        token,
      )
      const content = Buffer.from(data.content, 'base64').toString('utf8')
      cache.contents[file.path] = { content, sha: data.sha }
    } catch { /* skip individual failures */ }
  })

  await Promise.all(tasks)
  saveCache(cache)

  const result = {}
  for (const file of mdFiles) {
    const c = cache.contents[file.path]
    if (!c) continue
    const cats = extractCategories(c.content)
    if (cats.length) result[file.path] = cats
  }
  return result
})

ipcMain.handle('github:getBacklinks', async (_, { folder, title }) => {
  const cache = getCache()
  const folderKey = (folder || '').replace(/^\/|\/$/g, '')
  const files = cache.filesByFolder?.[folderKey] || []
  const pattern = `[[${title}]]`
  return files.filter(f =>
    f.path.endsWith('.md') &&
    cache.contents?.[f.path]?.content?.includes(pattern)
  )
})

ipcMain.handle('github:search', async (_, query, folders) => {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []

  const cache = getCache()
  const results = []
  const seen = new Set()

  // Restrict to the requested folder buckets (configured sources). If no
  // folders are provided, search everything (legacy callers).
  const buckets = Array.isArray(folders) && folders.length
    ? folders
        .map(f => (f ?? '').replace(/^\/|\/$/g, ''))
        .map(k => cache.filesByFolder?.[k] || [])
    : Object.values(cache.filesByFolder || {})

  for (const file of buckets.flat()) {
    if (seen.has(file.path)) continue
    seen.add(file.path)
    const titleMatch = file.name.toLowerCase().includes(q) ||
                       file.relativePath.toLowerCase().includes(q)
    const cached = cache.contents?.[file.path]
    const contentText = cached?.content || ''
    const contentLower = contentText.toLowerCase()
    const contentMatch = contentLower.includes(q)

    if (!titleMatch && !contentMatch) continue

    let snippet = null
    if (contentMatch) {
      const idx = contentLower.indexOf(q)
      const start = Math.max(0, idx - 60)
      const end = Math.min(contentText.length, idx + q.length + 80)
      snippet = (start > 0 ? '…' : '') +
                contentText.slice(start, end).replace(/\n+/g, ' ') +
                (end < contentText.length ? '…' : '')
    }

    results.push({ ...file, titleMatch, contentMatch, snippet })
  }

  return results
})

ipcMain.handle('github:getFile', async (_, filePath) => {
  const { owner, repo, branch, token } = getConfig()

  try {
    const data = await ghRequest(
      'GET',
      `/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${branch}`,
      null,
      token,
    )
    const result = {
      content: Buffer.from(data.content, 'base64').toString('utf8'),
      sha: data.sha,
    }

    const cache = getCache()
    cache.contents = cache.contents || {}
    cache.contents[filePath] = result
    saveCache(cache)

    return { ...result, fromCache: false }
  } catch (err) {
    const cache = getCache()
    const cached = cache.contents?.[filePath]
    if (cached) return { ...cached, fromCache: true }
    throw err
  }
})

ipcMain.handle('github:saveFile', async (_, { filePath, content, sha, message }) => {
  const { owner, repo, branch, token } = getConfig()
  const body = {
    message: message || `update ${path.basename(filePath)}`,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  }
  if (sha) body.sha = sha

  const data = await ghRequest(
    'PUT',
    `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`,
    body,
    token,
  )
  return { sha: data.content.sha }
})

ipcMain.handle('github:saveBinary', async (_, { filePath, base64Data, sha, message }) => {
  const { owner, repo, branch, token } = getConfig()
  const body = {
    message: message || `update ${path.basename(filePath)}`,
    content: base64Data,
    branch,
  }
  if (sha) body.sha = sha
  const data = await ghRequest('PUT', `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, body, token)
  return { sha: data.content.sha }
})

ipcMain.handle('github:getFileBinary', async (_, filePath) => {
  const { owner, repo, branch, token } = getConfig()
  const data = await ghRequest(
    'GET',
    `/repos/${owner}/${repo}/contents/${encodePath(filePath)}?ref=${branch}`,
    null,
    token,
  )
  return { base64: (data.content || '').replace(/\n/g, ''), sha: data.sha, size: data.size }
})

ipcMain.handle('github:uploadImage', async (_, { filePath, base64Data }) => {
  const { owner, repo, branch, token } = getConfig()
  if (!token || !owner || !repo) throw new Error('GitHub not configured')

  const body = {
    message: `add image ${path.basename(filePath)}`,
    content: base64Data,
    branch,
  }

  const data = await ghRequest('PUT', `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, body, token)
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(filePath)}`
  return { sha: data.content.sha, url: rawUrl }
})

// ── IPC: Gists ───────────────────────────────────────────────────────────────
const gistStorePath = path.join(app.getPath('userData'), 'gists.json')

function getGistStore() {
  try { return JSON.parse(fs.readFileSync(gistStorePath, 'utf8')) }
  catch { return {} }
}

function saveGistStore(data) {
  try { fs.writeFileSync(gistStorePath, JSON.stringify(data, null, 2)) }
  catch { /* non-fatal */ }
}

ipcMain.handle('gist:getForNote', (_, notePath) => {
  return getGistStore()[notePath] || null
})

ipcMain.handle('gist:create', async (_, { notePath, filename, content }) => {
  const { token } = getConfig()
  if (!token) throw new Error('No GitHub token configured.')

  const store = getGistStore()
  if (store[notePath]) return { ...store[notePath], existing: true }

  const data = await ghRequest('POST', '/gists', {
    description: filename.replace(/\.md$/, ''),
    public: false,
    files: { [filename]: { content } },
  }, token)

  const entry = { id: data.id, url: data.html_url }
  store[notePath] = entry
  saveGistStore(store)
  return { ...entry, existing: false }
})

ipcMain.handle('gist:delete', async (_, { notePath }) => {
  const { token } = getConfig()
  const store = getGistStore()
  const entry = store[notePath]
  if (!entry) return false
  await ghRequest('DELETE', `/gists/${entry.id}`, null, token)
  delete store[notePath]
  saveGistStore(store)
  return true
})

ipcMain.handle('github:deleteFile', async (_, { filePath, sha }) => {
  const { owner, repo, branch, token } = getConfig()
  await ghRequest(
    'DELETE',
    `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`,
    { message: `delete ${path.basename(filePath)}`, sha, branch },
    token,
  )
  return true
})

ipcMain.handle('github:createFolder', async (_, { folderPath }) => {
  const { owner, repo, branch, token } = getConfig()
  if (!folderPath) throw new Error('folderPath required')
  const filePath = `${folderPath.replace(/\/$/, '')}/.gitkeep`
  await ghRequest('PUT', `/repos/${owner}/${repo}/contents/${encodePath(filePath)}`, {
    message: `create folder ${folderPath}`,
    content: '',
    branch,
  }, token)
  return true
})

ipcMain.handle('github:deleteFolder', async (_, { folderPath }) => {
  const { owner, repo, branch, token } = getConfig()
  if (!folderPath) throw new Error('folderPath required')
  const prefix = folderPath.replace(/\/$/, '') + '/'

  const ref = await ghRequest('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`, null, token)
  const commitSha = ref.object.sha
  const commit = await ghRequest('GET', `/repos/${owner}/${repo}/git/commits/${commitSha}`, null, token)
  const tree = await ghRequest('GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`, null, token)

  const toDelete = (tree.tree || []).filter(t => t.type === 'blob' && t.path.startsWith(prefix))
  if (toDelete.length === 0) return true

  const newTree = await ghRequest('POST', `/repos/${owner}/${repo}/git/trees`, {
    base_tree: commit.tree.sha,
    tree: toDelete.map(t => ({ path: t.path, mode: t.mode, type: 'blob', sha: null })),
  }, token)

  const newCommit = await ghRequest('POST', `/repos/${owner}/${repo}/git/commits`, {
    message: `delete folder ${folderPath}`,
    tree: newTree.sha,
    parents: [commitSha],
  }, token)

  await ghRequest('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
  }, token)

  // Update local cache
  const cache = getCache()
  if (cache.filesByFolder) {
    for (const k of Object.keys(cache.filesByFolder)) {
      cache.filesByFolder[k] = (cache.filesByFolder[k] || []).filter(f => !f.path.startsWith(prefix))
    }
    if (cache.contents) {
      for (const k of Object.keys(cache.contents)) {
        if (k.startsWith(prefix)) delete cache.contents[k]
      }
    }
    saveCache(cache)
  }

  return true
})

ipcMain.handle('github:renameFolder', async (_, { oldPath, newPath }) => {
  const { owner, repo, branch, token } = getConfig()
  if (!oldPath || !newPath) throw new Error('paths required')
  const oldPrefix = oldPath.replace(/\/$/, '') + '/'
  const newPrefix = newPath.replace(/\/$/, '') + '/'
  if (oldPrefix === newPrefix) return false

  const ref = await ghRequest('GET', `/repos/${owner}/${repo}/git/ref/heads/${branch}`, null, token)
  const commitSha = ref.object.sha
  const commit = await ghRequest('GET', `/repos/${owner}/${repo}/git/commits/${commitSha}`, null, token)
  const tree = await ghRequest('GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`, null, token)

  const affected = (tree.tree || []).filter(t => t.type === 'blob' && t.path.startsWith(oldPrefix))
  if (affected.length === 0) return false

  const treeEntries = []
  for (const t of affected) {
    treeEntries.push({ path: t.path, mode: t.mode, type: 'blob', sha: null })
    treeEntries.push({ path: newPrefix + t.path.slice(oldPrefix.length), mode: t.mode, type: 'blob', sha: t.sha })
  }

  const newTree = await ghRequest('POST', `/repos/${owner}/${repo}/git/trees`, {
    base_tree: commit.tree.sha,
    tree: treeEntries,
  }, token)

  const newCommit = await ghRequest('POST', `/repos/${owner}/${repo}/git/commits`, {
    message: `rename folder ${oldPath} → ${newPath}`,
    tree: newTree.sha,
    parents: [commitSha],
  }, token)

  await ghRequest('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    sha: newCommit.sha,
  }, token)

  // Update local cache
  const cache = getCache()
  if (cache.filesByFolder) {
    for (const k of Object.keys(cache.filesByFolder)) {
      cache.filesByFolder[k] = (cache.filesByFolder[k] || []).map(f =>
        f.path.startsWith(oldPrefix)
          ? { ...f, path: newPrefix + f.path.slice(oldPrefix.length) }
          : f
      )
    }
    if (cache.contents) {
      const newContents = {}
      for (const [k, v] of Object.entries(cache.contents)) {
        const nk = k.startsWith(oldPrefix) ? newPrefix + k.slice(oldPrefix.length) : k
        newContents[nk] = v
      }
      cache.contents = newContents
    }
    saveCache(cache)
  }

  return true
})

ipcMain.handle('github:moveFile', async (_, { oldPath, newPath }) => {
  const { owner, repo, branch, token } = getConfig()

  // Fetch current content + sha
  const fileData = await ghRequest(
    'GET',
    `/repos/${owner}/${repo}/contents/${encodePath(oldPath)}?ref=${branch}`,
    null,
    token,
  )
  const base64Content = fileData.content.replace(/\n/g, '')
  const oldSha = fileData.sha

  // Create at new path
  const created = await ghRequest(
    'PUT',
    `/repos/${owner}/${repo}/contents/${encodePath(newPath)}`,
    {
      message: `move ${path.basename(oldPath)} → ${path.dirname(newPath) === '.' ? 'root' : path.dirname(newPath)}`,
      content: base64Content,
      branch,
    },
    token,
  )

  // Delete old path
  await ghRequest(
    'DELETE',
    `/repos/${owner}/${repo}/contents/${encodePath(oldPath)}`,
    { message: `remove ${path.basename(oldPath)} (moved)`, sha: oldSha, branch },
    token,
  )

  // Update cache — find the source folder this file belonged to and update that bucket
  const cache = getCache()
  if (cache.filesByFolder) {
    for (const folderKey of Object.keys(cache.filesByFolder)) {
      const arr = cache.filesByFolder[folderKey] || []
      const idx = arr.findIndex(f => f.path === oldPath)
      if (idx === -1) continue
      const prefix = folderKey ? `${folderKey}/` : ''
      const newRel = newPath.startsWith(prefix) ? newPath.slice(prefix.length) : newPath
      arr[idx] = {
        name: path.basename(newPath),
        path: newPath,
        sha: created.content.sha,
        relativePath: newRel,
      }
    }
    if (cache.contents?.[oldPath]) {
      cache.contents[newPath] = cache.contents[oldPath]
      delete cache.contents[oldPath]
    }
    saveCache(cache)
  }

  return { sha: created.content.sha }
})
