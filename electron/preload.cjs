// BERAT CANKIR
// BERAT BİLAL CANKIR
// CANKIR




const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  goBack: () => ipcRenderer.send('window-go-back'),
  goForward: () => ipcRenderer.send('window-go-forward'),
  reload: () => ipcRenderer.send('window-reload'),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  onFullscreenChange: (callback) => {
    ipcRenderer.on('fullscreen-changed', (event, isFullscreen) => callback(isFullscreen));
  },
  getLicenseData: () => ipcRenderer.invoke('get-license-data'),
  selfDestruct: (reason) => ipcRenderer.send('self-destruct', reason),
  send: (channel, data) => {
    const validChannels = ['open-external-link', 'close-app', 'self-destruct'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  isElectron: true
});

contextBridge.exposeInMainWorld('electron', {
  verifyLicense: (licenseKey) => ipcRenderer.invoke('verify-license', licenseKey),
  closeLicenseModal: () => ipcRenderer.send('close-license-modal'),
  minimizeLicenseWindow: () => ipcRenderer.send('minimize-license-window'),
  closeLicenseWindow: () => ipcRenderer.send('close-license-window'),
  selfDestruct: (reason) => ipcRenderer.send('self-destruct', reason),
  saveUserFullname: (fullname) => ipcRenderer.invoke('save-user-fullname', fullname),
  closeNameModal: () => ipcRenderer.send('close-name-modal'),
  // Admin panel kısayol listener
  onAdminPanelShortcut: (callback) => {
    ipcRenderer.on('open-admin-panel', () => callback());
  }
});


// BERAT CANKIR
// BERAT BİLAL CANKIR
// CANKIR
