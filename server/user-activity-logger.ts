/**
 * User Activity Logger - Discord Webhook Entegrasyonu
 * Kullanıcı aktivite kayıt sistemi
 */

import { randomUUID } from "crypto";
import { discordWebhook } from "./discord-webhook";
import type { InsertUserActivity, UserActivity } from "../shared/sema";

// TYT dersleri
const TYT_SUBJECTS = ['turkce', 'sosyal', 'matematik', 'geometri', 'fen'];
// AYT dersleri  
const AYT_SUBJECTS = ['matematik', 'geometri', 'fizik', 'kimya', 'biyoloji'];

class UserActivityLogger {
  private static activities: UserActivity[] = [];
  private static maxActivities = 200;
  private static oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  
  private static isInitialized: boolean = false;

  static initialize() {
    if (!this.isInitialized) {
      this.isInitialized = true;
    }

    const now = Date.now();
    this.activities = this.activities.filter((activity: UserActivity) => {
      const activityTime = new Date(activity.createdAt).getTime();
      return (now - activityTime) <= this.oneWeekMs;
    });
  }

  private static async sendToDiscord(activity: UserActivity): Promise<void> {
    if (!discordWebhook.isEnabled()) {
      return;
    }

    try {
      const embed = this.buildActivityEmbed(activity);
      const payload = {
        embeds: [embed],
        username: '📊 Afyonlum YKS Analiz Sistemi',
      };

      await discordWebhook.sendMessageDirect(payload, 'activities');
    } catch {
    }
  }

  private static capitalizeFirst(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private static buildActivityEmbed(activity: UserActivity): any {
    const activityColors: Record<string, number> = {
      'task': 0x10b981,
      'question': 0x6366f1,
      'exam': 0xf59e0b,
      'study': 0x3b82f6,
      'flashcard': 0xec4899,
      'goal': 0x8b5cf6,
      'banned_word': 0xef4444,
      'default': 15844367
    };

    const activityEmojis: Record<string, string> = {
      'task': '📝',
      'question': '❓',
      'exam': '📋',
      'study': '📚',
      'flashcard': '🃏',
      'goal': '🎯',
      'banned_word': '🚫',
      'default': '📌'
    };

    const categoryNames: Record<string, string> = {
      'task': 'Görev',
      'question': 'Soru Kaydı',
      'exam': 'Deneme Sınavı',
      'study': 'Çalışma Saati',
      'flashcard': 'Flash Card',
      'goal': 'Hedef',
      'banned_word': 'Yasaklı Kelime',
      'default': 'Aktivite'
    };

    const actionEmojis: Record<string, string> = {
      'created': '✅',
      'updated': '✏️',
      'deleted': '🗑️',
      'completed': '🏆',
      'archived': '📦'
    };

    const categoryName = activity.category || 'default';
    const color = activityColors[categoryName] || activityColors.default;
    const emoji = activityEmojis[categoryName] || activityEmojis.default;
    const turkishCategory = categoryNames[categoryName] || categoryNames.default;

    let actionText = '';
    let actionEmoji = '';
    switch (activity.action) {
      case 'created': actionText = 'Eklendi'; actionEmoji = actionEmojis.created; break;
      case 'updated': actionText = 'Güncellendi'; actionEmoji = actionEmojis.updated; break;
      case 'deleted': actionText = 'Silindi'; actionEmoji = actionEmojis.deleted; break;
      case 'completed': actionText = 'Tamamlandı'; actionEmoji = actionEmojis.completed; break;
      case 'archived': actionText = 'Arşivlendi'; actionEmoji = actionEmojis.archived; break;
      default: actionText = activity.action; actionEmoji = '📍';
    }

    let payload: any = {};
    if (activity.payloadSnapshot) {
      try {
        payload = typeof activity.payloadSnapshot === 'string'
          ? JSON.parse(activity.payloadSnapshot)
          : activity.payloadSnapshot;
      } catch (e) {
        payload = {};
      }
    }

    const fields: Array<{ name: string; value: string; inline: boolean }> = [
      {
        name: '👤 Kullanıcı',
        value: activity.userName || 'Afyonlum',
        inline: true,
      },
      {
        name: '🕐 Zaman',
        value: new Date(activity.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        inline: true,
      },
      {
        name: '📂 Tip',
        value: `${turkishCategory} - ${actionText}`,
        inline: true,
      },
    ];

    this.addCategorySpecificFields(fields, categoryName, payload, activity);

    return {
      title: `${emoji} ${turkishCategory} ${actionEmoji} ${actionText}`,
      description: activity.details || '📌 Aktivite kaydedildi',
      color: color,
      fields: fields,
      timestamp: new Date(activity.createdAt).toISOString(),
      footer: {
        text: '🎓 Afyonlum YKS Analiz Sistemi',
      },
    };
  }

  private static addCategorySpecificFields(
    fields: Array<{ name: string; value: string; inline: boolean }>,
    categoryName: string,
    payload: any,
    activity: UserActivity
  ): void {
    if (categoryName === 'banned_word') {
      if (payload.word) {
        fields.push({
          name: '🚫 Yasaklı Kelime',
          value: `**${payload.word}**`,
          inline: true,
        });
      }
      if (payload.context) {
        fields.push({
          name: '📝 Bağlam',
          value: payload.context.substring(0, 200),
          inline: false,
        });
      }
      if (payload.location) {
        fields.push({
          name: '📍 Konum',
          value: payload.location,
          inline: true,
        });
      }
    } else if (categoryName === 'task') {
      if (payload.title) {
        fields.push({
          name: '📋 Görev Adı',
          value: payload.title.substring(0, 100),
          inline: false,
        });
      }
      if (payload.description) {
        fields.push({
          name: '📝 Açıklama',
          value: payload.description.substring(0, 200),
          inline: false,
        });
      }
      if (payload.dueDate) {
        fields.push({
          name: '📅 Bitiş Tarihi',
          value: new Date(payload.dueDate).toLocaleDateString('tr-TR'),
          inline: true,
        });
      }
      if (payload.priority) {
        const priorityMap: Record<string, string> = {
          'high': '🔴 Yüksek',
          'medium': '🟠 Orta',
          'low': '🟢 Düşük'
        };
        fields.push({
          name: '⚡ Öncelik',
          value: priorityMap[payload.priority] || payload.priority,
          inline: true,
        });
      }
      if (payload.category) {
        fields.push({
          name: '📚 Ders Kategorisi',
          value: `**${this.capitalizeFirst(payload.category)}**`,
          inline: true,
        });
      }
      if (payload.repeat && payload.repeat !== 'none') {
        const repeatMap: Record<string, string> = {
          'daily': '🔄 Her Gün',
          'weekly': '🔄 Her Hafta',
          'monthly': '🔄 Her Ay',
          'none': 'Tekrar Yok'
        };
        fields.push({
          name: '🔁 Tekrar',
          value: repeatMap[payload.repeat] || payload.repeat,
          inline: true,
        });
      }
    } else if (categoryName === 'question') {
      const subjectName = this.getSubjectName(payload.subject);
      const correctCount = parseInt(payload.correct_count || payload.correctCount || 0);
      const wrongCount = parseInt(payload.wrong_count || payload.wrongCount || 0);
      const blankCount = parseInt(payload.blank_count || payload.blankCount || 0);
      const totalQuestions = correctCount + wrongCount + blankCount;
      const net = correctCount - (wrongCount * 0.25);

      if (payload.study_date) {
        fields.push({
          name: '📅 Tarih',
          value: new Date(payload.study_date).toLocaleDateString('tr-TR'),
          inline: true,
        });
      }

      if (payload.exam_type) {
        const examTypeEmoji = payload.exam_type === 'TYT' ? '📘' : (payload.exam_type === 'AYT' ? '📙' : '📕');
        fields.push({
          name: '🎯 Alan',
          value: `${examTypeEmoji} ${payload.exam_type === 'TYT' ? 'TYT' : (payload.exam_type === 'AYT' ? 'AYT' : 'Branş')}`,
          inline: true,
        });
      }

      fields.push({
        name: '📚 Ders',
        value: `**${subjectName}**`,
        inline: true,
      });

      if (payload.topic) {
        fields.push({
          name: '📖 Konu',
          value: payload.topic.substring(0, 50),
          inline: true,
        });
      }

      fields.push({
        name: '📊 Toplam Soru',
        value: `**${totalQuestions}**`,
        inline: true,
      });

      fields.push({
        name: '📈 DYBN',
        value: `✅ D:**${correctCount}** ❌ Y:**${wrongCount}** ⬜ B:**${blankCount}** 🎯 Net:**${net.toFixed(2)}**`,
        inline: false,
      });

      if (payload.wrong_topics && Array.isArray(payload.wrong_topics) && payload.wrong_topics.length > 0) {
        const wrongTopicsStr = payload.wrong_topics.slice(0, 5).map((t: string) => `*${t}*`).join(', ');
        fields.push({
          name: '⚠️ Hatalı Konular',
          value: wrongTopicsStr.substring(0, 200) || 'Belirtilmemiş',
          inline: false,
        });
      }

      if (payload.time_spent_minutes) {
        const hours = Math.floor(payload.time_spent_minutes / 60);
        const mins = payload.time_spent_minutes % 60;
        fields.push({
          name: '⏱️ Çözüm Süresi',
          value: hours > 0 ? `${hours} saat ${mins} dakika` : `${mins} dakika`,
          inline: true,
        });
      }
    } else if (categoryName === 'exam') {
      const examName = payload.display_name || payload.exam_name || payload.examName || 'İsimsiz Deneme';
      const examScope = payload.exam_scope === 'branch' ? 'Branş Deneme' : 'Genel Deneme';
      const examType = payload.exam_type || 'TYT';
      const examScopeEmoji = payload.exam_scope === 'branch' ? '📕' : '📗';
      const examTypeEmoji = examType === 'TYT' ? '📘' : '📙';

      fields.push({
        name: '📋 Deneme Adı',
        value: `**${examName.substring(0, 100)}**`,
        inline: false,
      });

      fields.push({
        name: '📊 Deneme Tipi',
        value: `${examScopeEmoji} ${examScope} (${examTypeEmoji} ${examType})`,
        inline: true,
      });

      if (payload.exam_date) {
        fields.push({
          name: '📅 Sınav Tarihi',
          value: new Date(payload.exam_date).toLocaleDateString('tr-TR'),
          inline: true,
        });
      }

      if (payload.time_spent_minutes || payload.solve_time) {
        const mins = payload.time_spent_minutes || payload.solve_time || 0;
        const hours = Math.floor(mins / 60);
        const remainMins = mins % 60;
        fields.push({
          name: '⏱️ Çözüm Süresi',
          value: hours > 0 ? `${hours} saat ${remainMins} dakika` : `${remainMins} dakika`,
          inline: true,
        });
      }

      const tytNet = parseFloat(payload.tyt_net || 0);
      const aytNet = parseFloat(payload.ayt_net || 0);
      const totalCorrect = parseInt(payload.total_correct || 0);
      const totalWrong = parseInt(payload.total_wrong || 0);
      const totalBlank = parseInt(payload.total_blank || 0);

      if (totalCorrect > 0 || totalWrong > 0 || totalBlank > 0) {
        fields.push({
          name: '📈 Toplam DYBN',
          value: `✅ D:**${totalCorrect}** ❌ Y:**${totalWrong}** ⬜ B:**${totalBlank}**`,
          inline: true,
        });
      }

      if (tytNet > 0 || aytNet > 0) {
        if (examScope === 'Genel Deneme') {
          fields.push({
            name: '📘 TYT Net',
            value: `**${tytNet.toFixed(2)}**`,
            inline: true,
          });
          fields.push({
            name: '📙 AYT Net',
            value: `**${aytNet.toFixed(2)}**`,
            inline: true,
          });
          fields.push({
            name: '🎯 Toplam Net',
            value: `**${(tytNet + aytNet).toFixed(2)}**`,
            inline: true,
          });
        } else {
          const totalNet = tytNet + aytNet;
          fields.push({
            name: '🎯 Net',
            value: `**${totalNet.toFixed(2)}**`,
            inline: true,
          });
        }
      }

      if (payload.subjects_data) {
        try {
          let subjectsData = payload.subjects_data;
          if (typeof subjectsData === 'string') {
            subjectsData = JSON.parse(subjectsData);
          }
          
          const subjectLines: string[] = [];
          
          // Deneme tipine göre doğru dersleri filtrele
          let allowedSubjects: string[];
          if (examScope === 'Genel Deneme' || payload.exam_scope === 'general') {
            // Genel deneme için exam_type'a göre filtrele
            if (examType === 'TYT') {
              allowedSubjects = TYT_SUBJECTS;
            } else if (examType === 'AYT') {
              allowedSubjects = AYT_SUBJECTS;
            } else {
              // Her iki tip için de tüm dersler
              allowedSubjects = [...new Set([...TYT_SUBJECTS, ...AYT_SUBJECTS])];
            }
          } else {
            // Branş deneme için tüm dersler gösterilebilir
            allowedSubjects = [...new Set([...TYT_SUBJECTS, ...AYT_SUBJECTS])];
          }

          for (const [subjectKey, data] of Object.entries(subjectsData)) {
            const d = data as any;
            // Sadece izin verilen dersleri göster ve veri varsa
            const normalizedKey = subjectKey.toLowerCase();
            if (!allowedSubjects.includes(normalizedKey)) {
              continue;
            }
            
            if (d.correct !== undefined || d.wrong !== undefined) {
              const correct = parseInt(d.correct || 0);
              const wrong = parseInt(d.wrong || 0);
              const blank = parseInt(d.blank || 0);
              
              // Eğer hiç veri yoksa atla
              if (correct === 0 && wrong === 0 && blank === 0) {
                continue;
              }
              
              const net = correct - (wrong * 0.25);
              const name = this.capitalizeFirst(subjectKey);
              subjectLines.push(`**${name}**: ✅${correct} ❌${wrong} ⬜${blank} 🎯${net.toFixed(1)}`);
            }
          }

          if (subjectLines.length > 0) {
            fields.push({
              name: '📚 Ders Netleri',
              value: subjectLines.join('\n').substring(0, 1000),
              inline: false,
            });
          }
        } catch (e) {}
      }

      // Hatalı konular varsa ekle
      if (payload.wrong_topics && Array.isArray(payload.wrong_topics) && payload.wrong_topics.length > 0) {
        const wrongTopicsStr = payload.wrong_topics.slice(0, 8).map((t: string) => `*${t}*`).join(', ');
        fields.push({
          name: '⚠️ Hatalı Konular',
          value: wrongTopicsStr.substring(0, 300) || 'Belirtilmemiş',
          inline: false,
        });
      }
    } else if (categoryName === 'study') {
      const hours = payload.hours || 0;
      const minutes = payload.minutes || 0;
      const subjectName = payload.subject ? this.getSubjectName(payload.subject) : '';

      fields.push({
        name: '⏱️ Çalışma Süresi',
        value: hours > 0 ? `**${hours}** saat **${minutes}** dakika` : `**${minutes}** dakika`,
        inline: true,
      });

      if (subjectName) {
        fields.push({
          name: '📚 Ders',
          value: `**${subjectName}**`,
          inline: true,
        });
      }

      if (payload.study_date) {
        fields.push({
          name: '📅 Tarih',
          value: new Date(payload.study_date).toLocaleDateString('tr-TR'),
          inline: true,
        });
      }
    } else if (categoryName === 'goal') {
      if (payload.title) {
        fields.push({
          name: '🎯 Hedef',
          value: `**${payload.title.substring(0, 100)}**`,
          inline: false,
        });
      }
      if (payload.target) {
        fields.push({
          name: '📊 Hedef Değer',
          value: `**${payload.target}**`,
          inline: true,
        });
      }
      if (payload.current) {
        fields.push({
          name: '📈 Mevcut',
          value: `**${payload.current}**`,
          inline: true,
        });
      }
      if (payload.deadline) {
        fields.push({
          name: '📅 Son Tarih',
          value: new Date(payload.deadline).toLocaleDateString('tr-TR'),
          inline: true,
        });
      }
    } else if (categoryName === 'flashcard') {
      if (payload.front) {
        fields.push({
          name: '📝 Ön Yüz',
          value: payload.front.substring(0, 100),
          inline: false,
        });
      }
      if (payload.back) {
        fields.push({
          name: '📖 Arka Yüz',
          value: payload.back.substring(0, 100),
          inline: false,
        });
      }
      if (payload.deck) {
        fields.push({
          name: '🗂️ Deste',
          value: `**${payload.deck}**`,
          inline: true,
        });
      }
    }
  }

  private static getSubjectName(subjectCode?: string): string {
    const subjectMap: Record<string, string> = {
      'turkce': 'Türkçe',
      'sosyal': 'Sosyal Bilimler',
      'matematik': 'Matematik',
      'fizik': 'Fizik',
      'kimya': 'Kimya',
      'biyoloji': 'Biyoloji',
      'fen': 'Fen Bilimleri',
      'geometri': 'Geometri',
      'tarih': 'Tarih',
      'cografya': 'Coğrafya',
      'felsefe': 'Felsefe',
      'din': 'Din Kültürü',
      'ingilizce': 'İngilizce',
      'tyt-geometri': 'TYT Geometri',
      'ayt-matematik': 'AYT Matematik',
      'ayt-fizik': 'AYT Fizik',
      'ayt-kimya': 'AYT Kimya',
      'ayt-biyoloji': 'AYT Biyoloji',
      'ayt-geometri': 'AYT Geometri',
      'genel': 'Genel'
    };
    return subjectMap[subjectCode || ''] || this.capitalizeFirst(subjectCode || '') || 'Konu belirtilmemiş';
  }

  static async log(activity: InsertUserActivity): Promise<UserActivity> {
    this.initialize();

    const log: UserActivity = {
      id: randomUUID(),
      userId: activity.userId,
      userName: activity.userName,
      category: activity.category,
      action: activity.action,
      entityId: activity.entityId,
      entityType: activity.entityType,
      payloadSnapshot: activity.payloadSnapshot || null,
      details: activity.details || null,
      createdAt: new Date(),
    };

    this.activities.unshift(log);

    if (this.activities.length > this.maxActivities) {
      this.activities = this.activities.slice(0, this.maxActivities);
    }

    // Doğrudan Discord'a gönder (hızlı)
    this.sendToDiscord(log).catch(() => {});

    return log;
  }

  static getAll(): UserActivity[] {
    this.initialize();
    return [...this.activities];
  }

  static getByUserId(userId: string, limit?: number): UserActivity[] {
    this.initialize();
    const filtered = this.activities.filter(a => a.userId === userId);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  static getByCategory(category: string, limit?: number): UserActivity[] {
    this.initialize();
    const filtered = this.activities.filter(a => a.category === category);
    return limit ? filtered.slice(0, limit) : filtered;
  }

  static getRecent(limit: number = 50): UserActivity[] {
    this.initialize();
    return this.activities.slice(0, limit);
  }

  static clear(): void {
    this.activities = [];
  }

  static clearOld(daysToKeep: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const oldCount = this.activities.length;
    this.activities = this.activities.filter(
      (activity) => new Date(activity.createdAt) >= cutoffDate
    );
    return oldCount - this.activities.length;
  }
}

export default UserActivityLogger;
