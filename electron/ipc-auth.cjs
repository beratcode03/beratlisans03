// BERAT CANKIR - IPC Authentication
// Renderer → Main process güvenli iletişim için JWT token sistemi
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

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

class IPCAuthManager {
  constructor() {
    // HMAC secret (32 bytes)
    this.secret = crypto.randomBytes(32);
    this.tokenExpiry = 3600000; // 1 saat
    this.activeSessions = new Map();
    
    if (SilentLogger) {
      SilentLogger.log('🔐 IPC Auth Manager başlatıldı');
    }
  }
  
  // Session token oluştur (renderer için)
  generateSessionToken(sessionId) {
    const payload = {
      sessionId,
      timestamp: Date.now(),
      expires: Date.now() + this.tokenExpiry,
    };
    
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr).toString('base64url');
    
    // HMAC imza
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payloadB64);
    const signature = hmac.digest('base64url');
    
    const token = `${payloadB64}.${signature}`;
    
    // Session kaydet
    this.activeSessions.set(sessionId, {
      token,
      createdAt: Date.now(),
      expiresAt: payload.expires,
    });
    
    if (SilentLogger) {
      SilentLogger.log(`✅ Session token oluşturuldu: ${sessionId}`);
    }
    return token;
  }
  
  // Token doğrula
  verifyToken(token) {
    try {
      if (!token || typeof token !== 'string') {
        return { valid: false, reason: 'Token eksik' };
      }
      
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, reason: 'Geçersiz token formatı' };
      }
      
      const [payloadB64, signature] = parts;
      
      // HMAC doğrula
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payloadB64);
      const expectedSignature = hmac.digest('base64url');
      
      if (signature !== expectedSignature) {
        return { valid: false, reason: 'Geçersiz imza' };
      }
      
      // Payload decode et
      const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadStr);
      
      // Expiry kontrol
      if (payload.expires < Date.now()) {
        this.activeSessions.delete(payload.sessionId);
        return { valid: false, reason: 'Token süresi dolmuş' };
      }
      
      // Session kontrol
      if (!this.activeSessions.has(payload.sessionId)) {
        return { valid: false, reason: 'Session bulunamadı' };
      }
      
      return {
        valid: true,
        sessionId: payload.sessionId,
        payload,
      };
    } catch (error) {
      if (SilentLogger) {
        SilentLogger.error('❌ Token doğrulama hatası:', error);
      }
      return { valid: false, reason: 'Token doğrulama hatası' };
    }
  }
  
  // Session iptal et
  revokeSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.delete(sessionId);
      if (SilentLogger) {
        SilentLogger.log(`🚫 Session iptal edildi: ${sessionId}`);
      }
      return true;
    }
    return false;
  }
  
  // Tüm sessions temizle
  clearAllSessions() {
    this.activeSessions.clear();
    if (SilentLogger) {
      SilentLogger.log('🗑️  Tüm sessions temizlendi');
    }
  }
  
  // Expired sessions temizle
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.expiresAt < now) {
        this.activeSessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && SilentLogger) {
      SilentLogger.log(`🧹 ${cleaned} expired session temizlendi`);
    }
    
    return cleaned;
  }
  
  // Periodic cleanup başlat
  startPeriodicCleanup() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 600000); // Her 10 dakikada bir
  }
}

module.exports = { IPCAuthManager };

// BERAT BİLAL CANKIR
