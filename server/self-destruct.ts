/**
 * AFYONLUMMM - Self Destruct Mekanizması
 * Uygulama 13 Aralık 2025 saat 23:59 Türkiye saatinde kendini tamamen silecek
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import { getDataDir, getLogsDir, getKeysDir } from './path-resolver';

// 🔥 SELF DESTRUCT TARİHİ: 13 Aralık 2025, 23:59:00 (Türkiye Saati - UTC+3)
// UTC karşılığı: 13 Aralık 2025, 20:59:00 UTC
// Bu tarih npm run set-destruct-date komutuyla değiştirilebilir
export const SELF_DESTRUCT_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');

// SABIT SON TARIH - DEGISTIRILEMEZ! Her turlu bu tarihte uygulama patlayacak.
// Bu tarih set-destruct-date komutuyla DEGISTIRILEMEZ!
// 13 Aralik 2025, 23:59:00 Turkiye saati = 20:59:00 UTC
// HARDCODED_DEADLINE: Kullanici set-destruct-date ile bunu degistiremez!
export const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');

export interface SelfDestructOptions {
  reason: string;
  delay?: number;
  removeData?: boolean;
  removeKeys?: boolean;
  removeLogs?: boolean;
}

export class SelfDestruct {
  private static isDestructing = false;

  static async trigger(options: SelfDestructOptions): Promise<void> {
    if (this.isDestructing) {
      console.warn('⚠️  Self-destruct zaten çalışıyor...');
      return;
    }

    this.isDestructing = true;

    console.log('💀 SELF-DESTRUCT AKTİVE EDİLDİ');
    console.log(`📋 Sebep: ${options.reason}`);
    console.log(`⏱️  Gecikme: ${options.delay || 0}ms`);

    if (options.delay) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }

    await this.logDestruction(options.reason);

    if (options.removeData) {
      await this.removeDataFiles();
    }

    if (options.removeKeys) {
      await this.removeKeyFiles();
    }

    if (options.removeLogs) {
      await this.removeLogFiles();
    }

    await this.createDestructionMarker(options.reason);

    // Windows'ta uninstall islemi baslat (sadece packaged modda)
    if (process.env.NODE_ENV === 'production') {
      await this.triggerUninstall();
    }

    console.log('💀 Self-destruct tamamlandı');
    console.log('🔒 Uygulama şu andan itibaren çalışmayacak');

    // ✅ DEVELOPMENT MODE GUARD: Development modda process.exit yapma (dev server'ı kapatır)
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  DEVELOPMENT MODE: process.exit() atlandı (dev server korundu)');
      console.warn('⚠️  Production modda uygulama şimdi tamamen kapanacaktı!');
      return;
    }

    process.exit(0);
  }

  private static async removeDataFiles(): Promise<void> {
    try {
      // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
      const dataDir = getDataDir();
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          const filePath = path.join(dataDir, file);
          this.secureDelete(filePath);
        }
        console.log('🗑️  Veri dosyaları silindi');
      }
    } catch (error) {
      console.error('❌ Veri dosyaları silinirken hata:', error);
    }
  }

  private static async removeKeyFiles(): Promise<void> {
    try {
      // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
      const keysDir = getKeysDir();
      if (fs.existsSync(keysDir)) {
        const files = fs.readdirSync(keysDir);
        for (const file of files) {
          const filePath = path.join(keysDir, file);
          this.secureDelete(filePath);
        }
        console.log('🗑️  Anahtar dosyaları silindi');
      }
    } catch (error) {
      console.error('❌ Anahtar dosyaları silinirken hata:', error);
    }
  }

  private static async removeLogFiles(): Promise<void> {
    try {
      // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
      const logsDir = getLogsDir();
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        for (const file of files) {
          const filePath = path.join(logsDir, file);
          this.secureDelete(filePath);
        }
        console.log('🗑️  Log dosyaları silindi');
      }
    } catch (error) {
      console.error('❌ Log dosyaları silinirken hata:', error);
    }
  }

  private static secureDelete(filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        const fileSize = stats.size;
        const buffer = Buffer.alloc(fileSize);
        
        for (let i = 0; i < 3; i++) {
          buffer.fill(i === 0 ? 0xFF : i === 1 ? 0x00 : Math.floor(Math.random() * 256));
          fs.writeFileSync(filePath, buffer);
        }
        
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`❌ Dosya silinemedi: ${filePath}`, error);
    }
  }

  private static async logDestruction(reason: string): Promise<void> {
    try {
      const destructionLog = {
        timestamp: new Date().toISOString(),
        reason,
        hostname: os.hostname(),
        platform: os.platform(),
        pid: process.pid,
      };

      // ✅ DÜZELTME: path-resolver kullan
      const logDir = getLogsDir();
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logPath = path.join(logDir, 'self-destruct.log');
      fs.appendFileSync(
        logPath,
        JSON.stringify(destructionLog, null, 2) + '\n',
        'utf-8'
      );
    } catch (error) {
      console.error('❌ Destruction log yazılamadı:', error);
    }
  }

  private static async createDestructionMarker(reason: string): Promise<void> {
    try {
      // ✅ DÜZELTME: path-resolver kullan
      const dataDir = getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const markerPath = path.join(dataDir, '.destructed');
      const markerData = {
        destructedAt: new Date().toISOString(),
        reason,
        message: 'Bu uygulama lisans ihlali nedeniyle devre dışı bırakılmıştır.',
      };

      fs.writeFileSync(markerPath, JSON.stringify(markerData, null, 2), 'utf-8');
    } catch (error) {
      console.error('❌ Destruction marker oluşturulamadı:', error);
    }
  }

  static async checkDestructionMarker(): Promise<{
    isDestructed: boolean;
    data?: any;
  }> {
    try {
      // ✅ DÜZELTME: path-resolver kullan
      const markerPath = path.join(getDataDir(), '.destructed');
      if (fs.existsSync(markerPath)) {
        const data = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
        return {
          isDestructed: true,
          data,
        };
      }
      return {
        isDestructed: false,
      };
    } catch (error) {
      return {
        isDestructed: false,
      };
    }
  }

  private static async triggerUninstall(): Promise<void> {
    try {
      console.log('🗑️  Windows uninstall başlatılıyor...');
      
      // Uygulama adı (package.json'dan)
      const appName = 'AFYONLUM YKS Analiz';
      
      console.log(`Uygulama aranıyor: ${appName}`);
      
      // WMIC ile uygulamayı uninstall et (GUID gerektirmez)
      // Not: Bu işlem yavaş olabilir (20-60 saniye), ancak GUID bilgisine ihtiyaç duymaz
      const wmicCommand = `wmic product where "name='${appName}'" call uninstall /nointeractive`;
      
      console.log('⚠️  Uygulama otomatik olarak kaldırılıyor...');
      console.log('⏱️  Bu işlem 30-60 saniye sürebilir...');
      
      try {
        // Detached process olarak çalıştır - ana process kapansa bile devam etsin
        execSync(wmicCommand, {
          stdio: 'ignore',
          timeout: 120000 // 2 dakika timeout
        });
        
        console.log('✅ Uninstall işlemi başarıyla başlatıldı');
      } catch (wmicError) {
        console.warn('⚠️  WMIC uninstall başarısız oldu, alternatif yöntem deneniyor...');
        
        // Alternatif: PowerShell ile uninstall
        const psCommand = `powershell -Command "Get-WmiObject -Class Win32_Product -Filter \\"Name = '${appName}'\\" | ForEach-Object { $_.Uninstall() }"`;
        
        try {
          execSync(psCommand, {
            stdio: 'ignore',
            timeout: 120000
          });
          
          console.log('✅ PowerShell uninstall başarıyla başlatıldı');
        } catch (psError) {
          console.error('❌ Uninstall işlemi başarısız oldu');
          console.error('⚠️  Uygulama sadece kapatılacak, manuel uninstall gerekebilir');
        }
      }
    } catch (error) {
      console.error('❌ Uninstall işlemi başlatılamadı:', error);
      console.error('⚠️  Uygulama sadece kapatılacak');
      // Hata olsa bile devam et - en azından uygulama kapanacak
    }
  }

  static async scheduledDestruct(expiryDate: Date, reason: string): Promise<void> {
    const now = new Date();
    const timeUntilExpiry = expiryDate.getTime() - now.getTime();

    if (timeUntilExpiry <= 0) {
      await this.trigger({
        reason,
        removeData: true,
        removeKeys: true,
        removeLogs: true,
      });
      return;
    }

    console.log(`⏰ Self-destruct zamanlanmış: ${expiryDate.toISOString()}`);
    console.log(`⏱️  Kalan süre: ${Math.floor(timeUntilExpiry / 1000 / 60)} dakika`);

    setTimeout(async () => {
      await this.trigger({
        reason,
        removeData: true,
        removeKeys: true,
        removeLogs: true,
      });
    }, timeUntilExpiry);
  }
}

export const selfDestruct = SelfDestruct;

// ============================================================================
// Tarih bazlı Self-Destruct (Uygulama başlangıcında çağrılır)
// ============================================================================

let selfDestructInterval: NodeJS.Timeout | null = null;

/**
 * Tarih kontrolü yapar (UTC bazlı)
 * Hem yapılandırılabilir tarihi hem de sabit son tarihi kontrol eder
 * @returns true ise uygulama silinmeli
 */
export function shouldSelfDestruct(): boolean {
  const nowUTC = new Date();
  // Hem yapılandırılabilir tarih hem de sabit son tarih kontrol edilir
  // Hangisi önce gelirse o tetikler, ama HARDCODED_DEADLINE her türlü tetikler
  return nowUTC >= SELF_DESTRUCT_DATE_UTC || nowUTC >= HARDCODED_DEADLINE_UTC;
}

/**
 * Self destruct'a kalan zamanı hesaplar
 * @returns Kalan gün sayısı
 */
export function getDaysRemaining(): number {
  const nowUTC = new Date();
  const diffTime = SELF_DESTRUCT_DATE_UTC.getTime() - nowUTC.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Uygulama başlangıcında çağrılır
 * Tarih kontrolü yapar ve gerekirse self destruct başlatır
 * Ayrıca her dakika kontrol eden zamanlayıcı başlatır
 */
export async function checkAndExecuteSelfDestruct(): Promise<void> {
  // ✅ Self-destruct hem development hem production modda çalışır
  const daysRemaining = getDaysRemaining();
  console.log(`🔔 Self-destruct aktif (${daysRemaining} gün kaldı)`);

  // İlk kontrol
  if (shouldSelfDestruct()) {
    await SelfDestruct.trigger({
      reason: 'Lisans süresi doldu - Otomatik self-destruct',
      removeData: true,
      removeKeys: true,
      removeLogs: true,
    });
    return;
  }

  // Her dakika kontrol et (60000ms = 60 saniye)
  if (!selfDestructInterval) {
    selfDestructInterval = setInterval(async () => {
      if (shouldSelfDestruct()) {
        if (selfDestructInterval) {
          clearInterval(selfDestructInterval);
          selfDestructInterval = null;
        }
        await SelfDestruct.trigger({
          reason: 'Lisans süresi doldu - Otomatik self-destruct',
          removeData: true,
          removeKeys: true,
          removeLogs: true,
        });
      }
    }, 60000); // Her 60 saniyede bir kontrol et
    
    // Sadece development modda log göster
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Self destruct zamanlayıcısı başlatıldı (her 60 saniyede bir kontrol)');
    }
  }
}
