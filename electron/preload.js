const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (cfg) => ipcRenderer.invoke('config:save', cfg),
  },
  zoom: {
    set: (factor) => ipcRenderer.invoke('zoom:set', factor),
  },
  clipboard: {
    readImage: () => ipcRenderer.invoke('clipboard:readImage'),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  github: {
    testConnection: (cfg) => ipcRenderer.invoke('github:testConnection', cfg),
    listFiles: (opts) => ipcRenderer.invoke('github:listFiles', opts),
    loadAllMetadata: (folder) => ipcRenderer.invoke('github:loadAllMetadata', folder),
    search: (query) => ipcRenderer.invoke('github:search', query),
    getFile: (filePath) => ipcRenderer.invoke('github:getFile', filePath),
    getFileBinary: (filePath) => ipcRenderer.invoke('github:getFileBinary', filePath),
    saveFile: (data) => ipcRenderer.invoke('github:saveFile', data),
    saveBinary: (data) => ipcRenderer.invoke('github:saveBinary', data),
    uploadImage: (data) => ipcRenderer.invoke('github:uploadImage', data),
    deleteFile: (data) => ipcRenderer.invoke('github:deleteFile', data),
    moveFile:   (data) => ipcRenderer.invoke('github:moveFile', data),
    createFolder: (data) => ipcRenderer.invoke('github:createFolder', data),
    deleteFolder: (data) => ipcRenderer.invoke('github:deleteFolder', data),
    renameFolder: (data) => ipcRenderer.invoke('github:renameFolder', data),
  },
})
