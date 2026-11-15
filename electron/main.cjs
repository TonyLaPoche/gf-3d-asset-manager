const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron')
const fs = require('fs/promises')
const path = require('path')
const { isInside, scanFolder, readSession, persistReview } = require('./library.cjs')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

let mainWindow = null
let allowedRootReal = null
let cachedFolder = null
let cachedAssets = []
let pendingSave = null
let saveRunning = false

function stateFile() {
  return path.join(app.getPath('userData'), 'state.json')
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(stateFile(), 'utf8'))
  } catch {
    return {}
  }
}

async function rememberFolder(folder) {
  const previous = await readState()
  await fs.mkdir(path.dirname(stateFile()), { recursive: true })
  await fs.writeFile(stateFile(), JSON.stringify({ ...previous, lastFolder: folder }))
}

function argFolder() {
  const prefix = '--dossier='
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : null
}

function filePathFromRequest(requestUrl) {
  const url = new URL(requestUrl)
  let pathname = url.pathname
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // Le chemin contient déjà des caractères décodés.
  }
  if (url.hostname === 'unc') return `//${pathname.replace(/^\/+/, '')}`
  if (/^[a-z]$/.test(url.hostname)) return `${url.hostname}:${pathname}`
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(pathname)) return pathname.slice(1)
  return pathname
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#141414',
    autoHideMenuBar: true,
    title: 'Revue 3D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.on('console-message', (event, level, message) => {
    const text = typeof message === 'string' ? message : event?.message
    const severity = typeof level === 'number' ? level : event?.level
    if ((severity === 3 || severity === 'error') && text) console.error(`[fenêtre] ${text}`)
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

if (gotLock) {
  app.whenReady().then(() => {
    protocol.handle('local', async (request) => {
      if (!allowedRootReal) return new Response('Aucun dossier ouvert.', { status: 403 })
      let filePath
      try {
        filePath = filePathFromRequest(request.url)
      } catch {
        return new Response('Adresse invalide.', { status: 400 })
      }
      let real
      try {
        real = await fs.realpath(filePath)
      } catch {
        return new Response('Fichier introuvable.', { status: 404 })
      }
    if (!isInside(allowedRootReal, real)) {
      return new Response('Accès refusé.', { status: 403 })
    }
    const data = await fs.readFile(real)
    return new Response(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/octet-stream',
      },
    })
  })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.handle('bootstrap', async () => {
  const state = await readState()
  return {
    lastFolder: state.lastFolder || null,
    argFolder: argFolder(),
  }
})

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le dossier d’assets',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
})

ipcMain.handle('inspect-path', async (_event, filePath) => {
  const stat = await fs.stat(filePath)
  return {
    isDir: stat.isDirectory(),
    parent: path.dirname(filePath),
    base: path.basename(filePath),
  }
})

ipcMain.handle('scan', async (event, folder) => {
  allowedRootReal = await fs.realpath(folder)
  const result = await scanFolder(folder, (count) => {
    event.sender.send('scan-progress', count)
  })
  cachedFolder = folder
  cachedAssets = result.assets
  await rememberFolder(folder)
  return result
})

ipcMain.handle('load-session', async (_event, folder) => readSession(folder))

function pumpSaves(sender) {
  if (saveRunning) return
  saveRunning = true
  const step = async () => {
    try {
      while (pendingSave) {
        const job = pendingSave
        pendingSave = null
        try {
          let assets = job.assets
          if (!assets) {
            const scanned = await scanFolder(job.folder)
            cachedFolder = job.folder
            cachedAssets = scanned.assets
            allowedRootReal = await fs.realpath(job.folder)
            assets = scanned.assets
          }
          const saved = await persistReview(job.folder, assets, job.votes)
          if (!sender.isDestroyed()) sender.send('excel-status', { ...saved, ok: true })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Enregistrement impossible.'
          if (!sender.isDestroyed()) {
            sender.send('excel-status', {
              ok: false,
              warning: `${message} Les votes déjà écrits restent dans session.json.`,
            })
          }
        }
      }
    } finally {
      saveRunning = false
      if (pendingSave) pumpSaves(sender)
    }
  }
  void step()
}

ipcMain.handle('save-session', (event, folder, votes) => {
  pendingSave = {
    folder,
    votes,
    assets: cachedFolder === folder ? cachedAssets : null,
  }
  pumpSaves(event.sender)
  return { accepted: true }
})

ipcMain.handle('open-path', async (_event, filePath) => {
  const error = await shell.openPath(filePath)
  return error || null
})

ipcMain.handle('show-in-folder', async (_event, filePath) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('set-title', async (_event, title) => {
  if (mainWindow && typeof title === 'string') mainWindow.setTitle(title.slice(0, 180))
})
