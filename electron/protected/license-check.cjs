const { BrowserWindow, ipcMain, app, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ✅ Dinamik silent-logger yolu (protected klasöründen de çalışır)
let logger = { log: () => {}, warn: () => {}, error: () => {} }; // Fallback
try {
  const sameDirPath = path.join(__dirname, 'silent-logger.cjs');
  const parentDirPath = path.join(__dirname, '..', 'silent-logger.cjs');
  
  if (fs.existsSync(sameDirPath)) {
    logger = require(sameDirPath);
  } else if (fs.existsSync(parentDirPath)) {
    logger = require(parentDirPath);
  }
} catch (error) {
  // SilentLogger yüklenemezse fallback kullan
}

let licenseModalWindow = null;
let licenseExpiredModalWindow = null;
let nameInputModalWindow = null;
let isLicenseVerified = false;
let licenseCheckInterval = null;
let mainWindowRef = null;
let userNameSaved = false;
let handlersRegistered = false;

const LICENSE_FILE = path.join(app.getPath('userData'), 'license.dat');

// ✅ Şifreleme yardımcı fonksiyonları (license.dat için)
function _getLicenseEncryptionKey() {
  const crypto = require('crypto');
  const os = require('os');
  // Makine-özel anahtar oluştur
  const machineId = crypto
    .createHash('sha256')
    .update(os.hostname() + os.platform() + os.arch() + (os.cpus()[0]?.model || ''))
    .digest('hex');
  return Buffer.from(machineId.slice(0, 32), 'utf8');
}

function _encryptLicenseData(plaintext) {
  try {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = _getLicenseEncryptionKey();
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Format: iv(12) + authTag(16) + encrypted
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch (error) {
    logger.error('Lisans şifreleme hatası:', error);
    return null;
  }
}

function _decryptLicenseData(ciphertext) {
  try {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = _getLicenseEncryptionKey();
    
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    logger.error('Lisans şifre çözme hatası:', error);
    return null;
  }
}

// Uygulama başlangıcında isim durumunu kontrol et
// ✅ AFYONLUM FIX: İsim her zaman "Afyonlum" olarak set edilir, name modal bypass edilir
function initializeUserNameStatus() {
  try {
    const configPath = path.join(__dirname, 'config-manager.cjs');
    if (fs.existsSync(configPath)) {
      const { getConfigManager } = require(configPath);
      const configManager = getConfigManager();
      
      // ✅ AFYONLUM FIX: Her zaman "Afyonlum" olarak set et
      configManager.set('USER_FULLNAME', 'Afyonlum');
      userNameSaved = true;
      logger.log('✅ Kullanıcı ismi otomatik set edildi: Afyonlum');
    } else {
      userNameSaved = true; // Name modal bypass
    }
  } catch (error) {
    logger.warn('⚠️  ConfigManager kontrol hatası:', error.message);
    userNameSaved = true; // ✅ Hata olsa bile name modal bypass
  }
}

// ✅ AFYONLUM FIX: Her zaman true döndür - name modal bypass
function checkUserNameExists() {
  try {
    const configPath = path.join(__dirname, 'config-manager.cjs');
    if (fs.existsSync(configPath)) {
      const { getConfigManager } = require(configPath);
      const configManager = getConfigManager();
      
      // ✅ AFYONLUM FIX: Her zaman "Afyonlum" olarak set et ve true döndür
      const currentName = configManager.get('USER_FULLNAME');
      if (!currentName || currentName.trim() === '') {
        configManager.set('USER_FULLNAME', 'Afyonlum');
      }
      return true; // Her zaman true döndür
    }
  } catch (error) {
    logger.warn('⚠️  İsim kontrol hatası:', error.message);
  }
  return true; // ✅ Hata olsa bile true döndür - name modal bypass
}

function getLicenseData() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      const fileContent = fs.readFileSync(LICENSE_FILE, 'utf8');
      
      // Önce şifreli veri olarak çözmeyi dene
      const decrypted = _decryptLicenseData(fileContent);
      if (decrypted) {
        return JSON.parse(decrypted);
      }
      
      // Eski şifresiz format - migrate et
      try {
        const data = JSON.parse(fileContent);
        logger.log('⚠️  Şifresiz lisans dosyası bulundu, şifreleniyor...');
        // Migrate: Şifreli olarak yeniden kaydet
        const encryptedData = _encryptLicenseData(JSON.stringify(data));
        if (encryptedData) {
          fs.writeFileSync(LICENSE_FILE, encryptedData, 'utf8');
          logger.log('✅ Lisans dosyası şifrelendi');
        }
        return data;
      } catch (e) {
        logger.error('Lisans dosyası parse hatası:', e);
        return null;
      }
    }
  } catch (error) {
    logger.error('Lisans dosyası okunamadı:', error);
  }
  return null;
}

function saveLicenseData(licenseKey, licenseInfo) {
  try {
    // ✅ Donanım parmak izini kaydet (tek kullanım koruması)
    const hardwareFingerprint = licenseInfo.hardwareFingerprint || _generateHardwareFingerprint();
    
    const data = {
      key: licenseKey,
      info: licenseInfo,
      hardwareFingerprint: hardwareFingerprint, // ✅ DONANIM BAĞLAMA
      activatedAt: new Date().toISOString(),
      expiresAt: licenseInfo.expiresAt || null
    };
    
    // ✅ ŞİFRELİ KAYDET
    const jsonData = JSON.stringify(data);
    const encryptedData = _encryptLicenseData(jsonData);
    
    if (encryptedData) {
      fs.writeFileSync(LICENSE_FILE, encryptedData, 'utf8');
    } else {
      // Şifreleme başarısız olursa yine de kaydet (fallback)
      fs.writeFileSync(LICENSE_FILE, jsonData, 'utf8');
    }
    logger.log('Lisans bilgisi kaydedildi');
    logger.log('Donanim parmak izi kaydedildi (tek kullanim)');
    
    if (licenseInfo.expiresAt) {
      const expiryDate = new Date(licenseInfo.expiresAt);
      logger.log('Lisans bitiş tarihi:', expiryDate.toLocaleString('tr-TR'));
    } else {
      logger.log('Lisans bitiş tarihi: Sınırsız');
    }
    
    logger.log('Lisans sahibi:', licenseInfo.customerName, '- Kullanıcı kendi ismini girecek');
  } catch (error) {
    logger.error('Lisans kaydedilemedi:', error);
  }
}

// ✅ TEK KULLANIMLIK LİSANS SİSTEMİ - Donanım Bağlamalı
const VALID_LICENSE_KEY = 'B3SN-QRB6-0BC3-306B';

// 🔥 LİSANS BİTİŞ TARİHİ: 13 Aralık 2025, 23:59:00 (Türkiye Saati - UTC+3) - CUMARTESİ
// UTC karşılığı: 13 Aralık 2025, 20:59:00 UTC
const LICENSE_EXPIRY_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');

// ✅ DEV MODE KONTROLU - Development modunda lisans kontrolu bypass edilir
const IS_DEV_MODE = !app.isPackaged || process.env.ELECTRON_DEV === 'true' || process.env.NODE_ENV === 'development';

// [ok] SUNUCU URL - Tek kullanim kontrolu icin
var SERVER_URL = process.env.SERVER_URL || 'http:\x2F\x2Flocalhost:5000';
// ✅ DONANIM PARMAK İZİ - .exe kopyalamayı önler
function _generateHardwareFingerprint() {
  const crypto = require('crypto');
  const os = require('os');
  
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'unknown';
  const cpuCores = cpus.length;
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const totalMem = os.totalmem();
  
  // Benzersiz donanım ID oluştur (değiştirilemez özellikler)
  const fingerprintData = [
    hostname,
    platform,
    arch,
    cpuModel,
    cpuCores.toString(),
    Math.floor(totalMem / (1024 * 1024 * 1024)).toString() // GB cinsinden RAM
  ].join('|');
  
  return crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex');
}

// ✅ SUNUCU TEK KULLANIM KONTROLU - Lisans farkli PC'de kullanilmis mi?
// KRITIK: Sunucuya ulasilamazsa lisans REDDEDILIR (bypass onlendi)
async function _checkSingleUseWithServer(licenseKey, hardwareFingerprint, machineName) {
  return new Promise((resolve) => {
    // Dev modunda bypass
    if (IS_DEV_MODE) {
      logger.log('DEV MODE: Tek kullanim sunucu kontrolu bypass edildi');
      resolve({ allowed: true, reason: 'dev_mode_bypass' });
      return;
    }
    
    const postData = JSON.stringify({
      licenseKey: licenseKey,
      hardwareFingerprint: hardwareFingerprint,
      machineName: machineName || require('os').hostname()
    });
    
    // SERVER_URL'i parse et (http://host:port formatinda)
    let serverHost = 'localhost';
    let serverPort = 5000;
    try {
      const url = new URL(SERVER_URL);
      serverHost = url.hostname;
      serverPort = parseInt(url.port) || 5000;
    } catch (e) {
      logger.warn('SERVER_URL parse hatasi, varsayilan kullaniliyor');
    }
    
    const options = {
      hostname: serverHost,
      port: serverPort,
      path: '/api/licenses/single-use-check',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000 // 15 saniye timeout
    };
    
    logger.log('Tek kullanim kontrolu sunucuya gonderiliyor:', serverHost + ':' + serverPort);
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.allowed) {
            logger.log('Tek kullanim kontrolu BASARILI:', response.reason);
            resolve({ allowed: true, reason: response.reason });
          } else {
            logger.warn('TEK KULLANIM REDDEDILDI:', response.reason);
            resolve({ 
              allowed: false, 
              reason: response.reason,
              originalMachine: response.originalMachine,
              activatedAt: response.activatedAt
            });
          }
        } catch (error) {
          // KRITIK: Sunucu yaniti islenemedi - REDDET (bypass onlendi)
          logger.error('Sunucu yaniti islenemedi - lisans REDDEDILDI');
          resolve({ 
            allowed: false, 
            reason: 'Sunucu yaniti islenemedi. Lutfen internet baglantinizi kontrol edin ve tekrar deneyin.',
            serverError: true
          });
        }
      });
    });
    
    req.on('error', (error) => {
      // KRITIK: Sunucuya ulasilamadi - REDDET (bypass onlendi)
      logger.error('Tek kullanim sunucu baglantisi BASARISIZ:', error.code || error.message);
      resolve({ 
        allowed: false, 
        reason: 'Lisans sunucusuna ulasilamiyor. Internet baglantinizi kontrol edin. Hata: ' + (error.code || error.message),
        serverError: true
      });
    });
    
    req.on('timeout', () => {
      // KRITIK: Sunucu timeout - REDDET (bypass onlendi)
      logger.error('Tek kullanim sunucu TIMEOUT');
      req.destroy();
      resolve({ 
        allowed: false, 
        reason: 'Lisans sunucusu yanit vermiyor (timeout). Lutfen daha sonra tekrar deneyin.',
        serverError: true
      });
    });
    
    req.write(postData);
    req.end();
  });
}

// ✅ Lisans dosyasındaki donanım parmak izini kontrol et
function _verifyHardwareBinding() {
  try {
    const currentFingerprint = _generateHardwareFingerprint();
    const savedData = getLicenseData(); // ✅ Doğru fonksiyon adı
    
    if (!savedData) {
      return { valid: false, reason: 'no_license' };
    }
    
    if (!savedData.hardwareFingerprint) {
      // Eski format lisans - yeniden aktivasyon gerekli
      return { valid: false, reason: 'legacy_format' };
    }
    
    if (savedData.hardwareFingerprint !== currentFingerprint) {
      logger.warn('Donanim parmak izi uyusmuyor - Lisans bu bilgisayarda gecersiz');
      return { valid: false, reason: 'hardware_mismatch' };
    }
    
    return { valid: true, reason: 'ok' };
  } catch (error) {
    logger.error('Donanim dogrulama hatasi:', error);
    return { valid: false, reason: 'error' };
  }
}

async function verifyLicenseWithServer(licenseKey) {
  // Basit şifre kontrolü
  if (licenseKey.trim().toUpperCase() !== VALID_LICENSE_KEY) {
    return {
      success: false,
      message: 'Gecersiz lisans anahtari'
    };
  }
  
  // ✅ Donanım parmak izini oluştur
  const hardwareFingerprint = _generateHardwareFingerprint();
  const machineName = require('os').hostname();
  
  // ✅ DEV MODE BYPASS
  if (IS_DEV_MODE) {
    logger.log('DEV MODE: Lisans kontrolu bypass edildi');
    return {
      success: true,
      message: 'DEV MODE - Lisans bypass edildi',
      licenseInfo: {
        customerName: 'Afyonlum (DEV)',
        licenseType: 'dev_mode',
        hardwareFingerprint: hardwareFingerprint,
        expiresAt: null
      }
    };
  }
  
  // ✅ TEK KULLANIM SUNUCU KONTROLU - Farkli PC'de kullanilmis mi?
  logger.log('Tek kullanim sunucu kontrolu basliyor...');
  const singleUseCheck = await _checkSingleUseWithServer(licenseKey, hardwareFingerprint, machineName);
  
  if (!singleUseCheck.allowed) {
    // ✅ SUNUCU HATASI MI YOKSA TEK KULLANIM REDDI MI?
    if (singleUseCheck.serverError) {
      // Sunucu baglanti hatasi - kullanici tekrar deneyebilir
      logger.warn('SUNUCU BAGLANTI HATASI - Kullanici tekrar deneyebilir');
      return {
        success: false,
        message: singleUseCheck.reason,
        serverError: true  // ✅ KRITIK: singleUseRejected DEGIL, serverError
      };
    }
    
    // Gercek tek kullanim reddi - baska PC'de kullanilmis
    logger.warn('LISANS REDDEDILDI - Bu lisans baska bir bilgisayarda kullanilmis!');
    logger.warn('Orijinal PC:', singleUseCheck.originalMachine);
    logger.warn('Aktivasyon tarihi:', singleUseCheck.activatedAt);
    
    return {
      success: false,
      message: singleUseCheck.reason,
      singleUseRejected: true,  // ✅ Sadece gercek tek kullanim reddi icin
      originalMachine: singleUseCheck.originalMachine,
      activatedAt: singleUseCheck.activatedAt
    };
  }
  
  logger.log('Tek kullanim kontrolu basarili:', singleUseCheck.reason);
  
  // 🔥 LİSANS SÜRESİ KONTROLÜ - 13 Aralık 2025 23:59 Türkiye saati - CUMARTESİ
  const nowUTC = new Date();
  if (nowUTC >= LICENSE_EXPIRY_DATE_UTC) {
    return {
      success: false,
      message: 'Lisans süresi doldu (13 Aralık 2025 23:59)',
      licenseExpired: true
    };
  }
  
  return {
    success: true,
    message: 'Lisans basariyla dogrulandi ve bu bilgisayara baglandi',
    licenseInfo: {
      customerName: 'Afyonlum',
      licenseType: 'hardware_locked',
      hardwareFingerprint: hardwareFingerprint,
      expiresAt: LICENSE_EXPIRY_DATE_UTC.toISOString() // 13 Aralık 2025 23:59 TR - CUMARTESİ
    }
  };
}

// Eski server-based doğrulama kodunu yorum satırı yapıyoruz
/*
async function verifyLicenseWithServer_OLD(licenseKey) {
  return new Promise((resolve) => {
    const os = require('os');
    const crypto = require('crypto');
    
    const hardwareId = crypto
      .createHash('sha256')
      .update(os.hostname() + os.platform() + os.arch())
      .digest('hex');

    const postData = JSON.stringify({
      licenseKey,
      hardwareInfo: {
        hardwareId,
        machineName: os.hostname(),
        operatingSystem: os.type() + ' ' + os.release(),
        cpuInfo: os.cpus()[0]?.model || 'Unknown',
        totalRam: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + 'GB'
      }
    });

    const serverPort = process.env.PORT || 5000;
    
    const options = {
      hostname: 'localhost',
      port: parseInt(serverPort),
      path: '/api/licenses/activate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      // ✅ TIMEOUT EKLE: 10 saniye timeout (server başlamazsa beklemez)
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            // License bilgisini kaydet (customerName dahil)
            const licenseData = {
              ...response.license,
              customerName: response.license?.customerName || 'Kullanıcı'
            };
            saveLicenseData(licenseKey, licenseData);
            resolve({ success: true, license: licenseData });
          } else {
            resolve({ success: false, message: response.message || 'Lisans doğrulanamadı' });
          }
        } catch (error) {
          resolve({ success: false, message: 'Sunucu yanıtı işlenemedi' });
        }
      });
    });

    // ✅ HATA YÖNETİMİ: Tüm hataları sessizce yakala (crash önlemi)
    req.on('error', (error) => {
      logger.warn('⚠️  Lisans doğrulama bağlantı hatası:', error.code || error.message);
      // ECONNREFUSED hatası normal - server henüz başlamamış olabilir
      if (error.code === 'ECONNREFUSED') {
        resolve({ success: false, message: 'Server henüz hazır değil, lütfen bekleyin...' });
      } else {
        resolve({ success: false, message: 'Sunucuya bağlanılamadı' });
      }
    });
    
    req.on('timeout', () => {
      logger.warn('⚠️  Lisans doğrulama timeout');
      req.destroy();
      resolve({ success: false, message: 'Bağlantı zaman aşımına uğradı' });
    });

    req.write(postData);
    req.end();
  });
}

*/

function createLicenseModal() {
  if (licenseModalWindow) {
    licenseModalWindow.focus();
    return;
  }

  licenseModalWindow = new BrowserWindow({
    width: 600,
    height: 700,
    frame: false,
    resizable: false,
    modal: true,
    alwaysOnTop: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: false  // DevTools'u tamamen engelle
    }
  });

  licenseModalWindow.loadFile(path.join(__dirname, 'license-modal.html'));

  licenseModalWindow.on('closed', () => {
    licenseModalWindow = null;
    // Eğer lisans doğrulanmadıysa, pencereyi tekrar aç (quit yerine)
    if (!isLicenseVerified) {
      setTimeout(() => {
        createLicenseModal();
      }, 500);
    }
  });

  return licenseModalWindow;
}

function checkLicenseStatus() {
  // ✅ DEV MODE BYPASS - Development modunda lisans kontrolu bypass edilir
  if (IS_DEV_MODE) {
    logger.log('DEV MODE: Lisans kontrolu bypass edildi - otomatik gecerli');
    isLicenseVerified = true;
    return true;
  }
  
  // 🔥 LİSANS SÜRESİ KONTROLÜ - 30 Kasım 2025 23:59 Türkiye saati
  const nowUTC = new Date();
  if (nowUTC >= LICENSE_EXPIRY_DATE_UTC) {
    logger.warn('LİSANS SÜRESİ DOLDU! Uygulama sonlandırılıyor...');
    isLicenseVerified = false;
    return 'expired'; // Özel değer: lisans süresi dolmuş
  }
  
  const licenseData = getLicenseData();
  
  if (licenseData && licenseData.key) {
    // ✅ DONANIM KONTROLU - .exe kopyalamayı önler
    const hwCheck = _verifyHardwareBinding();
    
    if (!hwCheck.valid) {
      if (hwCheck.reason === 'hardware_mismatch') {
        logger.warn('Lisans farkli bir bilgisayara ait - yeniden aktivasyon gerekli');
        // Eski lisans dosyasını sil (farklı PC)
        try {
          fs.unlinkSync(LICENSE_FILE);
          logger.log('Eski lisans dosyasi silindi');
        } catch (e) {
          // Dosya silinemezse de devam et
        }
        return false;
      }
      if (hwCheck.reason === 'legacy_format') {
        logger.log('Eski lisans formati - yeniden aktivasyon gerekli');
        return false;
      }
    }
    
    logger.log('Kayitli lisans dogrulandi (donanim eslesme OK)');
    isLicenseVerified = true;
    return true;
  }
  
  logger.log('Lisans bulunamadi - aktivasyon gerekli');
  return false;
}

function setupLicenseHandlers() {
  // Handler'lar zaten kayıtlıysa tekrar kaydetme
  if (handlersRegistered) {
    logger.log('⚠️  IPC handlers zaten kayıtlı, tekrar kaydetme atlandı');
    return;
  }

  // Mevcut handler'ları temizle (varsa)
  try {
    ipcMain.removeHandler('verify-license');
    ipcMain.removeHandler('save-user-fullname');
  } catch (error) {
    // Handler yoksa hata verir, görmezden gel
  }

  ipcMain.handle('verify-license', async (event, licenseKey) => {
    if (!licenseKey || licenseKey.trim() === '') {
      return { success: false, message: 'Gecersiz lisans anahtari' };
    }

    const result = await verifyLicenseWithServer(licenseKey);
    
    if (result.success) {
      isLicenseVerified = true;
      saveLicenseData(licenseKey, result.licenseInfo);
      
      // ✅ OTOMATIK İSİM KAYDI: "Afyonlum" ismini otomatik kaydet, name modalı açma
      try {
        const configPath = path.join(__dirname, 'config-manager.cjs');
        if (fs.existsSync(configPath)) {
          const { getConfigManager } = require(configPath);
          const configManager = getConfigManager();
          configManager.set('USER_FULLNAME', 'Afyonlum');
          userNameSaved = true; // ✅ Name modal'ı bypass etmek için true yap
          logger.log('Otomatik isim kaydedildi: Afyonlum - Name modal bypass edildi');
        }
      } catch (error) {
        logger.error('Otomatik isim kaydetme hatasi:', error);
        userNameSaved = true; // ✅ Hata olsa bile name modal'ı açma
      }
      
      return { success: true, license: result.licenseInfo, skipNameModal: true };
    } else {
      // ✅ TEK KULLANIM REDDEDILDI - Ozel hata mesaji
      if (result.singleUseRejected) {
        logger.warn('TEK KULLANIM REDDEDILDI - Modal\'a ozel mesaj gonderiliyor');
        return { 
          success: false, 
          message: result.message,
          singleUseRejected: true,
          originalMachine: result.originalMachine,
          activatedAt: result.activatedAt
        };
      }
      // ✅ SUNUCU HATASI - Kullaniciya bildir ama uygulamayi kapatma
      if (result.serverError) {
        logger.warn('SUNUCU HATASI - Kullaniciya bildir');
        return { 
          success: false, 
          message: result.message,
          serverError: true
        };
      }
      return { success: false, message: result.message };
    }
  });

  ipcMain.on('close-license-modal', () => {
    if (licenseModalWindow) {
      licenseModalWindow.close();
    }
  });

  ipcMain.on('minimize-license-window', () => {
    if (licenseModalWindow) {
      licenseModalWindow.minimize();
    }
  });

  ipcMain.on('close-license-window', () => {
    if (licenseModalWindow) {
      // Kullanıcı kapatma butonuna tıklarsa modal'ı kapat, tekrar açılacak
      licenseModalWindow.close();
    }
  });

  // ✅ DÜZELTME: self-destruct handler main.cjs'de tanımlı, burada tekrar tanımlamayalım
  // dialog.showErrorBox yerine main.cjs'deki güzel veda modalı kullanılacak
  // Not: IPC handler main.cjs'de zaten var, burada tanımlamak çakışmaya neden olur

  ipcMain.handle('save-user-fullname', async (event, fullname) => {
    try {
      const configPath = path.join(__dirname, 'config-manager.cjs');
      if (fs.existsSync(configPath)) {
        const { getConfigManager } = require(configPath);
        const configManager = getConfigManager();
        configManager.set('USER_FULLNAME', fullname);
        
        // ✅ DÜZELTME: Server process'e de bildir (HTTP çağrısı ile)
        process.env.USER_FULLNAME = fullname;
        
        // Server'a HTTP POST request gönder ki server process'teki env'i güncellesin
        try {
          const postData = JSON.stringify({ fullname });
          const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/user/info',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };

          await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                if (res.statusCode === 200) {
                  logger.log('✅ Server process\'e kullanıcı bilgisi gönderildi');
                  resolve(true);
                } else {
                  logger.warn('⚠️  Server process güncellemesi yanıt hatası:', res.statusCode);
                  resolve(false);
                }
              });
            });
            req.on('error', (error) => {
              logger.warn('⚠️  Server process iletişim hatası:', error.message);
              resolve(false); // Hata olsa bile devam et
            });
            req.setTimeout(2000, () => {
              req.destroy();
              resolve(false);
            });
            req.write(postData);
            req.end();
          });
        } catch (httpError) {
          logger.warn('⚠️  HTTP güncelleme hatası (görmezden gelindi):', httpError);
        }
        
        logger.log('✅ Kullanıcı ismi kaydedildi:', fullname);
        logger.log('✅ process.env.USER_FULLNAME güncellendi');
        userNameSaved = true;
        return { success: true };
      } else {
        throw new Error('ConfigManager bulunamadı');
      }
    } catch (error) {
      logger.error('❌ İsim kaydetme hatası:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.on('close-name-modal', () => {
    if (nameInputModalWindow) {
      nameInputModalWindow.close();
    }
  });

  // Handler'ların kaydedildiğini işaretle
  handlersRegistered = true;
  logger.log('✅ IPC handlers kaydedildi');
}

function createNameInputModal() {
  if (nameInputModalWindow) {
    nameInputModalWindow.focus();
    return;
  }

  nameInputModalWindow = new BrowserWindow({
    width: 550,
    height: 600,
    frame: false,
    resizable: false,
    modal: true,
    alwaysOnTop: true,
    backgroundColor: '#667eea',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: false
    }
  });

  nameInputModalWindow.loadFile(path.join(__dirname, 'name-input-modal.html'));

  nameInputModalWindow.on('closed', () => {
    nameInputModalWindow = null;
    // İsim kaydedildiyse devam et, kaydedilmediyse modal'ı tekrar aç
    if (!userNameSaved) {
      setTimeout(() => {
        createNameInputModal();
      }, 500);
    }
  });

  return nameInputModalWindow;
}

function createLicenseExpiredModal() {
  if (licenseExpiredModalWindow) {
    licenseExpiredModalWindow.focus();
    return;
  }

  licenseExpiredModalWindow = new BrowserWindow({
    width: 600,
    height: 750,
    frame: false,
    resizable: false,
    modal: true,
    alwaysOnTop: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: false
    }
  });

  licenseExpiredModalWindow.loadFile(path.join(__dirname, 'license-expired-modal.html'));

  licenseExpiredModalWindow.on('closed', () => {
    licenseExpiredModalWindow = null;
    
    // CRITICAL: Modal kapatıldığında uygulamayı tamamen kapat
    // Kullanıcının lisans olmadan devam etmesine izin verme
    logger.log('💀 Lisans expired modal kapatıldı - Uygulamayı kapatıyoruz');
    app.isQuiting = true;
    app.quit();
  });

  // Ana pencereyi gizle
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.hide();
  }

  return licenseExpiredModalWindow;
}

async function validateLicenseWithServer() {
  return new Promise((resolve) => {
    const licenseData = getLicenseData();
    
    if (!licenseData || !licenseData.key) {
      // Missing license - fatal error, not network error
      resolve({ success: false, reason: 'Lisans bilgisi bulunamadı', isNetworkError: false });
      return;
    }

    const os = require('os');
    const crypto = require('crypto');
    
    const hardwareId = crypto
      .createHash('sha256')
      .update(os.hostname() + os.platform() + os.arch())
      .digest('hex');

    const postData = JSON.stringify({
      licenseKey: licenseData.key,
      hardwareId
    });

    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/licenses/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          // Ensure response has isNetworkError flag if success is false
          if (!response.success && response.isNetworkError === undefined) {
            response.isNetworkError = false; // Default to fatal error
          }
          resolve(response);
        } catch (error) {
          // JSON parse error - fatal error, not network error (could be tampering)
          logger.error('Sunucu yanıtı parse hatası:', error);
          resolve({ success: false, reason: 'Sunucu yanıtı işlenemedi', isNetworkError: false });
        }
      });
    });

    // CRITICAL: Set explicit timeout to prevent indefinite hangs
    // Stalled endpoints (breakpoint, firewall, etc.) would otherwise bypass license check
    req.setTimeout(5000, () => {
      // Timeout - could be intentional stall (bypass attempt), treat as fatal
      logger.error('Lisans doğrulama zaman aşımı - endpoint stalled');
      req.destroy();
      resolve({ success: false, reason: 'Lisans doğrulama zaman aşımı (endpoint stalled)', isNetworkError: false });
    });

    req.on('error', (error) => {
      // Network connection error - genuine network issue (only genuine connection failures)
      logger.error('Lisans doğrulama hatası:', error);
      resolve({ success: false, reason: 'Sunucuya bağlanılamadı', isNetworkError: true });
    });

    req.write(postData);
    req.end();
  });
}

function startPeriodicLicenseCheck(mainWindow) {
  // Duplicate timer guard - eğer zaten başlatılmışsa tekrar başlatma
  if (licenseCheckInterval) {
    logger.log('⚠️  Periyodik lisans kontrolü zaten çalışıyor, yeni timer oluşturulmadı');
    return;
  }

  // Ana pencere referansını kaydet
  mainWindowRef = mainWindow;
  
  // ✅ DÜZELTME: İlk kontrol 1 dakika sonra yapılsın (kısa süreli lisanslar için)
  // 3 dakikalık test lisansı gibi kısa lisansları yakalamak için daha sık kontrol et
  setTimeout(async () => {
    await performLicenseCheck();
  }, 60 * 1000); // 1 dakika sonra ilk kontrol

  // Her 1 dakikada bir kontrol (kısa lisansları yakalamak için gerekli)
  // ✅ DÜZELTME: 30 saniyede bir kontrol et (3 dakikalık lisans için daha uygun)
  licenseCheckInterval = setInterval(async () => {
    await performLicenseCheck();
  }, 30 * 1000); // 30 saniye

  logger.log('✅ Periyodik lisans kontrolü başlatıldı (ilk kontrol 30 saniye sonra, sonra her 30 saniyede bir)');
}

async function performLicenseCheck() {
  try {
    // ✅ DÜZELTME: Önce local cache'ten lisans bilgilerini kontrol et
    const licenseData = getLicenseData();
    
    if (!licenseData || !licenseData.expiresAt) {
      logger.log('ℹ️  Lisans süresiz veya bulunamadı, kontrol atlanıyor');
      return;
    }
    
    // Local saat kontrolü (server'a gitmeden önce)
    const now = new Date();
    const expiryDate = new Date(licenseData.expiresAt);
    
    // 60 saniyelik grace period (saat senkronizasyonu için)
    const gracePeriodMs = 60 * 1000;
    const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
    
    if (now > expiryWithGrace) {
      logger.log('⏰ Lisans süresi local saate göre doldu');
      createLicenseExpiredModal();
      if (licenseCheckInterval) {
        clearInterval(licenseCheckInterval);
        licenseCheckInterval = null;
      }
      setTimeout(() => {
        logger.log('💀 Lisans süresi dolması nedeniyle uygulama kapatılıyor...');
        if (app && app.quit) {
          app.quit();
        }
      }, 30000);
      return;
    }
    
    // ✅ DÜZELTME: Server'a kontrol et ama network hatalarını tolere et
    const result = await validateLicenseWithServer();
    
    // Network hatası veya timeout - tolere et, local cache'i kullan
    if (!result || result.isNetworkError) {
      logger.log('⚠️  Network hatası, local cache ile devam ediliyor');
      return;
    }
    
    // Server pozitif olarak "invalid" dedi - lisansı bitir
    if (!result.success) {
      logger.error('❌ Server lisansı geçersiz olarak işaretledi:', result.reason);
      createLicenseExpiredModal();
      if (licenseCheckInterval) {
        clearInterval(licenseCheckInterval);
        licenseCheckInterval = null;
      }
      setTimeout(() => {
        logger.log('💀 Geçersiz lisans nedeniyle uygulama kapatılıyor...');
        if (app && app.quit) {
          app.quit();
        }
      }, 30000);
      return;
    }
    
    // CRITICAL: success validation - başarılı lisans dışındaki her durum fatal
    if (result.success !== true) {
      // Sadece explicit network hatalarını sessizce ignore et
      if (result.isNetworkError === true) {
        // Geçici network hatası - sessiz log, kullanıcıyı rahatsız etme
        logger.log('Lisans kontrolü yapılamadı (network hatası - geçici sorun olabilir)');
        return;
      }
      
      // Default behavior: isNetworkError yoksa veya false ise → fatal error, modal göster
      // Tüm diğer hatalar için (süresi dolmuş, iptal, hardware mismatch, invalid license, missing license, parse error, malformed response) modal göster
      logger.log('❌ LİSANS SORUNU TESPİT EDİLDİ - Modal gösteriliyor');
      logger.log('Sebep:', result.reason || 'Bilinmeyen hata');
      
      // ✅ Self-destruct backend'de zaten tetiklenmiş olacak (license-routes.ts)
      // Modal sadece kullanıcıya bilgi vermek için gösteriliyor
      if (result.selfDestructed) {
        logger.log('💀 Backend self-destruct tetiklendi - Veriler imha edildi');
      }
      
      createLicenseExpiredModal();
      
      // Periyodik kontrolü durdur
      if (licenseCheckInterval) {
        clearInterval(licenseCheckInterval);
        licenseCheckInterval = null;
      }
      
      // ✅ DÜZELTME: Uygulamayı 30 saniye sonra ZORLA kapat (modal kapatılsa bile)
      setTimeout(() => {
        logger.log('💀 Lisans sorunu nedeniyle uygulama ZORLA kapatılıyor...');
        app.isQuiting = true;
        
        if (app && app.quit) {
          app.quit();
        }
        
        // Eğer quit çalışmazsa, process.exit ile ZORLA kapat
        setTimeout(() => {
          logger.log('💀 app.quit() çalışmadı - process.exit() ile ZORLA kapatılıyor...');
          process.exit(0);
        }, 2000);
      }, 30000); // 30 saniye kullanıcıya modal görme zamanı ver
    }
    // success === true durumunda sessizce devam et (lisans geçerli)
  } catch (error) {
    // Beklenmeyen hata - kritik hata olarak ele al, modal göster ve kapat
    logger.error('❌ Lisans kontrolü kritik hatası:', error);
    
    createLicenseExpiredModal();
    
    if (licenseCheckInterval) {
      clearInterval(licenseCheckInterval);
      licenseCheckInterval = null;
    }
    
    setTimeout(() => {
      logger.log('💀 Lisans kontrolü kritik hatası nedeniyle uygulama kapatılıyor...');
      if (app && app.quit) {
        app.quit();
      }
    }, 30000);
  }
}

function stopPeriodicLicenseCheck() {
  if (licenseCheckInterval) {
    clearInterval(licenseCheckInterval);
    licenseCheckInterval = null;
    logger.log('⏹️  Periyodik lisans kontrolü durduruldu');
  }
}

module.exports = {
  initializeUserNameStatus,
  checkUserNameExists,
  checkLicenseStatus,
  createLicenseModal,
  createNameInputModal,
  createLicenseExpiredModal,
  setupLicenseHandlers,
  startPeriodicLicenseCheck,
  stopPeriodicLicenseCheck,
  isLicenseVerified: () => isLicenseVerified,
  isUserNameSaved: () => userNameSaved,
  getLicenseData
};
