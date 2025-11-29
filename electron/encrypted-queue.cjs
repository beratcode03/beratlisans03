// BERAT CANKIR - Encrypted Queue Storage
// AES-256-GCM ile güvenli mesaj kuyruğu
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ✅ Dinamik silent-logger yolu (protected klasöründen de çalışır)
let SilentLogger = null;
try {
  const sameDirPath = path.join(__dirname, 'silent-logger.cjs');
  const parentDirPath = path.join(__dirname, '..', 'silent-logger.cjs');
  
  if (fs.existsSync(sameDirPath)) {
    SilentLogger = require(sameDirPath);
  } else if (fs.existsSync(parentDirPath)) {
    SilentLogger = require(parentDirPath);
  }
} catch (error) {
  // SilentLogger yüklenemezse, logging yapma
}

class EncryptedQueue {
  constructor(app, queueName = 'discord-queue') {
    this.app = app;
    this.queueFile = path.join(app.getPath('userData'), queueName + '.enc');
    this.algorithm = 'aes-256-gcm';
    
    // Encryption key (32 bytes for AES-256)
    // DÜZELTME: Key ConfigManager'dan yüklenmeli
    this.encryptionKey = this.loadOrGenerateKey();
    
    // In-memory queue
    this.queue = [];
    
    // Load persisted queue from disk
    this.loadFromDisk();
  }
  
  loadOrGenerateKey() {
    // Key dosya yolu
    const keyPath = path.join(this.app.getPath('userData'), 'queue-encryption.key');
    
    try {
      if (fs.existsSync(keyPath)) {
        const keyBuffer = fs.readFileSync(keyPath);
        if (SilentLogger) {
          SilentLogger.log('✅ Queue encryption key yüklendi');
        }
        return keyBuffer;
      }
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Key yükleme hatası:', error);
      }
    }
    
    // Yeni key oluştur
    const newKey = crypto.randomBytes(32);
    
    try {
      fs.writeFileSync(keyPath, newKey, { mode: 0o600 }); // Sadece owner okuyabilir
      if (SilentLogger) {
        SilentLogger.log('🔑 Yeni queue encryption key oluşturuldu');
      }
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Key kaydetme hatası:', error);
      }
    }
    
    return newKey;
  }
  
  // Encrypt data
  encrypt(plaintext) {
    try {
      // IV (Initialization Vector) - 12 bytes for GCM
      const iv = crypto.randomBytes(12);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Encrypt
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      // Get auth tag
      const authTag = cipher.getAuthTag();
      
      // Combine: IV + Auth Tag + Encrypted Data
      return Buffer.concat([iv, authTag, encrypted]).toString('base64');
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Encryption error:', error);
      }
      throw error;
    }
  }
  
  // Decrypt data
  decrypt(ciphertext) {
    try {
      const buffer = Buffer.from(ciphertext, 'base64');
      
      // Extract components
      const iv = buffer.slice(0, 12);
      const authTag = buffer.slice(12, 28);
      const encrypted = buffer.slice(28);
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Decryption error:', error);
      }
      throw error;
    }
  }
  
  // Add item to queue
  enqueue(item) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      data: item,
    };
    
    this.queue.push(entry);
    this.saveToDisk();
    
    return entry.id;
  }
  
  // Get next item from queue
  dequeue() {
    if (this.queue.length === 0) return null;
    
    const item = this.queue.shift();
    this.saveToDisk();
    
    return item;
  }
  
  // Peek at queue without removing
  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }
  
  // Get queue size
  size() {
    return this.queue.length;
  }
  
  // Check if queue is empty
  isEmpty() {
    return this.queue.length === 0;
  }
  
  // Clear entire queue
  clear() {
    this.queue = [];
    this.saveToDisk();
  }
  
  // Save queue to encrypted disk file
  saveToDisk() {
    try {
      const jsonData = JSON.stringify(this.queue);
      const encrypted = this.encrypt(jsonData);
      
      fs.writeFileSync(this.queueFile, encrypted, { mode: 0o600 });
      // Silent - Queue her kaydedildiğinde log üretme
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Queue kaydetme hatası:', error);
      }
    }
  }
  
  // Load queue from encrypted disk file
  loadFromDisk() {
    try {
      if (!fs.existsSync(this.queueFile)) {
        if (SilentLogger) {
          SilentLogger.log('ℹ️  Queue dosyası yok, yeni oluşturulacak');
        }
        return;
      }
      
      const encrypted = fs.readFileSync(this.queueFile, 'utf8');
      const jsonData = this.decrypt(encrypted);
      this.queue = JSON.parse(jsonData);
      
      if (SilentLogger) {
        SilentLogger.log('📂 Queue yüklendi (' + this.queue.length + ' items)');
      }
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Queue yükleme hatası:', error);
      }
      // Corrupted file, start fresh
      this.queue = [];
    }
  }
  
  // Get all items (for debugging)
  getAll() {
    return [...this.queue];
  }
  
  // Remove specific item by ID
  removeById(id) {
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveToDisk();
      return true;
    }
    return false;
  }
}

module.exports = { EncryptedQueue };

// BERAT BİLAL CANKIR
