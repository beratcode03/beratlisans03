import { randomUUID } from 'crypto';
import { discordWebhook } from './discord-webhook';

export interface UserMonitoringLog {
  id: string;
  timestamp: Date;
  type: 'task' | 'mood' | 'goal' | 'question' | 'exam' | 'flashcard' | 'study_hours' | 'navigation' | 'auth';
  action: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  severity: 'info' | 'warning' | 'error';
}

class UserMonitoringSystem {
  private logs: UserMonitoringLog[] = [];
  private offlineQueue: UserMonitoringLog[] = [];
  private isOnline = true;
  private maxLogs = 5000;

  constructor() {
    setInterval(() => this.flushOfflineQueue(), 300000);
  }

  async log(activity: Omit<UserMonitoringLog, 'id' | 'timestamp'>): Promise<UserMonitoringLog> {
    const log: UserMonitoringLog = {
      id: randomUUID(),
      timestamp: new Date(),
      ...activity,
    };

    try {
      this.logs.push(log);

      if (this.logs.length > this.maxLogs) {
        this.logs.splice(0, this.logs.length - this.maxLogs);
      }

      this.sendToDiscord(log).catch(() => {
        this.offlineQueue.push(log);
      });

      return log;
    } catch (error) {
      return log;
    }
  }

  private async sendToDiscord(log: UserMonitoringLog): Promise<void> {
    if (!discordWebhook.isEnabled()) {
      this.isOnline = false;
      throw new Error('Discord webhook not enabled');
    }

    try {
      const color = this.getSeverityColor(log.severity);
      const actionTr = this.translateAction(log.action);
      
      await discordWebhook.sendMessage({
        username: 'AFYONLUM - Kullanıcı İzleme',
        embeds: [{
          title: `${this.getSeverityEmoji(log.severity)} ${actionTr}`,
          color,
          fields: [
            { name: '👤 Kullanıcı', value: log.userName || log.userEmail || 'Bilinmiyor', inline: true },
            { name: '📋 Aksiyon', value: actionTr, inline: true },
            { name: '🕐 Zaman', value: new Date(log.timestamp).toLocaleString('tr-TR'), inline: false },
            ...(log.details ? [{ name: '📝 Detaylar', value: this.formatDetails(log.details), inline: false }] : []),
            ...(log.ipAddress ? [{ name: '🌐 IP Adresi', value: log.ipAddress, inline: true }] : []),
          ],
          footer: { text: 'Kullanıcı İzleme Sistemi' },
          timestamp: log.timestamp.toISOString(),
        }],
      });
      
      this.isOnline = true;
    } catch (error) {
      this.isOnline = false;
      throw error;
    }
  }

  private async flushOfflineQueue() {
    if (this.offlineQueue.length === 0) {
      return;
    }

    const logsToSend = [...this.offlineQueue];
    this.offlineQueue = [];
    let successCount = 0;

    for (const log of logsToSend) {
      try {
        await this.sendToDiscord(log);
        successCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        this.offlineQueue.push(log);
      }
    }

    if (successCount > 0) {
      this.isOnline = true;
    }
  }

  private getSeverityEmoji(severity: string): string {
    const emojis = { info: 'ℹ️', warning: '⚠️', error: '❌' };
    return emojis[severity as keyof typeof emojis] || 'ℹ️';
  }

  private getSeverityColor(severity: string): number {
    const colors = {
      info: 0x3b82f6,
      warning: 0xf59e0b,
      error: 0xef4444,
    };
    return colors[severity as keyof typeof colors] || 0x3b82f6;
  }

  private translateAction(action: string): string {
    const translations: Record<string, string> = {
      'Task created': 'Görev oluşturuldu',
      'Task completed': 'Görev tamamlandı',
      'Task deleted': 'Görev silindi',
      'Task updated': 'Görev güncellendi',
      'User added task': 'Kullanıcı görev ekledi',
      'User updated task': 'Kullanıcı görevi güncelledi',
      'User deleted task': 'Kullanıcı görevi sildi',
      'User completed task': 'Kullanıcı görevi tamamladı',
      'Mood logged': 'Ruh hali kaydedildi',
      'Goal created': 'Hedef oluşturuldu',
      'Goal completed': 'Hedef tamamlandı',
      'Goal deleted': 'Hedef silindi',
      'Question logged': 'Soru kaydedildi',
      'User logged question': 'Kullanıcı soru kaydetti',
      'Exam result added': 'Sınav sonucu eklendi',
      'Exam result updated': 'Sınav sonucu güncellendi',
      'Exam result deleted': 'Sınav sonucu silindi',
      'User added exam': 'Kullanıcı sınav ekledi',
      'User updated exam': 'Kullanıcı sınavı güncellendi',
      'User deleted exam': 'Kullanıcı sınavı sildi',
      'Flashcard created': 'Kart oluşturuldu',
      'Flashcard deleted': 'Kart silindi',
      'Flashcard practiced': 'Kart çalışıldı',
      'Study hours logged': 'Çalışma saati kaydedildi',
      'Study hours updated': 'Çalışma saati güncellendi',
      'Study hours deleted': 'Çalışma saati silindi',
      'User updated study hours': 'Kullanıcı çalışma saatini güncelledi',
      'Study session started': 'Çalışma oturumu başladı',
      'Study session ended': 'Çalışma oturumu bitti',
      'Break started': 'Mola başladı',
      'Break ended': 'Mola bitti',
      'Navigation': 'Navigasyon',
      'Page visited': 'Sayfa ziyaret edildi',
      'Page viewed': 'Sayfa görüntülendi',
      'User viewed page': 'Kullanıcı sayfa görüntüledi',
      'Login attempt': 'Giriş denemesi',
      'Logout': 'Çıkış yapıldı',
      'User started application': 'Kullanıcı uygulamayı başlattı',
      'User closed application': 'Kullanıcı uygulamayı kapattı',
      'User performed action': 'Kullanıcı aksiyon gerçekleştirdi',
      'Weather checked': 'Hava durumu kontrolü',
      'Email sent': 'E-posta gönderildi',
      'RAPOR_GONDERILDI_BASARILI': 'Rapor Basariyla Gonderildi',
      'RAPOR_GONDERILDI_BASARISIZ': 'Rapor Gonderilemedi (HATA)',
    };
    
    return translations[action] || action;
  }

  private formatDetails(details: Record<string, any>): string {
    return Object.entries(details)
      .map(([key, value]) => {
        if (typeof value === 'object') {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join('\n')
      .slice(0, 1000);
  }

  getLogs(filter?: {
    type?: UserMonitoringLog['type'];
    severity?: UserMonitoringLog['severity'];
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    limit?: number;
  }): UserMonitoringLog[] {
    let logs = [...this.logs];

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

  getStats() {
    return {
      total: this.logs.length,
      byType: this.groupBy(this.logs, 'type'),
      bySeverity: this.groupBy(this.logs, 'severity'),
      offlineQueueSize: this.offlineQueue.length,
      isOnline: this.isOnline,
    };
  }

  private groupBy(items: any[], key: string) {
    return items.reduce((acc, item) => {
      const value = item[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  clearOldLogs(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const originalLength = this.logs.length;
    this.logs = this.logs.filter(
      (log) => new Date(log.timestamp) >= cutoffDate
    );

    return {
      removed: originalLength - this.logs.length,
      remaining: this.logs.length,
    };
  }
}

export const userMonitoring = new UserMonitoringSystem();
