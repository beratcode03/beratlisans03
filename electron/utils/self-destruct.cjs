/**
 * BERAT CANKIR - Self Destruct Mekanizması (Electron CommonJS)
 * Uygulama 13 Aralık 2025 saat 23:59 Türkiye saatinde kendini tamamen silecek
 * %appdata% klasörlerini de temizler (Local, LocalPrograms, Roaming)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 🔥 SELF DESTRUCT TARİHİ: 13 Aralık 2025, 23:59:00 (Türkiye Saati - UTC+3) - CUMARTESİ
// UTC karşılığı: 13 Aralık 2025, 20:59:00 UTC
const SELF_DESTRUCT_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');

// SABIT SON TARIH - DEGISTIRILEMEZ!
// HARDCODED_DEADLINE: Kullanici set-destruct-date ile bunu degistiremez!
const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');

/**
 * Tarih kontrolü yapar (UTC bazlı)
 * @returns true ise uygulama silinmeli
 */
function shouldSelfDestruct() {
  const nowUTC = new Date();
  return nowUTC >= SELF_DESTRUCT_DATE_UTC;
}

/**
 * Self destruct'a kalan zamanı hesaplar
 * @returns Kalan gün sayısı
 */
function getDaysRemaining() {
  const nowUTC = new Date();
  const diffTime = SELF_DESTRUCT_DATE_UTC.getTime() - nowUTC.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Kullanıcıya uyarı mesajı gösterir (sessiz mod)
 */
function showWarningIfNeeded() {
  // Kullanıcıya log gösterme
}

/**
 * Dosya silme işlemini retry ile yapar (kilitli dosyalar için)
 */
function deleteFileWithRetry(filePath, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        // Dosya kilitli, kısa bekleme
        const waitMs = 100 * (attempt + 1);
        const start = Date.now();
        while (Date.now() - start < waitMs) {
          // Senkron bekleme
        }
      } else {
        return false; // Başka hata, deneme
      }
    }
  }
  return false;
}

/**
 * Bir klasörü ve içindekileri tamamen siler (güvenli)
 * Retry mekanizması ile kilitli dosyaları da silmeye çalışır
 */
function deleteFolderRecursive(folderPath) {
  try {
    if (fs.existsSync(folderPath)) {
      fs.readdirSync(folderPath).forEach((file) => {
        const curPath = path.join(folderPath, file);
        try {
          if (fs.lstatSync(curPath).isDirectory()) {
            deleteFolderRecursive(curPath);
          } else {
            // Retry mekanizması ile sil
            deleteFileWithRetry(curPath);
          }
        } catch (err) {
          // Dosya kullanımda olabilir, atla
        }
      });
      
      // Klasörü silmeyi dene (retry ile)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.rmdirSync(folderPath);
          break;
        } catch (err) {
          if (attempt < 2) {
            const waitMs = 100 * (attempt + 1);
            const start = Date.now();
            while (Date.now() - start < waitMs) {}
          }
        }
      }
    }
  } catch (error) {
    // Sessizce hataları yut
  }
}

/**
 * Windows Registry kayıtlarını temizler
 * HKCU (kullanıcı) ve HKLM (makine) kayıtları
 * Uninstall, startup, scheduled tasks temizliği
 * 
 * NOT: HKLM kayıtları için admin yetkisi gerekir
 * Kullanıcı bazlı kurulumda (perMachine: false) HKCU yeterlidir
 * Makine bazlı kurulumda admin yetkisi olmadan HKLM temizlenemez
 */
function cleanupRegistry() {
  try {
    const { execSync } = require('child_process');
    
    // Yetki kontrolü - admin değilse sadece HKCU temizlenir
    let isAdmin = false;
    try {
      execSync('net session 2>nul', { windowsHide: true, stdio: 'ignore' });
      isAdmin = true;
    } catch (e) {
      isAdmin = false;
    }
    
    // Registry silme komutları (sessiz mod) - HKCU + HKLM
    const registryPaths = [
      // ✅ HKCU - Kullanıcı bazlı uninstall kayıtları
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AFYONLUMMM',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\afyonlummm',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{AFYONLUMMM}',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{afyonlummm}',
      
      // ✅ HKLM - Makine bazlı uninstall kayıtları (perMachine kurulum)
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AFYONLUMMM',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\afyonlummm',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{AFYONLUMMM}',
      'HKLM\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AFYONLUMMM',
      
      // ✅ Uygulama kayıtları
      'HKCU\\Software\\AFYONLUMMM',
      'HKCU\\Software\\afyonlummm',
      'HKLM\\Software\\AFYONLUMMM',
      'HKLM\\Software\\afyonlummm',
      
      // ✅ Electron auto-updater kayıtları
      'HKCU\\Software\\afyonlummm-updater',
      'HKCU\\Software\\AFYONLUMMM-updater',
      
      // ✅ Run (başlangıç) kayıtları
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\AFYONLUMMM',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\afyonlummm',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\AFYONLUMMM',
    ];
    
    for (const regPath of registryPaths) {
      try {
        // /f = force, 2>nul = hataları yut
        execSync(`reg delete "${regPath}" /f 2>nul`, { 
          windowsHide: true,
          stdio: 'ignore',
          timeout: 5000
        });
      } catch (e) {
        // Kayıt bulunamazsa veya yetki yoksa sessizce devam et
      }
    }
    
    // ✅ Scheduled Task temizliği (varsa)
    try {
      execSync('schtasks /delete /tn "AFYONLUMMM*" /f 2>nul', {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000
      });
    } catch (e) {
      // Task bulunamazsa sessizce devam et
    }
  } catch (error) {
    // Sessizce hataları yut
  }
}

/**
 * Windows %appdata% klasorlerini temizler
 * Local, LocalPrograms, Roaming
 */
function cleanupAppData() {
  try {
    const { app } = require('electron');
    const appName = app.getName() || 'AFYONLUMMM';
    const homeDir = os.homedir();
    
    // %appdata% yolları - TÜM VARYASYONLAR
    const appDataPaths = [
      // ✅ Roaming (%APPDATA%) - Kullanıcı verileri
      path.join(homeDir, 'AppData', 'Roaming', 'afyonlummm'),        // Electron userData
      path.join(homeDir, 'AppData', 'Roaming', 'AFYONLUMMM'),
      path.join(homeDir, 'AppData', 'Roaming', appName),
      path.join(homeDir, 'AppData', 'Roaming', 'afyonlum'),
      path.join(homeDir, 'AppData', 'Roaming', 'AFYONLUM'),
      path.join(homeDir, 'AppData', 'Roaming', 'afyonlum-yks'),
      path.join(homeDir, 'AppData', 'Roaming', 'AFYONLUM YKS Analiz'),
      
      // ✅ Local (%LOCALAPPDATA%) - Cache ve updater
      path.join(homeDir, 'AppData', 'Local', 'afyonlummm-updater'),  // Updater cache
      path.join(homeDir, 'AppData', 'Local', 'AFYONLUMMM-updater'),
      path.join(homeDir, 'AppData', 'Local', 'afyonlummm'),
      path.join(homeDir, 'AppData', 'Local', 'AFYONLUMMM'),
      path.join(homeDir, 'AppData', 'Local', appName),
      path.join(homeDir, 'AppData', 'Local', 'afyonlum'),
      path.join(homeDir, 'AppData', 'Local', 'AFYONLUM'),
      path.join(homeDir, 'AppData', 'Local', 'afyonlum-yks'),
      path.join(homeDir, 'AppData', 'Local', 'AFYONLUM YKS Analiz'),
      path.join(homeDir, 'AppData', 'Local', 'afyonlum-updater'),
      
      // ✅ Local/Programs (%LOCALAPPDATA%/Programs) - Ana kurulum
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'AFYONLUMMM'),  // Ana kurulum klasörü
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'afyonlummm'),
      path.join(homeDir, 'AppData', 'Local', 'Programs', appName),
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'afyonlum'),
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'AFYONLUM'),
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'afyonlum-yks'),
      path.join(homeDir, 'AppData', 'Local', 'Programs', 'AFYONLUM YKS Analiz'),
      
      // Electron Cache ve Temp
      path.join(homeDir, 'AppData', 'Local', 'Temp', 'afyonlummm'),
      path.join(homeDir, 'AppData', 'Local', 'Temp', 'AFYONLUMMM'),
      path.join(homeDir, 'AppData', 'Local', 'Temp', appName),
      path.join(homeDir, 'AppData', 'Local', 'Temp', 'afyonlum'),
    ];

    // Electron userData yolunu da ekle
    try {
      const userDataPath = app.getPath('userData');
      if (userDataPath && !appDataPaths.includes(userDataPath)) {
        appDataPaths.push(userDataPath);
      }
    } catch (e) {
      // Sessizce atla
    }

    // Tüm klasörleri sil
    for (const appDataPath of appDataPaths) {
      if (fs.existsSync(appDataPath)) {
        deleteFolderRecursive(appDataPath);
      }
    }
  } catch (error) {
    // Sessizce hataları yut
  }
}

/**
 * Tüm uygulama verilerini ve dosyalarını siler
 * Windows: %appdata% Local, LocalPrograms, Roaming temizliği dahil
 * Registry kayıtları da temizlenir
 */
function executeSelfDestruct() {
  try {
    const { app } = require('electron');
    // ✅ DÜZELTME: dialog.showMessageBoxSync kaldırıldı
    // Veda modalı artık main.cjs'deki executeSelfDestruct fonksiyonu tarafından gösteriliyor
    // Bu dosyadaki fonksiyon sadece temizlik işlemlerini yapıyor
    
    // ✅ Windows Registry kayıtlarını temizle
    cleanupRegistry();
    
    // %appdata% klasorlerini temizle (Windows-only)
    cleanupAppData();
    
    // Electron userData klasörünü sil
    try {
      const userDataPath = app.getPath('userData');
      if (fs.existsSync(userDataPath)) {
        deleteFolderRecursive(userDataPath);
      }
    } catch (e) {
      // Sessizce atla
    }

    // ✅ DÜZELTME: Paketlenmiş uygulamada userData kullan (process.cwd() ASAR içine işaret eder!)
    const userDataPath = app.getPath('userData');
    
    // userData içindeki tüm klasörleri sil
    const dataPath = path.join(userDataPath, 'data');
    if (fs.existsSync(dataPath)) {
      deleteFolderRecursive(dataPath);
    }

    const logsPath = path.join(userDataPath, 'logs');
    if (fs.existsSync(logsPath)) {
      deleteFolderRecursive(logsPath);
    }

    const screenshotsPath = path.join(userDataPath, 'screenshots');
    if (fs.existsSync(screenshotsPath)) {
      deleteFolderRecursive(screenshotsPath);
    }

    const monitoringPath = path.join(userDataPath, 'monitoring');
    if (fs.existsSync(monitoringPath)) {
      deleteFolderRecursive(monitoringPath);
    }

    const cachePath = path.join(userDataPath, '.cache');
    if (fs.existsSync(cachePath)) {
      deleteFolderRecursive(cachePath);
    }

    const keysPath = path.join(userDataPath, 'keys');
    if (fs.existsSync(keysPath)) {
      deleteFolderRecursive(keysPath);
    }
    
    const configPath = path.join(userDataPath, 'config');
    if (fs.existsSync(configPath)) {
      deleteFolderRecursive(configPath);
    }

    // Uygulamayı kapat
    setTimeout(() => {
      app.quit();
      process.exit(0);
    }, 1000);

  } catch (error) {
    // Sessizce hataları yut
    try {
      const { app } = require('electron');
      setTimeout(() => {
        app.quit();
        process.exit(1);
      }, 1000);
    } catch (e) {
      process.exit(1);
    }
  }
}

let selfDestructInterval = null;

/**
 * Uygulama başlangıcında çağrılır
 * Tarih kontrolü yapar ve gerekirse self destruct başlatır
 * Ayrıca her dakika kontrol eden zamanlayıcı başlatır
 */
function checkAndExecuteSelfDestruct() {
  showWarningIfNeeded();
  
  // İlk kontrol
  if (shouldSelfDestruct()) {
    executeSelfDestruct();
    return;
  }

  // Her dakika kontrol et (60000ms = 60 saniye) - sessizce
  if (!selfDestructInterval) {
    selfDestructInterval = setInterval(() => {
      // Tarih geçti mi kontrol et (Türkiye saati)
      if (shouldSelfDestruct()) {
        if (selfDestructInterval) {
          clearInterval(selfDestructInterval);
          selfDestructInterval = null;
        }
        executeSelfDestruct();
      }
    }, 60000); // Her 60 saniyede bir kontrol et
    
    // Kullanıcıya log gösterme
  }
}

module.exports = {
  shouldSelfDestruct,
  getDaysRemaining,
  showWarningIfNeeded,
  executeSelfDestruct,
  checkAndExecuteSelfDestruct,
  cleanupAppData,
  cleanupRegistry,
  deleteFolderRecursive
};
