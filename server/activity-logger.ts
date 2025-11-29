import { randomUUID } from 'crypto';
import { discordWebhook } from './discord-webhook';

export interface ActivityLog {
  id: string;
  timestamp: Date;
  type: 'license' | 'activation' | 'deactivation' | 'login' | 'api' | 'security' | 'system' | 'admin';
  action: string;
  userId?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export class ActivityLogger {
  // ✅ DÜZELTME: DOSYAYA LOG KAYDETME - Sadece memory ve Discord'a gönder
  private static logBuffer: ActivityLog[] = []; // Memory'de tut, diske YAZMA
  private static dedupCache: Record<string, number> = {}; // Memory-only dedup cache
  
  // ✅ Memory-only dedup cache (dosyaya yazmaz)
  private static getDedupCache(): Record<string, number> {
    return this.dedupCache;
  }
  
  private static saveDedupCache(cache: Record<string, number>) {
    // ✅ DOSYAYA YAZMA - Sadece memory'de tut
    this.dedupCache = cache;
  }

  static initialize() {
    // ✅ DOSYA İŞLEMLERİ KALDIRILDI - Log dosyaları oluşturulmuyor
    // Sadece memory'de çalış, diske hiçbir şey yazma
    
    // ✅ Dedup cache cleanup: eski kayıtları temizle (memory'de)
    try {
      const dedupCache = this.getDedupCache();
      const now = Date.now();
      const debounceMs = 120000; // 120 saniye (2 dakika)
      
      const cleanedCache: Record<string, number> = {};
      Object.entries(dedupCache).forEach(([hash, timestamp]) => {
        if (now - timestamp < debounceMs) {
          cleanedCache[hash] = timestamp;
        }
      });
      
      this.dedupCache = cleanedCache;
    } catch {
      // Sessiz hata yut
    }
  }

  static async log(activity: Omit<ActivityLog, 'id' | 'timestamp'>): Promise<ActivityLog> {
    // ✅ KRİTİK: İlk önce initialize çağrılmalı (dizinler yoksa oluştur)
    this.initialize();
    
    const log: ActivityLog = {
      id: randomUUID(),
      timestamp: new Date(),
      ...activity,
      action: this.turkcelestir(activity.action), // Aksiyonları Türkçeleştir
    };

    // ✅ Zaman bazlı duplicate suppression (120 saniye debounce - cron-based repeats için)
    const logHash = `${log.type}-${log.action}`;
    const dedupCache = this.getDedupCache();
    const now = Date.now();
    const debounceMs = 120000; // 120 saniye (2 dakika) - her dakika çalışan cron'ları bloklar
    
    if (dedupCache[logHash] && now - dedupCache[logHash] < debounceMs) {
      return log; // Aynı log 120 saniye içinde, kaydetme
    }
    
    // Cache'i güncelle (yeni log kaydedildi)
    dedupCache[logHash] = now;
    this.saveDedupCache(dedupCache);

    try {
      
      // Buffer'a ekle (memory leak önlemi)
      this.logBuffer.push(log);
      
      // Her 10 log'da bir diske yaz (performans optimizasyonu)
      if (this.logBuffer.length >= 10) {
        this.flushBuffer();
      }
      
      // Discord webhook'a gönder (asenkron, sessizce hata yutar)
      this.sendToDiscord(log).catch(() => {
        // Sessizce yut - kullanıcı fark etmesin
      });

      return log;
    } catch (error) {
      // ✅ SESSIZ MOD: Hataları sessizce yut
      return log;
    }
  }

  // ✅ DÜZELTME: DOSYAYA YAZMA - Sadece memory'de tut
  private static memoryLogs: ActivityLog[] = []; // Memory-only log storage
  
  private static flushBuffer() {
    if (this.logBuffer.length === 0) return;
    
    try {
      // ✅ Memory-only: Diske yazma, sadece memory'de tut
      this.memoryLogs.push(...this.logBuffer);

      // Son 1000 kaydı tut (memory leak önlemi - daha az çünkü sadece memory)
      const maxLogs = 1000;
      if (this.memoryLogs.length > maxLogs) {
        this.memoryLogs.splice(0, this.memoryLogs.length - maxLogs);
      }
      
      this.logBuffer = []; // Buffer'ı temizle
    } catch (error) {
      this.logBuffer = []; // Buffer'ı yine de temizle (memory leak önlemi)
    }
  }

  // ✅ Aksiyonları Türkçeleştir (GENİŞLETİLMİŞ)
  private static turkcelestir(action: string): string {
    const ceviri: Record<string, string> = {
      // Lisans işlemleri
      'License generated': 'Lisans oluşturuldu',
      'License generation failed': 'Lisans oluşturulamadı',
      'Licenses list retrieved': 'Lisans listesi getirildi',
      'Licenses list retrieval failed': 'Lisans listesi getirilemedi',
      'Activations list retrieved': 'Aktivasyon listesi getirildi',
      'Activations list retrieval failed': 'Aktivasyon listesi getirilemedi',
      'License detail retrieval failed - not found': 'Lisans detayı bulunamadı',
      'License revoked': 'Lisans iptal edildi',
      'License revocation failed - not found': 'Lisans bulunamadı',
      'License revocation failed': 'Lisans iptal edilemedi',
      'License check - development mode': 'Lisans kontrolü - geliştirme modu',
      'License check - production mode': 'Lisans kontrolü - canlı mod',
      'License activated': 'Lisans aktive edildi',
      'License activation failed': 'Lisans aktive edilemedi',
      'License expired': 'Lisans süresi doldu',
      'License validation': 'Lisans doğrulama',
      'License validation failed': 'Lisans doğrulanamadı',
      'License heartbeat': 'Lisans kalp atışı',
      
      // Admin işlemleri
      'Admin password changed successfully': 'Admin şifresi değiştirildi',
      'Password change failed': 'Şifre değiştirilemedi',
      'Password change error': 'Şifre değiştirme hatası',
      'Admin login successful': 'Admin girişi başarılı',
      'Admin login failed': 'Admin girişi başarısız',
      'Admin logout': 'Admin çıkış yaptı',
      
      // Kullanıcı işlemleri
      'Users list retrieved': 'Kullanıcı listesi getirildi',
      'Users list retrieval failed': 'Kullanıcı listesi getirilemedi',
      'User created': 'Kullanıcı oluşturuldu',
      'User updated': 'Kullanıcı güncellendi',
      'User deleted': 'Kullanıcı silindi',
      
      // Aktivite logları
      'License activity logs retrieved': 'Lisans aktivite logları getirildi',
      'License activity logs retrieval failed': 'Lisans aktivite logları getirilemedi',
      'Activity logs cleared': 'Aktivite logları temizlendi',
      
      // Monitoring
      'Screenshot captured': 'Ekran görüntüsü alındı',
      'Screenshot failed': 'Ekran görüntüsü alınamadı',
      'Clipboard monitored': 'Pano izlendi',
      'Web navigation tracked': 'Web gezintisi izlendi',
      'System status checked': 'Sistem durumu kontrol edildi',
      'USB device detected': 'USB cihaz algılandı',
      'AFK detected': 'Uzakta algılandı',
      'User active': 'Kullanıcı aktif',
      
      // Görev ve çalışma
      'Görev Eklendi': 'Görev eklendi',
      'Görev Durumu Değiştirildi': 'Görev durumu değiştirildi',
      'Task created': 'Görev oluşturuldu',
      'Task updated': 'Görev güncellendi',
      'Task deleted': 'Görev silindi',
      'Task completed': 'Görev tamamlandı',
      'Study session started': 'Çalışma oturumu başladı',
      'Study session ended': 'Çalışma oturumu bitti',
      'Exam result added': 'Deneme sonucu eklendi',
      'Exam result updated': 'Deneme sonucu güncellendi',
    };
    
    return ceviri[action] || action;
  }

  private static readLogs(): ActivityLog[] {
    // ✅ DÜZELTME: Dosya yerine memory'den oku
    return [...this.memoryLogs, ...this.logBuffer];
  }

  static getAll(): ActivityLog[] {
    this.initialize();
    return this.readLogs();
  }

  static getLogs(filter?: {
    type?: ActivityLog['type'];
    severity?: ActivityLog['severity'];
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    limit?: number;
  }): ActivityLog[] {
    this.initialize();

    let logs = this.readLogs();

    if (filter?.type) {
      logs = logs.filter((log) => log.type === filter.type);
    }

    if (filter?.severity) {
      logs = logs.filter((log) => log.severity === filter.severity);
    }

    if (filter?.startDate) {
      logs = logs.filter((log) => new Date(log.timestamp) >= filter.startDate!);
    }

    if (filter?.endDate) {
      logs = logs.filter((log) => new Date(log.timestamp) <= filter.endDate!);
    }

    if (filter?.userId) {
      logs = logs.filter((log) => log.userId === filter.userId);
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filter?.limit) {
      logs = logs.slice(0, filter.limit);
    }

    return logs;
  }

  static getStats(): {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    last24Hours: number;
    last7Days: number;
  } {
    this.initialize();

    const logs = this.readLogs();
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    logs.forEach((log) => {
      byType[log.type] = (byType[log.type] || 0) + 1;
      bySeverity[log.severity] = (bySeverity[log.severity] || 0) + 1;
    });

    return {
      total: logs.length,
      byType,
      bySeverity,
      last24Hours: logs.filter((log) => new Date(log.timestamp) >= last24Hours).length,
      last7Days: logs.filter((log) => new Date(log.timestamp) >= last7Days).length,
    };
  }

  static clearOldLogs(daysToKeep: number = 30): number {
    this.initialize();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const originalLength = this.memoryLogs.length;
    this.memoryLogs = this.memoryLogs.filter((log) => new Date(log.timestamp) >= cutoffDate);
    
    return originalLength - this.memoryLogs.length;
  }

  private static logToConsole(log: ActivityLog) {
    const icon = this.getSeverityIcon(log.severity);
    const typeColor = this.getTypeColor(log.type);
    
    console.log(
      `${icon} [${log.type.toUpperCase()}] ${log.action}`,
      log.details ? JSON.stringify(log.details) : ''
    );
  }

  private static async sendToDiscord(log: ActivityLog): Promise<void> {
    if (!discordWebhook.isEnabled()) {
      return; // Discord webhook ayarlanmamış
    }

    // Sadece önemli aktiviteleri Discord'a gönder (info log spam'ini engelle)
    if (log.severity === 'info' && log.type === 'api') {
      return; // API istekleri çok fazla olabilir, spam'i önle
    }

    const colors = {
      info: 0x3b82f6,
      warning: 0xf59e0b,
      error: 0xef4444,
      critical: 0xff0000,
    };

    const typeEmojis = {
      license: '🔑',
      activation: '🚀',
      deactivation: '🛑',
      login: '🔐',
      api: '📡',
      security: '🛡️',
      system: '⚙️',
    };

    const fields: any[] = [
      { name: '📝 Aksiyon', value: log.action, inline: false },
    ];

    if (log.userName) {
      fields.push({ name: '👤 Kullanıcı', value: log.userName, inline: true });
    }

    if (log.ipAddress) {
      fields.push({ name: '🌐 IP Adresi', value: log.ipAddress, inline: true });
    }

    if (log.details) {
      const detailsStr = Object.entries(log.details)
        .map(([key, value]) => `**${key}:** ${JSON.stringify(value)}`)
        .join('\n');
      if (detailsStr.length > 0 && detailsStr.length < 1000) {
        fields.push({ name: '📋 Detaylar', value: detailsStr, inline: false });
      }
    }

    const emoji = typeEmojis[log.type] || '📝';
    const severityText = log.severity.toUpperCase();

    await discordWebhook.sendMessage({
      username: 'AFYONLUM YKS Sistem',
      embeds: [{
        title: `${emoji} ${log.type.toUpperCase()} - ${severityText}`,
        color: colors[log.severity],
        fields,
        footer: { text: `Aktivite ID: ${log.id}` },
        timestamp: log.timestamp.toISOString(),
      }],
    });
  }

  private static getSeverityIcon(severity: ActivityLog['severity']): string {
    switch (severity) {
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'critical':
        return '🚨';
      default:
        return '📝';
    }
  }

  private static getTypeColor(type: ActivityLog['type']): string {
    switch (type) {
      case 'license':
        return '\x1b[36m';
      case 'activation':
        return '\x1b[32m';
      case 'deactivation':
        return '\x1b[33m';
      case 'login':
        return '\x1b[35m';
      case 'api':
        return '\x1b[34m';
      case 'security':
        return '\x1b[31m';
      case 'system':
        return '\x1b[37m';
      default:
        return '\x1b[0m';
    }
  }

  static exportLogs(startDate?: Date, endDate?: Date): string {
    this.initialize();

    let logs = this.readLogs();

    if (startDate) {
      logs = logs.filter((log) => new Date(log.timestamp) >= startDate);
    }

    if (endDate) {
      logs = logs.filter((log) => new Date(log.timestamp) <= endDate);
    }

    // ✅ DÜZELTME: Dosyaya yazma, JSON string döndür
    return JSON.stringify(logs, null, 2);
  }
}

export const activityLogger = ActivityLogger;
