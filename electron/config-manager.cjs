// BERAT CANKIR
// BERAT BİLAL CANKIR  
// CANKIR

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ✅ Dinamik silent-logger yolu (protected klasöründen de çalışır)
let SilentLogger = null;
try {
  const sameDirPath = path.join(__dirname, 'silent-logger.cjs');
  const parentDirPath = path.join(__dirname, '..', 'silent-logger.cjs');
  
  if (fs.existsSync(sameDirPath)) {
    SilentLogger = require(sameDirPath);
  } else if (fs.existsSync(parentDirPath)) {
    SilentLogger = require(parentDirPath);
  }
} catch (error) {
  // SilentLogger yüklenemezse, logging yapma
}

/**
 * Electron Config Manager
 * .env dosyası yerine kullanıcı verilerinde şifreli config yönetimi
 * Windows için güvenli, packaged app uyumlu, otomatik güncellenen sistem
 */
class ConfigManager {
  constructor() {
    // Config dosyasının yolu - kullanıcı verilerinde saklanır
    this.configDir = path.join(app.getPath('userData'), 'config');
    this.configPath = path.join(this.configDir, 'app-config.encrypted.json');
    
    // Şifreleme anahtarı - makineye özgü
    this.encryptionKey = this.getOrCreateEncryptionKey();
    
    // Config cache
    this.config = null;
    
    // Config dizinini oluştur
    this.ensureConfigDir();
    
    // Config'i yükle
    this.loadConfig();
  }

  /**
   * Config dizinini oluştur
   */
  ensureConfigDir() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      if (SilentLogger) {
        SilentLogger.log('✅ Config dizini oluşturuldu:', this.configDir);
      }
    }
  }

  /**
   * Makineye özgü şifreleme anahtarı oluştur veya yükle
   */
  getOrCreateEncryptionKey() {
    const keyPath = path.join(app.getPath('userData'), '.encryption-key');
    
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8');
    }
    
    // Yeni anahtar oluştur (makine bilgilerine dayalı)
    const os = require('os');
    const machineId = crypto
      .createHash('sha256')
      .update(os.hostname() + os.platform() + os.arch() + os.cpus()[0].model)
      .digest('hex');
    
    fs.writeFileSync(keyPath, machineId, 'utf8');
    if (SilentLogger) {
      SilentLogger.log('✅ Şifreleme anahtarı oluşturuldu');
    }
    
    return machineId;
  }

  /**
   * Veriyi şifrele
   */
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(this.encryptionKey.slice(0, 32), 'utf8');
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Veriyi çöz
   */
  decrypt(encryptedText) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(this.encryptionKey.slice(0, 32), 'utf8');
      
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Şifre çözme hatası:', error);
      }
      return null;
    }
  }

  /**
   * Config dosyasını yükle
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const encryptedData = fs.readFileSync(this.configPath, 'utf8');
        const decryptedData = this.decrypt(encryptedData);
        
        if (decryptedData) {
          this.config = JSON.parse(decryptedData);
          if (SilentLogger) {
            SilentLogger.log('✅ Config yüklendi:', Object.keys(this.config).length, 'anahtar bulundu');
          }
        } else {
          if (SilentLogger) {
            SilentLogger.warn('⚠️  Config şifresi çözülemedi, yeni config oluşturuluyor');
          }
          this.config = this.getDefaultConfig();
          this.saveConfig();
        }
      } else {
        if (SilentLogger) {
          SilentLogger.log('📁 Config dosyası bulunamadı, varsayılan config oluşturuluyor');
        }
        this.config = this.getDefaultConfig();
        this.saveConfig();
      }
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Config yükleme hatası:', error);
      }
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Başlangıç config değerlerini config-initial-values.json'dan yükle
   * Bu dosya build sırasında ASAR içine dahil edilir
   */
  /**
   * Şifrelenmiş config içeriğini çöz
   */
  decryptConfigContent(encryptedText) {
    try {
      const ENCRYPTION_KEY = Buffer.from('QWZ5b25sdW1ZS1NBbmFsaXpTaXN0ZW1pMjAyNQ==', 'base64').toString('utf8').padEnd(32, '0').slice(0, 32);
      const ALGORITHM = 'aes-256-cbc';
      
      const parts = encryptedText.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      return null;
    }
  }

  loadInitialValues() {
    try {
      const isPackaged = app.isPackaged;
      const resourcesPath = process.resourcesPath || '';
      const appPath = app.getAppPath();
      const exePath = app.getPath('exe');
      const exeDir = path.dirname(exePath);
      
      // Development modda debug logları göster
      const logDebug = !isPackaged;
      
      // ✅ ŞİFRELENMİŞ DOSYA YOLLARI (.enc uzantılı)
      // ⚠️ KRİTİK DÜZELTME: ASAR içindeki __dirname'i unpacked yoluna çevir
      const unpackedDirname = __dirname.replace('app.asar', 'app.asar.unpacked');
      const unpackedAppPath = appPath.replace('app.asar', 'app.asar.unpacked');
      
      // ✅ DÜZELTME: Daha kapsamlı yol listesi - tüm olası konumları kontrol et
      const encryptedPaths = isPackaged ? [
        // ✅ ÖNCELİK 1: __dirname'in unpacked versiyonu (EN ÖNEMLİ)
        path.join(unpackedDirname, 'config-initial-values.enc'),
        path.join(unpackedDirname, '..', 'config-initial-values.enc'),
        // ✅ ÖNCELİK 2: appPath'in unpacked versiyonu
        path.join(unpackedAppPath, 'electron', 'config-initial-values.enc'),
        path.join(unpackedAppPath, 'electron', 'protected', 'config-initial-values.enc'),
        // ÖNCELİK 3: resourcesPath bazlı yollar
        path.join(resourcesPath, 'app.asar.unpacked', 'electron', 'config-initial-values.enc'),
        path.join(resourcesPath, 'app.asar.unpacked', 'electron', 'protected', 'config-initial-values.enc'),
        // ÖNCELİK 4: ASAR içi (ASAR okunabilir dosya sistemi olarak çalışır)
        path.join(resourcesPath, 'app.asar', 'electron', 'config-initial-values.enc'),
        path.join(resourcesPath, 'app.asar', 'electron', 'protected', 'config-initial-values.enc'),
        path.join(__dirname, 'config-initial-values.enc'),
        path.join(__dirname, 'protected', 'config-initial-values.enc'),
        path.join(__dirname, '..', 'config-initial-values.enc'),
        path.join(appPath, 'electron', 'config-initial-values.enc'),
        path.join(appPath, 'electron', 'protected', 'config-initial-values.enc'),
        // ÖNCELİK 5: exe dizini bazlı yollar
        path.join(exeDir, 'resources', 'app.asar.unpacked', 'electron', 'config-initial-values.enc'),
        path.join(exeDir, 'resources', 'app.asar.unpacked', 'electron', 'protected', 'config-initial-values.enc'),
        path.join(exeDir, 'resources', 'app.asar', 'electron', 'config-initial-values.enc'),
        path.join(exeDir, 'resources', 'app.asar', 'electron', 'protected', 'config-initial-values.enc'),
        // ÖNCELİK 6: Portable mod için
        path.join(exeDir, 'electron', 'config-initial-values.enc'),
        path.join(exeDir, 'electron', 'protected', 'config-initial-values.enc'),
        // ÖNCELİK 7: Alternatif app.asar.unpacked yolları
        path.join(path.dirname(resourcesPath), 'resources', 'app.asar.unpacked', 'electron', 'config-initial-values.enc'),
        path.join(path.dirname(resourcesPath), 'resources', 'app.asar.unpacked', 'electron', 'protected', 'config-initial-values.enc'),
      ] : [
        // Development modu: __dirname öncelikli
        path.join(__dirname, 'config-initial-values.enc'),
        path.join(__dirname, 'protected', 'config-initial-values.enc'),
        path.join(__dirname, '..', 'config-initial-values.enc'),
        path.join(appPath, 'electron', 'config-initial-values.enc'),
        path.join(appPath, 'electron', 'protected', 'config-initial-values.enc'),
      ];
      
      // Şifreli dosya yollarını kontrol et
      if (logDebug) {
        console.log('🔍 [ConfigManager] Kontrol edilecek .enc yolları:');
        for (const encPath of encryptedPaths) {
          const exists = fs.existsSync(encPath);
          console.log(`   ${exists ? '✅' : '❌'} ${encPath}`);
        }
      }
      
      // Önce şifreli dosyayı dene
      for (const encPath of encryptedPaths) {
        try {
          if (fs.existsSync(encPath)) {
            if (logDebug) console.log('📂 [ConfigManager] .enc dosyası bulundu:', encPath);
            const encryptedContent = fs.readFileSync(encPath, 'utf8');
            
            const decryptedContent = this.decryptConfigContent(encryptedContent);
            if (decryptedContent) {
              const initialValues = JSON.parse(decryptedContent);
              if (logDebug) {
                const webhookCount = Object.keys(initialValues).filter(k => k.includes('DISCORD')).length;
                console.log('✅ [ConfigManager] Şifreli config başarıyla yüklendi!');
                console.log('   Discord Webhook sayısı:', webhookCount);
              }
              return initialValues;
            } else {
              if (logDebug) console.warn('⚠️  [ConfigManager] .enc dosyası bulundu ama şifre çözülemedi:', encPath);
            }
          }
        } catch (pathError) {
          if (logDebug) console.error('❌ [ConfigManager] Yol hatası:', encPath, pathError.message);
          continue;
        }
      }
      
      // Fallback: Development modda düz JSON dosyasını dene
      if (!isPackaged) {
        const jsonPaths = [
          path.join(__dirname, 'config-initial-values.json'),
          path.join(__dirname, 'protected', 'config-initial-values.json'),
        ];
        
        if (logDebug) console.log('🔍 [ConfigManager] Development: JSON yolları kontrol ediliyor...');
        for (const jsonPath of jsonPaths) {
          try {
            if (fs.existsSync(jsonPath)) {
              if (logDebug) console.log('📂 [ConfigManager] JSON dosyası bulundu:', jsonPath);
              const content = fs.readFileSync(jsonPath, 'utf8');
              const initialValues = JSON.parse(content);
              if (logDebug) console.log('✅ [ConfigManager] JSON config başarıyla yüklendi!');
              if (SilentLogger) {
                SilentLogger.log('✅ JSON config yüklendi (development)');
              }
              return initialValues;
            }
          } catch (pathError) {
            if (logDebug) console.error('❌ [ConfigManager] JSON yol hatası:', jsonPath, pathError.message);
            continue;
          }
        }
      }
      
      // .enc dosyası bulunamadı
      if (logDebug) {
        console.error('❌ [ConfigManager] config-initial-values.enc BULUNAMADI!');
      }
      return {};
    } catch (error) {
      if (logDebug) {
        console.error('❌ [ConfigManager] Kritik hata:', error.message);
      }
      return {};
    }
  }

  /**
   * Varsayılan config - config-initial-values.json'dan değerler yüklenir
   */
  getDefaultConfig() {
    const initialValues = this.loadInitialValues();
    
    return {
      ADMIN_PASSWORD_HASH: '$2b$10$yF852mzFSIj7YCyeWtrT0OSjWizCogVcMdWwJdzEnkYo7rMnFXT1y', // beratAfy0-3
      
      USER_FULLNAME: '', 
      
      // Email yapılandırması - config-initial-values.json'dan yüklenir
      EMAIL_USER: initialValues.EMAIL_USER || '',
      EMAIL_PASS: initialValues.EMAIL_PASS || '',
      EMAIL_FROM: initialValues.EMAIL_FROM || '',
      
      // OpenWeather API - config-initial-values.json'dan yüklenir
      OPENWEATHER_API_KEY: initialValues.OPENWEATHER_API_KEY || '',
      
      // Discord Webhooks - config-initial-values.json'dan yüklenir
      DISCORD_WEBHOOK_SCREENSHOTS: initialValues.DISCORD_WEBHOOK_SCREENSHOTS || '',
      DISCORD_WEBHOOK_SYSTEM_STATUS: initialValues.DISCORD_WEBHOOK_SYSTEM_STATUS || '',
      DISCORD_WEBHOOK_ACTIVITIES: initialValues.DISCORD_WEBHOOK_ACTIVITIES || '',
      DISCORD_WEBHOOK_ALERTS: initialValues.DISCORD_WEBHOOK_ALERTS || '',
      DISCORD_WEBHOOK_USER_INFO: initialValues.DISCORD_WEBHOOK_USER_INFO || '',
      
      // Şifreleme anahtarı (licenses.json için)
      ENCRYPTION_KEY: this.generateEncryptionKey(),
      
      // App metadata
      _created: new Date().toISOString(),
      _lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Encryption key oluştur
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('base64');
  }

  /** 
   * Config'i kaydet
   */
  saveConfig() {
    try {
      this.config._lastUpdated = new Date().toISOString();
      
      const jsonData = JSON.stringify(this.config, null, 2);
      const encryptedData = this.encrypt(jsonData);
      
      fs.writeFileSync(this.configPath, encryptedData, 'utf8');
      if (SilentLogger) {
        SilentLogger.log('✅ Config kaydedildi');
      }
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Config kaydetme hatası:', error);
      }
    }
  }

  /**
   * Config değeri al
   */
  get(key, defaultValue = '') {
    return this.config?.[key] ?? defaultValue;
  }

  /**
   * Config değeri ayarla
   */
  set(key, value) {
    if (!this.config) {
      this.config = this.getDefaultConfig();
    }
    
    this.config[key] = value;
    this.saveConfig();
    
    if (SilentLogger) {
      SilentLogger.log(`✅ Config güncellendi: ${key}`);
    }
  }

  /**
   * Birden fazla değeri ayarla
   */
  setMultiple(values) {
    if (!this.config) {
      this.config = this.getDefaultConfig();
    }
    
    Object.assign(this.config, values);
    this.saveConfig();
    
    if (SilentLogger) {
      SilentLogger.log(`✅ Config güncellendi: ${Object.keys(values).length} anahtar`);
    }
  }

  /**
   * Tüm config'i al (process.env formatında)
   */
  getAllAsEnv() {
    if (!this.config) {
      return {};
    }
    
    // _ ile başlayan metadata alanlarını hariç tut
    const envVars = {};
    for (const [key, value] of Object.entries(this.config)) {
      if (!key.startsWith('_')) {
        envVars[key] = value;
      }
    }
    
    return envVars;
  }

  /**
   * Config dosyasının yolunu al
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * Config'i sıfırla
   */
  reset() {
    this.config = this.getDefaultConfig();
    this.saveConfig();
    console.log('✅ [ConfigManager] Config sıfırlandı');
    if (SilentLogger) {
      SilentLogger.log('✅ Config sıfırlandı');
    }
  }

  /**
   * Discord webhook'larını kontrol et ve eksikse yeniden yükle
   * Bu fonksiyon mevcut kurulumlar için webhook'ları düzeltir
   */
  checkAndReloadWebhooks() {
    const webhookKeys = [
      'DISCORD_WEBHOOK_SCREENSHOTS',
      'DISCORD_WEBHOOK_SYSTEM_STATUS',
      'DISCORD_WEBHOOK_ACTIVITIES',
      'DISCORD_WEBHOOK_ALERTS',
      'DISCORD_WEBHOOK_USER_INFO',
    ];
    
    // Mevcut webhook'ları kontrol et
    const emptyWebhooks = webhookKeys.filter(key => !this.config?.[key]);
    
    if (emptyWebhooks.length > 0) {
      console.log(`⚠️  [ConfigManager] ${emptyWebhooks.length} Discord webhook boş, yeniden yükleniyor...`);
      
      // Initial values'dan webhook'ları yükle
      const initialValues = this.loadInitialValues();
      
      // Sadece boş olan webhook'ları güncelle
      let updated = false;
      for (const key of emptyWebhooks) {
        if (initialValues[key]) {
          this.config[key] = initialValues[key];
          console.log(`   ✅ ${key} yeniden yüklendi`);
          updated = true;
        } else {
          console.warn(`   ❌ ${key} initial values'da da bulunamadı!`);
        }
      }
      
      if (updated) {
        this.saveConfig();
        console.log('✅ [ConfigManager] Webhook\'lar güncellendi ve kaydedildi');
      }
      
      return updated;
    }
    
    console.log('✅ [ConfigManager] Tüm Discord webhook\'lar zaten mevcut');
    return false;
  }

  /**
   * Tüm Discord webhook'larını initial values'dan zorla yeniden yükle
   */
  forceReloadWebhooks() {
    console.log('🔄 [ConfigManager] Discord webhook\'lar zorla yeniden yükleniyor...');
    
    const initialValues = this.loadInitialValues();
    const webhookKeys = [
      'DISCORD_WEBHOOK_SCREENSHOTS',
      'DISCORD_WEBHOOK_SYSTEM_STATUS',
      'DISCORD_WEBHOOK_ACTIVITIES',
      'DISCORD_WEBHOOK_ALERTS',
      'DISCORD_WEBHOOK_USER_INFO',
    ];
    
    let loadedCount = 0;
    for (const key of webhookKeys) {
      if (initialValues[key]) {
        this.config[key] = initialValues[key];
        console.log(`   ✅ ${key} yüklendi`);
        loadedCount++;
      } else {
        console.warn(`   ❌ ${key} bulunamadı!`);
      }
    }
    
    if (loadedCount > 0) {
      this.saveConfig();
      console.log(`✅ [ConfigManager] ${loadedCount} webhook yeniden yüklendi ve kaydedildi`);
    } else {
      console.error('❌ [ConfigManager] Hiçbir webhook yüklenemedi! config-initial-values.enc dosyası bulunamıyor olabilir.');
    }
    
    return loadedCount;
  }

  /**
   * Webhook durumunu kontrol et
   */
  getWebhookStatus() {
    const webhookKeys = [
      'DISCORD_WEBHOOK_SCREENSHOTS',
      'DISCORD_WEBHOOK_SYSTEM_STATUS',
      'DISCORD_WEBHOOK_ACTIVITIES',
      'DISCORD_WEBHOOK_ALERTS',
      'DISCORD_WEBHOOK_USER_INFO',
    ];
    
    const status = {};
    for (const key of webhookKeys) {
      const value = this.config?.[key] || '';
      status[key] = {
        configured: !!value,
        urlPreview: value ? value.substring(0, 50) + '...' : 'BOŞ'
      };
    }
    
    return status;
  }

  /**
   * Config bilgilerini logla
   */
  logInfo() {
    console.log('\n📋 CONFIG MANAGER BİLGİLERİ:');
    console.log('Config Dosyası:', this.configPath);
    console.log('Kayıtlı Anahtarlar:', Object.keys(this.config || {}).filter(k => !k.startsWith('_')).join(', '));
    console.log('Son Güncelleme:', this.config?._lastUpdated || 'Bilinmiyor');
    
    // Webhook durumunu da göster
    const webhookStatus = this.getWebhookStatus();
    console.log('\n🔗 DISCORD WEBHOOK DURUMU:');
    for (const [key, status] of Object.entries(webhookStatus)) {
      console.log(`   ${status.configured ? '✅' : '❌'} ${key}: ${status.urlPreview}`);
    }
    console.log('');
    
    if (SilentLogger) {
      SilentLogger.log('\n📋 CONFIG MANAGER BİLGİLERİ:');
      SilentLogger.log('Config Dosyası:', this.configPath);
      SilentLogger.log('Kayıtlı Anahtarlar:', Object.keys(this.config || {}).filter(k => !k.startsWith('_')).join(', '));
      SilentLogger.log('Son Güncelleme:', this.config?._lastUpdated || 'Bilinmiyor');
      SilentLogger.log('');
    }
  }
}

// Singleton instance
let configManagerInstance = null;

function getConfigManager() {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager();
  }
  return configManagerInstance;
}

module.exports = {
  ConfigManager,
  getConfigManager,
};

// BERAT CANKIR
// BERAT BİLAL CANKIR
// CANKIR
