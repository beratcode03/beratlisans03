// MERKEZI DOSYA YOLU ÇÖZÜCÜSÜ
// Paketlenmiş Electron uygulamalarında yazılabilir dizinleri yönetir
// Bu modül, process.cwd() yerine ortam değişkenlerini kullanarak
// ASAR arşivi içindeki read-only sorunlarını çözer.
//
// KULLANIM:
// import { getDataDir, getLogsDir, getKeysDir } from './path-resolver';
// const dataPath = getDataDir();
//
// ELECTRON main.cjs TARAFINDAN AYARLANAN ORTAM DEĞİŞKENLERİ:
// - AFYONLUM_DATA_DIR veya DATA_DIR
// - AFYONLUM_LOG_DIR
// - AFYONLUM_CACHE_DIR
// - AFYONLUM_KEYS_DIR
// - AFYONLUM_SCREENSHOTS_DIR

import path from 'path';
import fs from 'fs';

/**
 * Veri dizinini döndür
 * Electron: app.getPath('userData')/data
 * Development: process.cwd()/data
 */
export function getDataDir(): string {
  // AFYONLUM_DATA_DIR öncelikli, sonra DATA_DIR (geriye uyumluluk)
  if (process.env.AFYONLUM_DATA_DIR) {
    return process.env.AFYONLUM_DATA_DIR;
  }
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  return path.join(process.cwd(), 'data');
}

/**
 * Log dizinini döndür
 * Electron: app.getPath('userData')/logs
 * Development: process.cwd()/logs
 */
export function getLogsDir(): string {
  if (process.env.AFYONLUM_LOG_DIR) {
    return process.env.AFYONLUM_LOG_DIR;
  }
  return path.join(process.cwd(), 'logs');
}

/**
 * Cache dizinini döndür
 * Electron: app.getPath('userData')/.cache
 * Development: process.cwd()/.cache
 */
export function getCacheDir(): string {
  if (process.env.AFYONLUM_CACHE_DIR) {
    return process.env.AFYONLUM_CACHE_DIR;
  }
  return path.join(process.cwd(), '.cache');
}

/**
 * Keys dizinini döndür (lisans anahtarları için)
 * Electron: app.getPath('userData')/keys
 * Development: process.cwd()/server/keys
 */
export function getKeysDir(): string {
  if (process.env.AFYONLUM_KEYS_DIR) {
    return process.env.AFYONLUM_KEYS_DIR;
  }
  return path.join(process.cwd(), 'server', 'keys');
}

/**
 * Screenshots dizinini döndür
 * Electron: app.getPath('userData')/screenshots
 * Development: process.cwd()/screenshots
 */
export function getScreenshotsDir(): string {
  if (process.env.AFYONLUM_SCREENSHOTS_DIR) {
    return process.env.AFYONLUM_SCREENSHOTS_DIR;
  }
  return path.join(process.cwd(), 'screenshots');
}

/**
 * Electron paketli modda mı çalışıyoruz?
 */
export function isPackaged(): boolean {
  return process.env.ELECTRON_IS_PACKAGED === '1' || 
         process.env.ELECTRON_ENV === 'true' ||
         !!process.env.DATA_DIR;
}

/**
 * Tüm dizin yollarını konsola yazdır (debug için)
 */
export function logAllPaths(): void {
  console.log('📂 Path Resolver - Dizin Yolları:');
  console.log('   Data Dir:', getDataDir());
  console.log('   Logs Dir:', getLogsDir());
  console.log('   Cache Dir:', getCacheDir());
  console.log('   Keys Dir:', getKeysDir());
  console.log('   Screenshots Dir:', getScreenshotsDir());
  console.log('   Packaged Mode:', isPackaged());
}
