const { app, BrowserWindow, ipcMain, shell } = require('electron')
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 780,
    minHeight: 560,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── IPC: Config ──────────────────────────────────────────────────────────────
ipcMain.handle('config:get', () => getConfig())
ipcMain.handle('config:save', (_, cfg) => { saveConfig(cfg); return true })

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

ipcMain.handle('github:listFiles', async () => {
  const { owner, repo, folder, branch, token } = getConfig()
  if (!token || !owner || !repo) throw new Error('GitHub is not configured yet.')

  const folderPath = (folder || '').replace(/^\/|\/$/g, '')
  const prefix = folderPath ? `${folderPath}/` : ''

  const branchData = await ghRequest('GET', `/repos/${owner}/${repo}/branches/${branch}`, null, token)
  const treeSha = branchData.commit.commit.tree.sha
  const treeData = await ghRequest(
    'GET',
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    null,
    token,
  )

  return (treeData.tree || [])
    .filter(f => f.type === 'blob' && f.path.startsWith(prefix) && f.path.endsWith('.md'))
    .map(f => ({
      name: path.basename(f.path),
      path: f.path,
      sha: f.sha,
      relativePath: f.path.slice(prefix.length),
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
})

ipcMain.handle('github:getFile', async (_, filePath) => {
  const { owner, repo, branch, token } = getConfig()
  const data = await ghRequest(
    'GET',
    `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
    null,
    token,
  )
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
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
    `/repos/${owner}/${repo}/contents/${filePath}`,
    body,
    token,
  )
  return { sha: data.content.sha }
})

ipcMain.handle('github:deleteFile', async (_, { filePath, sha }) => {
  const { owner, repo, branch, token } = getConfig()
  await ghRequest(
    'DELETE',
    `/repos/${owner}/${repo}/contents/${filePath}`,
    { message: `delete ${path.basename(filePath)}`, sha, branch },
    token,
  )
  return true
})
