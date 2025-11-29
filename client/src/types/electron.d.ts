/**
 * BERAT CANKIR - YKS ANALİZ TAKİP SİSTEMİ
 * @author Berat Cankır
 * @copyright © 2025 Berat Cankır. Tüm hakları saklıdır.
 */

interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  toggleFullscreen: () => void;
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => void;
  isElectron: boolean;
}

interface ElectronBridge {
  verifyLicense: (licenseKey: string) => Promise<any>;
  closeLicenseModal: () => void;
  minimizeLicenseWindow: () => void;
  closeLicenseWindow: () => void;
  selfDestruct: (reason: string) => void;
  saveUserFullname: (fullname: string) => Promise<void>;
  closeNameModal: () => void;
  onAdminPanelShortcut: (callback: () => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  electron?: ElectronBridge;
}

// CANKIR