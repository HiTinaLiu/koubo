const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('koubo', {
  desktop: true,
  restartApi: () => ipcRenderer.invoke('koubo:restart-api'),
});
