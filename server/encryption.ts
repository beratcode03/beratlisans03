import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class EncryptionService {
  private encryptionKey: Buffer;
  private keySource: string;

  constructor() {
    const { key, source } = this.getOrCreateEncryptionKey();
    this.encryptionKey = Buffer.from(key, 'base64');
    this.keySource = source;
  }

  private getOrCreateEncryptionKey(): { key: string; source: string } {
    // ✅ ÖNCE: Ortam değişkeninden ENCRYPTION_KEY kontrol et (main.cjs tarafından ayarlanır)
    if (process.env.ENCRYPTION_KEY) {
      return { key: process.env.ENCRYPTION_KEY, source: 'env' };
    }

    // ✅ Electron ortamında ConfigManager'dan dene
    if (process.env.ELECTRON_ENV && typeof process !== 'undefined') {
      try {
        // ✅ DÜZELTME: Paketlenmiş uygulamada process.cwd() ASAR içine işaret eder
        // process.resourcesPath veya __dirname kullan
        const possiblePaths = [
          // Development
          path.join(process.cwd(), 'electron', 'config-manager.cjs'),
          // Packaged: app.asar.unpacked
          process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, 'app.asar.unpacked', 'electron', 'config-manager.cjs') : null,
          process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, 'app.asar.unpacked', 'electron', 'protected', 'config-manager.cjs') : null,
          // Packaged: app içinde
          process.env.RESOURCES_PATH ? path.join(process.env.RESOURCES_PATH, 'app', 'electron', 'config-manager.cjs') : null,
        ].filter(Boolean) as string[];

        for (const electronPath of possiblePaths) {
          if (fs.existsSync(electronPath)) {
            try {
              const { getConfigManager } = require(electronPath);
              const configManager = getConfigManager();
              const key = configManager.get('ENCRYPTION_KEY');
              if (key) {
                return { key, source: 'electron-config' };
              }
            } catch (e) {
              // Bu yol çalışmadı, sonrakini dene
            }
          }
        }
      } catch (error) {
        console.warn('⚠️  Electron config-manager yüklenemedi, .env kullanılacak');
      }
    }

    const key = this.generateAndStoreKey();
    return { key, source: 'generated' };
  }

  private generateAndStoreKey(): string {
    const key = crypto.randomBytes(KEY_LENGTH);
    const keyBase64 = key.toString('base64');
    
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }
      
      if (!envContent.includes('ENCRYPTION_KEY=')) {
        const newLine = envContent.endsWith('\n') || envContent === '' ? '' : '\n';
        envContent += `${newLine}ENCRYPTION_KEY=${keyBase64}\n`;
        fs.writeFileSync(envPath, envContent, 'utf-8');
        console.log('✅ ENCRYPTION_KEY .env dosyasına eklendi');
      }
    } catch (error) {
      console.warn('⚠️  .env dosyasına yazılamadı. Aşağıdaki satırı manuel olarak .env dosyanıza ekleyin:');
      console.log(`ENCRYPTION_KEY=${keyBase64}`);
    }
    
    return keyBase64;
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  decrypt(ciphertext: string): string {
    try {
      const data = Buffer.from(ciphertext, 'base64');
      
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
      const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      throw new Error('DECRYPT_FAILED');
    }
  }

  tryDecryptOrMigrate(data: string): string {
    try {
      return this.decrypt(data);
    } catch (error) {
      try {
        JSON.parse(data);
        return data;
      } catch {
        return JSON.stringify({
          gorevler: [],
          ruhHalleri: [],
          hedefler: [],
          soruGunlukleri: [],
          sinavSonuclari: [],
          sinavKonuNetleri: [],
          calismaSaatleri: [],
          kurulumVerisi: null
        });
      }
    }
  }

  encryptWithAAD(plaintext: string, recordId: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    
    const aad = Buffer.from(`record:${recordId}`, 'utf8');
    cipher.setAAD(aad);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  decryptWithAAD(ciphertext: string, recordId: string): string {
    try {
      const data = Buffer.from(ciphertext, 'base64');
      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
      const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      
      const aad = Buffer.from(`record:${recordId}`, 'utf8');
      decipher.setAAD(aad);
      decipher.setAuthTag(authTag);
      
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      throw new Error('AAD veri bütünlüğü ve kayıt kontrolü başarısız');
    }
  }

  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  getKeyInfo(): { source: string } {
    return { source: this.keySource };
  }
}

export const encryption = new EncryptionService();
