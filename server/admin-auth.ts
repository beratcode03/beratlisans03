import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { getDataDir } from './path-resolver';

// Admin şifre hash'ini al - her zaman config dosyasından fresh oku (cache yok)
function getAdminPasswordHash(): string | undefined {
  try {
    // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
    const dataDir = getDataDir();
    const configFile = path.join(dataDir, 'admin-config.json');
    
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (config.ADMIN_PASSWORD_HASH) {
        return config.ADMIN_PASSWORD_HASH;
      }
    }
  } catch (err) {
    console.error('❌ Admin config dosyası okunamadı:', err);
  }
  
  return undefined;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyAdminPassword(password: string): boolean {
  const ADMIN_PASSWORD_HASH = getAdminPasswordHash();
  
  if (!ADMIN_PASSWORD_HASH) {
    console.warn('⚠️  ADMIN_PASSWORD_HASH ayarlanmamış! Varsayılan şifre: beratAfy0-3');
    // Varsayılan şifre için bcrypt hash: beratAfy0-3 (güncellenmiş doğru hash)
    const defaultHash = '$2b$10$yF852mzFSIj7YCyeWtrT0OSjWizCogVcMdWwJdzEnkYo7rMnFXT1y';
    return bcrypt.compareSync(password, defaultHash);
  }
  
  return bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Yetkilendirme başlığı eksik veya hatalı',
      code: 'AUTH_REQUIRED'
    });
  }
  
  const token = authHeader.substring(7);
  
  if (!verifyAdminPassword(token)) {
    console.warn(`❌ Başarısız admin girişi denemesi: ${req.ip}`);
    return res.status(403).json({
      success: false,
      message: 'Geçersiz admin şifresi',
      code: 'INVALID_PASSWORD'
    });
  }
  
  console.log(`✅ Admin girişi başarılı: ${req.ip}`);
  next();
}

export async function updateAdminPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  // Önce mevcut şifreyi doğrula
  if (!verifyAdminPassword(currentPassword)) {
    return {
      success: false,
      message: 'Mevcut şifre hatalı'
    };
  }

  // Yeni şifre kontrolü
  if (!newPassword || newPassword.length < 8) {
    return {
      success: false,
      message: 'Yeni şifre en az 8 karakter olmalıdır'
    };
  }

  // Yeni şifre hash'i oluştur
  const newHash = hashPassword(newPassword);

  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
    const dataDir = getDataDir();
    const configFile = path.join(dataDir, 'admin-config.json');
    
    // data klasörü yoksa oluştur
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Admin config dosyasına kaydet
    const config = {
      ADMIN_PASSWORD_HASH: newHash,
      updated_at: new Date().toISOString()
    };
    
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    
    console.log('✅ Admin şifresi başarıyla güncellendi');
    console.log('📁 Şifre hash\'i kaydedildi:', configFile);

    return {
      success: true,
      message: 'Şifre başarıyla güncellendi. Lütfen yeni şifrenizi güvenli bir yerde saklayın.'
    };
  } catch (error) {
    console.error('❌ Şifre güncelleme hatası:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Şifre güncellenirken bir hata oluştu'
    };
  }
}

export function generateAdminPasswordHash(password: string): void {
  const hash = hashPassword(password);
  console.log('\n🔐 ADMIN ŞİFRE HASH\'İ OLUŞTURULDU:');
  console.log('Aşağıdaki hash\'i ConfigManager\'a ekleyin:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
  console.log(`Şifreniz: ${password}`);
  console.log('⚠️  Bu bilgileri güvenli bir yerde saklayın!\n');
  console.log('💡 Electron uygulamasında ConfigManager otomatik olarak güncellenir.');
}

// ES module'de require.main yerine import.meta.url kullan
// CJS bundle'da import.meta undefined olabilir
function isMainModule(): boolean {
  try {
    // ESM ortamında
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return import.meta.url === `file://${process.argv[1]}`;
    }
  } catch {}
  
  try {
    // CJS ortamında
    if (typeof require !== 'undefined' && require.main) {
      return require.main === module;
    }
  } catch {}
  
  return false;
}

if (isMainModule()) {
  const password = process.argv[2] || 'beratAfy0-3';
  generateAdminPasswordHash(password);
}
