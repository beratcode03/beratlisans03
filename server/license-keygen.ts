import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getKeysDir } from './path-resolver';

export interface LicenseKeyData {
  customerEmail: string;
  customerName: string;
  
  // ✅ Lisansa özel kullanıcı bilgileri
  userFullName?: string | null;
  
  // ✅ Lisansa özel email konfigürasyonu
  emailUser?: string | null;
  emailPass?: string | null;
  emailFrom?: string | null;
  
  // ✅ Lisansa özel API anahtarları
  openweatherApiKey?: string | null;
  
  licenseType: '3-minute' | '30-minute' | '1-hour' | '3-hour' | '6-hour' | '12-hour' | 'trial' | '1-week' | '3-week' | '1-month' | '3-month' | '6-month' | '1-year' | 'lifetime' | 'custom';
  expiresAt?: string;
  customDuration?: number;
  maxActivations: number;
  features?: string[];
}

export class LicenseKeyGenerator {
  private privateKey: string | null = null;
  private publicKey: string | null = null;

  constructor() {
    this.loadOrGenerateKeys();
  }

  private loadOrGenerateKeys() {
    // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
    const keysDir = getKeysDir();
    const privateKeyPath = path.join(keysDir, 'private_key.pem');
    const publicKeyPath = path.join(keysDir, 'public_key.pem');

    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
      this.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      this.publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    } else {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      fs.writeFileSync(privateKeyPath, privateKey);
      fs.writeFileSync(publicKeyPath, publicKey);
      
      this.privateKey = privateKey;
      this.publicKey = publicKey;
    }
  }

  generateLicenseKey(data: LicenseKeyData): string {
    if (!this.privateKey) {
      throw new Error('Özel anahtar yüklenmedi');
    }

    const licenseKey = this.generateShortKey();
    
    return licenseKey;
  }

  private generateShortKey(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segments: string[] = [];
    
    for (let i = 0; i < 4; i++) {
      let segment = '';
      for (let j = 0; j < 4; j++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        segment += chars[randomIndex];
      }
      segments.push(segment);
    }
    
    return segments.join('-');
  }

  private formatLicenseKeyForDisplay(key: string): string {
    const cleanKey = key.replace(/-/g, '');
    const segments: string[] = [];
    for (let i = 0; i < cleanKey.length; i += 4) {
      segments.push(cleanKey.substring(i, i + 4));
    }
    
    return segments.join('-');
  }

  validateLicenseKey(licenseKey: string): { valid: boolean; data?: any; reason?: string } {
    try {
      const cleanKey = licenseKey.replace(/-/g, '').trim().toUpperCase();
      
      const keyPattern = /^[A-Z0-9]{16}$/;
      if (!keyPattern.test(cleanKey)) {
        return { valid: false, reason: 'Lisans anahtarı formatı hatalı (XXXX-XXXX-XXXX-XXXX formatında olmalı)' };
      }

      return { valid: true, data: { key: cleanKey } };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Bilinmeyen hata' };
    }
  }

  calculateExpiryDate(licenseType: LicenseKeyData['licenseType'], customDuration?: number): string | undefined {
    const now = new Date();
    
    switch (licenseType) {
      case '3-minute':
        now.setMinutes(now.getMinutes() + 3);
        return now.toISOString();
      case '30-minute':
        now.setMinutes(now.getMinutes() + 30);
        return now.toISOString();
      case '1-hour':
        now.setHours(now.getHours() + 1);
        return now.toISOString();
      case '3-hour':
        now.setHours(now.getHours() + 3);
        return now.toISOString();
      case '6-hour':
        now.setHours(now.getHours() + 6);
        return now.toISOString();
      case '12-hour':
        now.setHours(now.getHours() + 12);
        return now.toISOString();
      case 'trial':
        now.setDate(now.getDate() + 7);
        return now.toISOString();
      case '1-week':
        now.setDate(now.getDate() + 7);
        return now.toISOString();
      case '3-week':
        now.setDate(now.getDate() + 21);
        return now.toISOString();
      case '1-month':
        now.setMonth(now.getMonth() + 1);
        return now.toISOString();
      case '3-month':
        now.setMonth(now.getMonth() + 3);
        return now.toISOString();
      case '6-month':
        now.setMonth(now.getMonth() + 6);
        return now.toISOString();
      case '1-year':
        now.setFullYear(now.getFullYear() + 1);
        return now.toISOString();
      case 'custom':
        if (customDuration) {
          now.setDate(now.getDate() + customDuration);
          return now.toISOString();
        }
        return undefined;
      case 'lifetime':
        return undefined;
      default:
        return undefined;
    }
  }

  getPublicKey(): string {
    if (!this.publicKey) {
      throw new Error('Genel anahtar yüklenmedi');
    }
    return this.publicKey;
  }
}

export const licenseKeygen = new LicenseKeyGenerator();
