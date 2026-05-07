const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (cfg) => ipcRenderer.invoke('config:save', cfg),
  },
  github: {
    testConnection: (cfg) => ipcRenderer.invoke('github:testConnection', cfg),
    listFiles: () => ipcRenderer.invoke('github:listFiles'),
    getFile: (filePath) => ipcRenderer.invoke('github:getFile', filePath),
    saveFile: (data) => ipcRenderer.invoke('github:saveFile', data),
    deleteFile: (data) => ipcRenderer.invoke('github:deleteFile', data),
  },
})
