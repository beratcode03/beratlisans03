// WINDOWS BAŞLANGIÇ UYGULAMASI SİSTEMİ
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export class WindowsStartup {
  private appName = 'BeratCankirYKS';
  private exePath: string;

  constructor() {
    this.exePath = app.getPath('exe');
  }

  /**
   * Windows baslangicina uygulama ekle/cikar
   */
  setStartup(enable: boolean): boolean {
    try {
      if (enable) {
        // Başlangıca ekle
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: false, // Başlangıçta tray'e gitmesi için false
          path: this.exePath,
          args: [],
        });
        console.log('✅ Uygulama Windows başlangıcına eklendi');
        return true;
      } else {
        // Başlangıçtan çıkar
        app.setLoginItemSettings({
          openAtLogin: false,
        });
        console.log('✅ Uygulama Windows başlangıcından çıkarıldı');
        return true;
      }
    } catch (error) {
      console.error('❌ Başlangıç ayarı yapılamadı:', error);
      return false;
    }
  }

  /**
   * Uygulama baslangicta mi kontrol et
   */
  isStartupEnabled(): boolean {
    try {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    } catch (error) {
      console.error('❌ Başlangıç durumu okunamadı:', error);
      return false;
    }
  }

  /**
   * Lisans aktif olduktan sonra otomatik başlangıcı etkinleştir
   */
  enableAfterLicenseActivation(): boolean {
    console.log('🚀 Lisans aktif - Windows başlangıcı etkinleştiriliyor...');
    return this.setStartup(true);
  }
}

export const windowsStartup = new WindowsStartup();
