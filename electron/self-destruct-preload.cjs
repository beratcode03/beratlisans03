const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selfDestructAPI', {
  cancelDestruct: () => ipcRenderer.send('cancel-self-destruct'),
  confirmDestruct: () => ipcRenderer.send('self-destruct-confirmed'),
});
