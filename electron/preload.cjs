const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('revue', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  inspectPath: (filePath) => ipcRenderer.invoke('inspect-path', filePath),
  scan: (folder) => ipcRenderer.invoke('scan', folder),
  onScanProgress: (callback) => {
    const listener = (_event, count) => callback(count)
    ipcRenderer.on('scan-progress', listener)
    return () => ipcRenderer.removeListener('scan-progress', listener)
  },
  loadSession: (folder) => ipcRenderer.invoke('load-session', folder),
  saveSession: (folder, votes) => ipcRenderer.invoke('save-session', folder, votes),
  onExcelStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('excel-status', listener)
    return () => ipcRenderer.removeListener('excel-status', listener)
  },
  openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  setTitle: (title) => ipcRenderer.invoke('set-title', title),
  assetUrl: (absPath) => {
    const normalized = absPath.replace(/\\/g, '/')
    const encodePath = (value) => value.split('/').filter((part) => part.length > 0).map((part) => encodeURIComponent(part)).join('/')
    if (normalized.startsWith('//')) return `local://unc/${encodePath(normalized.slice(2))}`
    const drive = normalized.match(/^([A-Za-z]):\/(.*)$/)
    if (drive) return `local://${drive[1].toLowerCase()}/${encodePath(drive[2])}`
    return `local://localhost/${encodePath(normalized)}`
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
})
