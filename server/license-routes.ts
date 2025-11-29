import type { Express, Request, Response } from "express";
import { licenseStorage } from "./license-storage";
import { licenseKeygen, type LicenseKeyData } from "./license-keygen";
import { hardwareId } from "./hardware-id";
import { insertLicenseSchema, insertActivationSchema } from "@shared/sema";
import { z } from "zod";
import { adminAuthMiddleware } from "./admin-auth";
import { discordWebhook } from "./discord-webhook";
import { ActivityLogger } from "./activity-logger";
import { SelfDestruct } from "./self-destruct";
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";
import { getDataDir } from "./path-resolver";

// ESM modülünde __dirname yerine kullan
function getCurrentDir() {
  try {
    // CJS ortamında __dirname tanımlı
    if (typeof __dirname !== 'undefined') {
      return __dirname;
    }
  } catch {}
  
  try {
    // ESM ortamında import.meta.url kullan
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  
  // Son çare: Electron paketlenmiş uygulama için
  if (typeof process !== 'undefined' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'app.asar', 'dist');
  }
  
  return process.cwd();
}

const currentDir = getCurrentDir();

// ESM modülünde require() için - CJS ve ESM uyumlu
function getSafeRequire() {
  try {
    // CJS ortamında doğrudan require kullan
    if (typeof require !== 'undefined' && require.main) {
      return require;
    }
  } catch {}
  
  try {
    // ESM ortamında createRequire kullan
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return createRequire(import.meta.url);
    }
  } catch {}
  
  try {
    // CJS bundle için __filename ile dene
    if (typeof __filename !== 'undefined' && __filename) {
      return createRequire(__filename);
    }
  } catch {}
  
  try {
    // Son çare: currentDir ile dene
    const fakePath = path.join(currentDir, 'index.js');
    return createRequire(fakePath);
  } catch {}
  
  // Hiçbiri çalışmazsa boş bir fonksiyon döndür
  return function(id: string) {
    throw new Error(`Cannot require module: ${id}`);
  };
}

const requireESM = getSafeRequire();

export function registerLicenseRoutes(app: Express) {
  // Admin giriş endpoint'i (şifre doğrulama)
  app.post("/api/afyonlu03giris", async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      
      if (!password) {
        await ActivityLogger.log({
          type: 'login',
          action: 'Admin login failed - no password',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
        });
        return res.status(400).json({
          success: false,
          message: 'Şifre gerekli'
        });
      }
      
      // Admin şifresini doğrula
      const { verifyAdminPassword } = await import('./admin-auth');
      const isValid = verifyAdminPassword(password);
      
      if (!isValid) {
        console.warn(`❌ Başarısız admin girişi: ${req.ip}`);
        await ActivityLogger.log({
          type: 'login',
          action: 'Admin login failed - invalid password',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
        });
        return res.status(403).json({
          success: false,
          message: 'Geçersiz şifre'
        });
      }
      
      console.log(`✅ Admin girişi başarılı: ${req.ip}`);
      await ActivityLogger.log({
        type: 'login',
        action: 'Admin login successful',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { timestamp: new Date().toISOString() }
      });
      
      res.json({
        success: true,
        message: 'Giriş başarılı',
        token: password // Token olarak şifreyi dönüyoruz (Bearer token olarak kullanılacak)
      });
    } catch (error) {
      console.error("Admin giriş hatası:", error);
      await ActivityLogger.log({
        type: 'login',
        action: 'Admin login error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        message: "Giriş yapılamadı"
      });
    }
  });

  app.post("/api/afyonlu/03panel/licenses/generate", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const data = req.body as LicenseKeyData;
      
      const expiresAt = licenseKeygen.calculateExpiryDate(data.licenseType, data.customDuration);
      console.log(`📅 Lisans tipi: ${data.licenseType}, Hesaplanan expiresAt: ${expiresAt}`);
      
      const licenseKey = licenseKeygen.generateLicenseKey(data);
      
      const license = await licenseStorage.createLicense({
        licenseKey,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        
        // ✅ Lisansa özel kullanıcı bilgileri
        userFullName: data.userFullName || null,
        
        // ✅ Lisansa özel email konfigürasyonu
        emailUser: data.emailUser || null,
        emailPass: data.emailPass || null,
        emailFrom: data.emailFrom || null,
        
        // ✅ Lisansa özel API anahtarları
        openweatherApiKey: data.openweatherApiKey || null,
        
        licenseType: data.licenseType,
        maxActivations: data.maxActivations,
        expiresAt,
        features: data.features || [],
      });

      console.log(`✅ Lisans oluşturuldu: ${licenseKey}, Süre: ${license.expiresAt || 'Sınırsız'}`);

      // ✅ ASYNC FIX: Discord ve ActivityLogger'ı beklemeden yanıt döndür (crash önlemi)
      ActivityLogger.log({
        type: 'license',
        action: 'License generated',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseKey,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          licenseType: data.licenseType,
          maxActivations: data.maxActivations,
          expiresAt: expiresAt || 'Unlimited',
          features: data.features || []
        }
      }).catch(() => {
        // Sessizce hata yut - kullanıcı fark etmesin
      });

      // Discord bildirimi gönder (asenkron, beklemeden)
      discordWebhook.sendLicenseCreated(
        data.customerName,
        data.licenseType,
        license.expiresAt
      ).catch(() => {
        // Sessizce hata yut
      });

      res.json({
        success: true,
        license,
        licenseKey,
      });
    } catch (error) {
      console.error("Lisans oluşturma hatası:", error);
      // ✅ Error durumunda da ActivityLogger'ı beklemeden yanıt döndür
      ActivityLogger.log({
        type: 'license',
        action: 'License generation failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      }).catch(() => {
        // Sessizce hata yut
      });
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Lisans oluşturulamadı",
      });
    }
  });

  app.get("/api/afyonlu/03panel/licenses", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const licenses = await licenseStorage.getAllLicenses();
      const stats = await licenseStorage.getLicenseStats();
      
      await ActivityLogger.log({
        type: 'api',
        action: 'Licenses list retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { count: licenses.length }
      });
      
      res.json({
        licenses,
        stats,
      });
    } catch (error) {
      console.error("Lisanslar yüklenirken hata:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'Licenses list retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        message: "Lisanslar yüklenemedi",
      });
    }
  });

  app.get("/api/afyonlu/03panel/activations", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const activations = await licenseStorage.getActivations();
      
      await ActivityLogger.log({
        type: 'api',
        action: 'Activations list retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { count: activations.length }
      });
      
      res.json({
        activations,
      });
    } catch (error) {
      console.error("Aktivasyon listesi hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'Activations list retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        message: error instanceof Error ? error.message : "Aktivasyon listesi alınamadı",
      });
    }
  });

  app.get("/api/afyonlu/03panel/licenses/:id", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const license = await licenseStorage.getLicenseById(req.params.id);
      if (!license) {
        await ActivityLogger.log({
          type: 'api',
          action: 'License detail retrieval failed - not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseId: req.params.id }
        });
        return res.status(404).json({ message: "Lisans bulunamadı" });
      }

      const activations = await licenseStorage.getActivationsByLicenseId(license.id);
      const checkpoints = await licenseStorage.getCheckpointsByLicenseId(license.id);

      await ActivityLogger.log({
        type: 'api',
        action: 'License detail retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseId: license.id,
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          activationsCount: activations.length
        }
      });

      res.json({
        license,
        activations,
        checkpoints,
      });
    } catch (error) {
      console.error("Lisans yüklenirken hata:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'License detail retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { 
          licenseId: req.params.id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      res.status(500).json({
        message: "Lisans yüklenemedi",
      });
    }
  });

  app.post("/api/afyonlu/03panel/licenses/:id/revoke", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const license = await licenseStorage.revokeLicense(req.params.id, reason || "Belirtilmedi");
      
      if (!license) {
        await ActivityLogger.log({
          type: 'license',
          action: 'License revocation failed - not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseId: req.params.id, reason }
        });
        return res.status(404).json({ message: "Lisans bulunamadı" });
      }

      await ActivityLogger.log({
        type: 'license',
        action: 'License revoked',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseId: license.id,
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          reason: reason || "Belirtilmedi"
        }
      });

      // Discord bildirimi gönder
      await discordWebhook.sendLicenseRevoked(
        license.customerName,
        reason || "Belirtilmedi"
      );

      res.json({
        success: true,
        license,
      });
    } catch (error) {
      console.error("Lisans iptal edilirken hata:", error);
      await ActivityLogger.log({
        type: 'license',
        action: 'License revocation failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { 
          licenseId: req.params.id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      res.status(500).json({
        message: error instanceof Error ? error.message : "Lisans iptal edilemedi",
      });
    }
  });

  app.post("/api/licenses/validate", async (req: Request, res: Response) => {
    try {
      const { licenseKey, hardwareId } = req.body;
      
      const validation = licenseKeygen.validateLicenseKey(licenseKey);
      
      if (!validation.valid) {
        await licenseStorage.createCheckpoint({
          licenseId: "unknown",
          action: "validation_failed",
          details: `Geçersiz lisans key: ${validation.reason}`,
          ipAddress: req.ip,
        });
        
        await ActivityLogger.log({
          type: 'api',
          action: 'License validation failed - invalid key',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { 
            licenseKey: licenseKey?.substring(0, 10) + '...',
            reason: validation.reason
          }
        });
        
        return res.status(400).json({
          success: false,
          valid: false,
          reason: validation.reason,
          isNetworkError: false,
        });
      }

      const license = await licenseStorage.getLicenseByKey(licenseKey);
      
      if (!license) {
        await licenseStorage.createCheckpoint({
          licenseId: "unknown",
          action: "validation_failed",
          details: "Lisans veritabanında bulunamadı",
          ipAddress: req.ip,
        });
        
        await ActivityLogger.log({
          type: 'api',
          action: 'License validation failed - not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseKey: licenseKey?.substring(0, 10) + '...' }
        });
        
        return res.status(404).json({
          success: false,
          valid: false,
          reason: "Lisans veritabanında bulunamadı",
          isNetworkError: false,
        });
      }

      if (license.isRevoked) {
        await licenseStorage.createCheckpoint({
          licenseId: license.id,
          action: "validation_failed",
          details: "İptal edilmiş lisans kullanma girişimi",
          ipAddress: req.ip,
        });
        
        await ActivityLogger.log({
          type: 'api',
          action: 'License validation failed - revoked',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: {
            licenseKey: license.licenseKey,
            customerName: license.customerName,
            revokedReason: license.revokedReason
          }
        });
        
        return res.status(403).json({
          success: false,
          valid: false,
          reason: "Lisans iptal edilmiş",
          revokedReason: license.revokedReason,
          isNetworkError: false,
        });
      }

      // ✅ DÜZELTME: 60 saniyelik grace period ekle (saat senkronizasyon sorunları için)
      if (license.expiresAt) {
        const now = new Date();
        const expiryDate = new Date(license.expiresAt);
        const gracePeriodMs = 60 * 1000; // 60 saniye grace period
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        
        if (now > expiryWithGrace) {
          await licenseStorage.expireLicense(license.id);
          
          await ActivityLogger.log({
            type: 'api',
            action: 'License validation failed - expired',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'critical',
            details: {
              licenseKey: license.licenseKey,
              customerName: license.customerName,
              expiresAt: license.expiresAt,
              now: now.toISOString(),
              gracePeriodSeconds: 60
            }
          });
          
          console.log('💀 Lisans süresi doldu - Self-destruct tetikleniyor...');
          console.log(`   Expiry: ${expiryDate.toISOString()}`);
          console.log(`   Now:    ${now.toISOString()}`);
          
          // ✅ SELF-DESTRUCT: Lisans süresi doldu
          await SelfDestruct.trigger({
            reason: `Lisans süresi doldu (${license.customerName})`,
            removeData: true,
            removeKeys: true,
            removeLogs: false,
          });
          
          return res.status(403).json({
            success: false,
            valid: false,
            reason: "Lisans süresi dolmuş - Uygulama imha edildi",
            expiresAt: license.expiresAt,
            selfDestructed: true,
            isNetworkError: false,
          });
        }
      }

      let existingActivation;
      let hardwareMatch = false;
      
      if (hardwareId) {
        existingActivation = await licenseStorage.getActivationByHardwareId(
          license.id,
          hardwareId
        );
        hardwareMatch = existingActivation ? existingActivation.isActive : false;
      }

      await ActivityLogger.log({
        type: 'api',
        action: 'License validated',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          licenseType: license.licenseType,
          hardwareId: hardwareId || 'Not provided',
          isActivated: !!existingActivation,
          hardwareMatch
        }
      });

      res.json({
        success: true,
        valid: true,
        license: {
          customerName: license.customerName,
          licenseType: license.licenseType,
          expiresAt: license.expiresAt,
          features: license.features,
        },
        isActivated: !!existingActivation,
        hardwareMatch,
      });
    } catch (error) {
      console.error("Lisans doğrulama hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'License validation error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        valid: false,
        reason: "Doğrulama hatası",
        isNetworkError: false,
      });
    }
  });

  app.post("/api/licenses/activate", async (req: Request, res: Response) => {
    try {
      const { licenseKey, hardwareInfo } = req.body;
      
      const validation = licenseKeygen.validateLicenseKey(licenseKey);
      if (!validation.valid) {
        await licenseStorage.createCheckpoint({
          licenseId: "unknown",
          action: "validation_failed",
          details: `Aktivasyon girişimi başarısız: ${validation.reason}`,
          ipAddress: req.ip,
        });
        
        await ActivityLogger.log({
          type: 'activation',
          action: 'License activation failed - invalid key',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { 
            licenseKey: licenseKey?.substring(0, 10) + '...',
            reason: validation.reason
          }
        });
        
        return res.status(400).json({
          success: false,
          reason: validation.reason,
        });
      }

      const license = await licenseStorage.getLicenseByKey(licenseKey);
      if (!license) {
        await ActivityLogger.log({
          type: 'activation',
          action: 'License activation failed - not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseKey: licenseKey?.substring(0, 10) + '...' }
        });
        return res.status(404).json({
          success: false,
          reason: "Lisans bulunamadı",
        });
      }

      if (license.isRevoked) {
        await licenseStorage.createCheckpoint({
          licenseId: license.id,
          action: "validation_failed",
          details: "İptal edilmiş lisansla aktivasyon girişimi",
          ipAddress: req.ip,
        });
        
        await ActivityLogger.log({
          type: 'activation',
          action: 'License activation failed - revoked',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: {
            licenseKey: license.licenseKey,
            customerName: license.customerName,
            revokedReason: license.revokedReason
          }
        });
        
        return res.status(403).json({
          success: false,
          reason: "Lisans iptal edilmiş",
        });
      }

      // ✅ DÜZELTME: 60 saniyelik grace period ekle (saat senkronizasyon sorunları için)
      if (license.expiresAt) {
        const now = new Date();
        const expiryDate = new Date(license.expiresAt);
        const gracePeriodMs = 60 * 1000; // 60 saniye grace period
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        
        if (now > expiryWithGrace) {
          await licenseStorage.expireLicense(license.id);
          
          await ActivityLogger.log({
            type: 'activation',
            action: 'License activation failed - expired',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'critical',
            details: {
              licenseKey: license.licenseKey,
              customerName: license.customerName,
              expiresAt: license.expiresAt,
              now: now.toISOString(),
              gracePeriodSeconds: 60
            }
          });
        
          console.log('💀 Lisans süresi doldu - Self-destruct tetikleniyor...');
          console.log(`   Expiry: ${expiryDate.toISOString()}`);
          console.log(`   Now:    ${now.toISOString()}`);
          
          // ✅ SELF-DESTRUCT: Lisans süresi doldu
          await SelfDestruct.trigger({
            reason: `Lisans süresi doldu (${license.customerName})`,
            removeData: true,
            removeKeys: true,
            removeLogs: false,
          });
          
          return res.status(403).json({
            success: false,
            reason: "Lisans süresi dolmuş - Uygulama imha edildi",
            selfDestructed: true,
          });
        }
      }

      if (!hardwareInfo || !hardwareInfo.hardwareId) {
        await ActivityLogger.log({
          type: 'activation',
          action: 'License activation failed - missing hardware info',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseKey: license.licenseKey }
        });
        return res.status(400).json({
          success: false,
          reason: "Hardware bilgisi eksik",
        });
      }

      const activation = await licenseStorage.createActivation({
        licenseId: license.id,
        hardwareId: hardwareInfo.hardwareId,
        machineName: hardwareInfo.machineName || null,
        operatingSystem: hardwareInfo.operatingSystem || null,
        cpuInfo: hardwareInfo.cpuInfo || null,
        totalRam: hardwareInfo.totalRam || null,
        ipAddress: req.ip,
      });

      // ✅ ASYNC FIX: ActivityLogger'ı beklemeden yanıt döndür (crash önlemi)
      ActivityLogger.log({
        type: 'activation',
        action: 'License activated',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          hardwareId: hardwareInfo.hardwareId,
          macAddress: hardwareInfo.macAddress || 'Not provided',
          machineName: hardwareInfo.machineName,
          operatingSystem: hardwareInfo.operatingSystem,
          cpuInfo: hardwareInfo.cpuInfo,
          totalRam: hardwareInfo.totalRam,
          activationId: activation.id
        }
      }).catch(() => {
        // Sessizce hata yut
      });

      // ✅ ASYNC FIX: Discord webhook'u beklemeden yanıt döndür (crash önlemi)
      discordWebhook.sendLicenseActivated(
        license.customerName,
        hardwareInfo.machineName,
        hardwareInfo.operatingSystem
      ).catch(() => {
        // Sessizce hata yut
      });

      // ✅ Electron ortamında ConfigManager'a lisansa özel bilgileri kaydet
      if (process.env.ELECTRON_ENV === 'true') {
        try {
          const fs = require('fs');
          const electronPath = path.join(currentDir, '..', 'electron', 'config-manager.cjs');
          
          if (fs.existsSync(electronPath)) {
            // ✅ ESM-compatible require using createRequire
            const { getConfigManager } = requireESM(electronPath);
            const configManager = getConfigManager();
            
            // Lisansa özel kullanıcı bilgilerini kaydet (boş string'leri filtrele)
            const configUpdates: Record<string, any> = {};
            
            if (license.userFullName && license.userFullName.trim()) {
              configUpdates.USER_FULLNAME = license.userFullName.trim();
            }
            
            if (license.emailUser && license.emailUser.trim()) {
              configUpdates.EMAIL_USER = license.emailUser.trim();
            }
            
            if (license.emailPass && license.emailPass.trim()) {
              configUpdates.EMAIL_PASS = license.emailPass.trim();
            }
            
            if (license.emailFrom && license.emailFrom.trim()) {
              configUpdates.EMAIL_FROM = license.emailFrom.trim();
            }
            
            if (license.openweatherApiKey && license.openweatherApiKey.trim()) {
              configUpdates.OPENWEATHER_API_KEY = license.openweatherApiKey.trim();
            }
            
            if (Object.keys(configUpdates).length > 0) {
              configManager.setMultiple(configUpdates);
              console.log('✅ Lisansa özel bilgiler ConfigManager\'a kaydedildi:', Object.keys(configUpdates).join(', '));
            }
          }
        } catch (error) {
          console.warn('⚠️  ConfigManager güncellenirken hata (aktivasyon devam ediyor):', error);
        }
      }

      res.json({
        success: true,
        activation: {
          id: activation.id,
          hardwareId: activation.hardwareId,
          activatedAt: activation.activatedAt,
        },
        license: {
          customerName: license.customerName,
          licenseType: license.licenseType,
          expiresAt: license.expiresAt,
        },
      });
    } catch (error) {
      console.error("Aktivasyon hatası:", error);
      
      await ActivityLogger.log({
        type: 'activation',
        action: 'License activation error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      
      if (error instanceof Error && error.message.includes("iptal")) {
        return res.status(403).json({
          success: false,
          reason: error.message,
        });
      }
      
      res.status(500).json({
        success: false,
        reason: error instanceof Error ? error.message : "Aktivasyon başarısız",
      });
    }
  });

  app.post("/api/licenses/heartbeat", async (req: Request, res: Response) => {
    try {
      const { licenseKey, hardwareId: clientHardwareId } = req.body;
      
      if (!clientHardwareId) {
        await ActivityLogger.log({
          type: 'api',
          action: 'Heartbeat failed - missing hardware ID',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { licenseKey: licenseKey?.substring(0, 10) + '...' }
        });
        return res.status(400).json({ 
          success: false,
          reason: "Hardware ID gerekli" 
        });
      }
      
      const license = await licenseStorage.getLicenseByKey(licenseKey);
      if (!license) {
        await ActivityLogger.log({
          type: 'api',
          action: 'Heartbeat failed - license not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { 
            licenseKey: licenseKey?.substring(0, 10) + '...',
            hardwareId: clientHardwareId
          }
        });
        return res.status(404).json({ success: false });
      }

      const activation = await licenseStorage.getActivationByHardwareId(
        license.id,
        clientHardwareId
      );

      if (!activation) {
        await ActivityLogger.log({
          type: 'api',
          action: 'Heartbeat failed - activation not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: {
            licenseKey: license.licenseKey,
            hardwareId: clientHardwareId
          }
        });
        return res.status(404).json({ success: false });
      }

      await licenseStorage.updateHeartbeat(activation.id);

      await ActivityLogger.log({
        type: 'api',
        action: 'Heartbeat received',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          hardwareId: clientHardwareId,
          activationId: activation.id
        }
      });

      res.json({ success: true });
    } catch (error) {
      await ActivityLogger.log({
        type: 'api',
        action: 'Heartbeat error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({ success: false });
    }
  });

  app.post("/api/afyonlu/03panel/activations/:id/deactivate", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const activation = await licenseStorage.deactivateLicense(
        req.params.id,
        reason || "Admin tarafından deaktive edildi"
      );
      
      if (!activation) {
        await ActivityLogger.log({
          type: 'deactivation',
          action: 'License deactivation failed - not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { activationId: req.params.id, reason }
        });
        return res.status(404).json({ message: "Aktivasyon bulunamadı" });
      }

      await ActivityLogger.log({
        type: 'deactivation',
        action: 'License deactivated',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          activationId: activation.id,
          hardwareId: activation.hardwareId,
          machineName: activation.machineName,
          reason: reason || "Admin tarafından deaktive edildi"
        }
      });

      res.json({
        success: true,
        activation,
      });
    } catch (error) {
      console.error("Deaktivasyon hatası:", error);
      await ActivityLogger.log({
        type: 'deactivation',
        action: 'License deactivation error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { 
          activationId: req.params.id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      res.status(500).json({
        message: error instanceof Error ? error.message : "Deaktivasyon başarısız",
      });
    }
  });

  app.get("/api/license/check", async (req: Request, res: Response) => {
    try {
      const hardwareId = req.headers['x-hardware-id'] as string;
      
      // ✅ AFYONLUM: Development modda da lisans kontrolü yapılmalı
      // Hardware ID yoksa lisans geçersiz (web ortamında bile)
      if (!hardwareId) {
        // Development modda da lisans gerekli - valid: false döndür
        await ActivityLogger.log({
          type: 'api',
          action: 'License check - no hardware ID',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { mode: process.env.NODE_ENV }
        });
        // Lisans ekranı gösterilsin
        return res.json({
          valid: false,
          reason: 'Lisans doğrulaması gerekli',
          requiresLicense: true,
          userName: 'Afyonlum'
        });
      }

      const activation = await licenseStorage.getActivationByHardwareIdOnly(hardwareId);
      
      if (!activation || !activation.isActive) {
        await ActivityLogger.log({
          type: 'api',
          action: 'License check failed - no activation',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { hardwareId }
        });
        return res.json({
          valid: false,
          reason: 'Aktivasyon bulunamadı veya aktif değil'
        });
      }

      const license = await licenseStorage.getLicenseById(activation.licenseId);
      
      if (!license) {
        await ActivityLogger.log({
          type: 'api',
          action: 'License check failed - license not found',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'error',
          details: { hardwareId, activationId: activation.id }
        });
        return res.json({
          valid: false,
          reason: 'Lisans bulunamadı'
        });
      }

      if (license.isRevoked) {
        await ActivityLogger.log({
          type: 'api',
          action: 'License check failed - revoked',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: {
            hardwareId,
            licenseKey: license.licenseKey,
            customerName: license.customerName
          }
        });
        return res.json({
          valid: false,
          reason: 'Lisans iptal edilmiş'
        });
      }

      // ✅ DÜZELTME: 60 saniyelik grace period ekle (saat senkronizasyon sorunları için)
      if (license.expiresAt) {
        const now = new Date();
        const expiryDate = new Date(license.expiresAt);
        const gracePeriodMs = 60 * 1000; // 60 saniye grace period
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        
        if (now > expiryWithGrace) {
          await licenseStorage.expireLicense(license.id);
          await ActivityLogger.log({
            type: 'api',
            action: 'License check failed - expired',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'warning',
            details: {
              hardwareId,
              licenseKey: license.licenseKey,
              customerName: license.customerName,
              expiresAt: license.expiresAt,
              now: now.toISOString(),
              gracePeriodSeconds: 60
            }
          });
          return res.json({
            valid: false,
            reason: 'Lisans süresi dolmuş'
          });
        }
      }

      await ActivityLogger.log({
        type: 'api',
        action: 'License check successful',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          hardwareId,
          licenseKey: license.licenseKey,
          customerName: license.customerName,
          licenseType: license.licenseType
        }
      });

      res.json({
        valid: true,
        expiresAt: license.expiresAt,
        licenseType: license.licenseType,
        userName: license.customerName  // Lisanstan kullanıcı ismi
      });
    } catch (error) {
      console.error('Lisans kontrolü hatası:', error);
      await ActivityLogger.log({
        type: 'api',
        action: 'License check error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        valid: false,
        reason: 'Kontrol hatası'
      });
    }
  });

  app.get("/api/afyonlu/03panel/dashboard/stats", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const stats = await licenseStorage.getLicenseStats();
      const licenses = await licenseStorage.getAllLicenses();
      const activations = await licenseStorage.getActivations();

      const licensesByType = licenses.reduce((acc, license) => {
        acc[license.licenseType] = (acc[license.licenseType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const recentActivations = activations
        .sort((a, b) => new Date(b.activatedAt).getTime() - new Date(a.activatedAt).getTime())
        .slice(0, 10);

      await ActivityLogger.log({
        type: 'api',
        action: 'Dashboard stats retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: {
          totalLicenses: licenses.length,
          totalActivations: activations.length
        }
      });

      res.json({
        stats,
        licensesByType,
        recentActivations,
      });
    } catch (error) {
      console.error("Dashboard stats hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'Dashboard stats retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        message: "İstatistikler yüklenemedi",
      });
    }
  });

  // Sistem aktivite logları (ActivityLogger'dan - logs/activity.json)
  app.get("/api/afyonlu/03panel/activity-logs", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const typeFilter = req.query.type as string | undefined;
      const severityFilter = req.query.severity as string | undefined;
      
      // ActivityLogger'dan sistem loglarını al
      const logs = ActivityLogger.getLogs({
        type: typeFilter as any,
        severity: severityFilter as any,
        limit
      });
      
      await ActivityLogger.log({
        type: 'api',
        action: 'System activity logs retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { count: logs.length, limit, type: typeFilter || 'all', severity: severityFilter || 'all' }
      });
      
      res.json({
        success: true,
        logs
      });
    } catch (error) {
      console.error("System activity logs hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'System activity logs retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        message: "Sistem aktivite logları yüklenemedi"
      });
    }
  });

  // Kullanıcı aktiviteleri (LicenseStorage'dan - data/kayitlar.json)
  app.get("/api/afyonlu/03panel/user-activities", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const category = req.query.category as string | undefined;
      
      const logs = await licenseStorage.getActivityLogs(limit, category);
      
      await ActivityLogger.log({
        type: 'api',
        action: 'User activities retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { count: logs.length, limit, category: category || 'all' }
      });
      
      res.json({
        success: true,
        logs
      });
    } catch (error) {
      console.error("User activities hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'User activities retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        message: "Kullanıcı aktiviteleri yüklenemedi"
      });
    }
  });

  app.get("/api/afyonlu/03panel/activity-logs/license/:licenseId", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { licenseId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const logs = await licenseStorage.getActivityLogsByLicense(licenseId, limit);
      
      await ActivityLogger.log({
        type: 'api',
        action: 'License activity logs retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { licenseId, count: logs.length, limit }
      });
      
      res.json({
        success: true,
        logs
      });
    } catch (error) {
      console.error("License activity logs hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'License activity logs retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { 
          licenseId: req.params.licenseId,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      res.status(500).json({
        success: false,
        message: "Lisans aktivite logları yüklenemedi"
      });
    }
  });

  // Tüm kullanıcıları listele (ad-soyad bazında)
  app.get("/api/afyonlu/03panel/users", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const licenses = await licenseStorage.getAllLicenses();
      
      // Kullanıcıları unique customerName ve customerEmail'e göre grupla
      const usersMap = new Map<string, {
        customerName: string;
        customerEmail: string;
        licenseCount: number;
        activationCount: number;
        licenses: any[];
      }>();
      
      for (const license of licenses) {
        const key = `${license.customerName}-${license.customerEmail}`;
        if (!usersMap.has(key)) {
          usersMap.set(key, {
            customerName: license.customerName,
            customerEmail: license.customerEmail,
            licenseCount: 0,
            activationCount: 0,
            licenses: []
          });
        }
        
        const user = usersMap.get(key)!;
        user.licenseCount++;
        user.licenses.push(license);
        
        // Aktivasyon sayısını hesapla
        const activations = await licenseStorage.getActivationsByLicenseId(license.id);
        user.activationCount += activations.length;
      }
      
      const users = Array.from(usersMap.values());
      
      await ActivityLogger.log({
        type: 'api',
        action: 'Users list retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { count: users.length }
      });
      
      res.json({
        success: true,
        users
      });
    } catch (error) {
      console.error("Users list hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'Users list retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        message: "Kullanıcı listesi yüklenemedi"
      });
    }
  });

  // Belirli bir kullanıcının tüm aktivitelerini getir
  app.get("/api/afyonlu/03panel/users/:customerEmail/activities", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { customerEmail } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Önce bu kullanıcının tüm lisanslarını bul
      const licenses = await licenseStorage.getAllLicenses();
      const userLicenses = licenses.filter(l => l.customerEmail === customerEmail);
      
      if (userLicenses.length === 0) {
        return res.json({
          success: true,
          activities: []
        });
      }
      
      // Her lisansın aktivitelerini topla
      const allActivities: any[] = [];
      for (const license of userLicenses) {
        const activities = await licenseStorage.getActivityLogsByLicense(license.id, limit);
        allActivities.push(...activities);
      }
      
      // Tarihe göre sırala (en yeni önce)
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Limit uygula
      const limitedActivities = allActivities.slice(0, limit);
      
      await ActivityLogger.log({
        type: 'api',
        action: 'User activities retrieved',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { customerEmail, count: limitedActivities.length, limit }
      });
      
      res.json({
        success: true,
        activities: limitedActivities
      });
    } catch (error) {
      console.error("User activities hatası:", error);
      await ActivityLogger.log({
        type: 'api',
        action: 'User activities retrieval failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { 
          customerEmail: req.params.customerEmail,
          error: error instanceof Error ? error.message : String(error)
        }
      });
      res.status(500).json({
        success: false,
        message: "Kullanıcı aktiviteleri yüklenemedi"
      });
    }
  });

  // ✅ TEK KULLANIMLIK LİSANS SİSTEMİ - Hardware binding ile sunucu kontrolü
  // Bu endpoint lisansın daha önce farklı bir PC'de kullanılıp kullanılmadığını kontrol eder
  app.post("/api/licenses/single-use-check", async (req: Request, res: Response) => {
    try {
      const { licenseKey, hardwareFingerprint, machineName } = req.body;
      
      if (!licenseKey || !hardwareFingerprint) {
        return res.status(400).json({
          success: false,
          allowed: false,
          reason: "Lisans anahtarı ve donanım parmak izi gerekli"
        });
      }
      
      // ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
      const singleUsePath = path.join(getDataDir(), 'single-use-licenses.json');
      
      // Mevcut kayıtları oku
      let singleUseData: Record<string, { hardwareFingerprint: string; machineName: string; activatedAt: string }> = {};
      
      try {
        if (require('fs').existsSync(singleUsePath)) {
          const fileContent = require('fs').readFileSync(singleUsePath, 'utf-8');
          singleUseData = JSON.parse(fileContent);
        }
      } catch (readError) {
        console.warn('⚠️  Single-use dosyası okunamadı, yeni oluşturulacak');
      }
      
      const normalizedKey = licenseKey.trim().toUpperCase();
      
      // Bu lisans daha önce kullanılmış mı kontrol et
      if (singleUseData[normalizedKey]) {
        const existingRecord = singleUseData[normalizedKey];
        
        // Aynı donanım mı kontrol et
        if (existingRecord.hardwareFingerprint === hardwareFingerprint) {
          // Aynı PC - izin ver
          console.log(`✅ Lisans zaten bu PC'de aktif: ${normalizedKey.substring(0, 10)}...`);
          
          await ActivityLogger.log({
            type: 'license',
            action: 'Single-use check - same hardware (allowed)',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'info',
            details: { 
              licenseKey: normalizedKey.substring(0, 10) + '...',
              machineName: machineName || 'Unknown'
            }
          });
          
          return res.json({
            success: true,
            allowed: true,
            reason: "Bu lisans zaten bu bilgisayarda aktif"
          });
        } else {
          // FARKLI PC - REDDETİ!
          console.warn(`🚫 TEK KULLANIMLIK LİSANS REDDEDİLDİ: ${normalizedKey.substring(0, 10)}...`);
          console.warn(`   Orijinal PC: ${existingRecord.machineName}`);
          console.warn(`   Yeni PC girişimi: ${machineName || 'Unknown'}`);
          
          await ActivityLogger.log({
            type: 'license',
            action: 'Single-use check - different hardware (REJECTED)',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'critical',
            details: { 
              licenseKey: normalizedKey.substring(0, 10) + '...',
              originalMachine: existingRecord.machineName,
              attemptedMachine: machineName || 'Unknown',
              originalFingerprint: existingRecord.hardwareFingerprint.substring(0, 16) + '...',
              attemptedFingerprint: hardwareFingerprint.substring(0, 16) + '...'
            }
          });
          
          // Discord webhook ile bildir
          discordWebhook.sendSystemAlert(
            'Tek Kullanımlık Lisans Reddedildi',
            `Lisans: ${normalizedKey.substring(0, 10)}...\nOrijinal PC: ${existingRecord.machineName}\nYeni PC Girişimi: ${machineName || 'Unknown'}\nIP: ${req.ip}`,
            'error'
          ).catch(() => {});
          
          return res.status(403).json({
            success: false,
            allowed: false,
            reason: `Bu lisans zaten başka bir bilgisayarda kullanılmış (${existingRecord.machineName}). Tek kullanımlık lisanslar farklı PC'lerde kullanılamaz.`,
            originalMachine: existingRecord.machineName,
            activatedAt: existingRecord.activatedAt
          });
        }
      }
      
      // İlk aktivasyon - kaydet
      singleUseData[normalizedKey] = {
        hardwareFingerprint: hardwareFingerprint,
        machineName: machineName || 'Unknown',
        activatedAt: new Date().toISOString()
      };
      
      // Dosyayı güncelle
      try {
        const dataDir = path.dirname(singleUsePath);
        if (!require('fs').existsSync(dataDir)) {
          require('fs').mkdirSync(dataDir, { recursive: true });
        }
        require('fs').writeFileSync(singleUsePath, JSON.stringify(singleUseData, null, 2), 'utf-8');
        console.log(`✅ Tek kullanımlık lisans kaydedildi: ${normalizedKey.substring(0, 10)}... -> ${machineName || 'Unknown'}`);
      } catch (writeError) {
        console.error('❌ Single-use kayıt hatası:', writeError);
      }
      
      await ActivityLogger.log({
        type: 'license',
        action: 'Single-use license activated (first use)',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'info',
        details: { 
          licenseKey: normalizedKey.substring(0, 10) + '...',
          machineName: machineName || 'Unknown',
          hardwareFingerprint: hardwareFingerprint.substring(0, 16) + '...'
        }
      });
      
      return res.json({
        success: true,
        allowed: true,
        reason: "Lisans ilk kez aktive edildi ve bu bilgisayara bağlandı"
      });
      
    } catch (error) {
      console.error("Single-use check hatası:", error);
      await ActivityLogger.log({
        type: 'license',
        action: 'Single-use check error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      
      // Hata durumunda güvenli tarafta kal - izin ver (offline çalışabilsin)
      return res.json({
        success: true,
        allowed: true,
        reason: "Sunucu hatası - offline mod izni verildi"
      });
    }
  });

  // ✅ KRITIK: Admin şifre değiştirme endpoint'i (.exe kullanıcıları için)
  app.post("/api/afyonlu/03panel/change-password", adminAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        await ActivityLogger.log({
          type: 'admin',
          action: 'Password change failed - missing fields',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
        });
        return res.status(400).json({
          success: false,
          message: 'Mevcut şifre ve yeni şifre gerekli'
        });
      }

      // Şifre değiştirme fonksiyonunu çağır
      const { updateAdminPassword } = await import('./admin-auth');
      const result = await updateAdminPassword(currentPassword, newPassword);
      
      if (result.success) {
        console.log(`✅ Admin şifresi değiştirildi: ${req.ip}`);
        await ActivityLogger.log({
          type: 'admin',
          action: 'Admin password changed successfully',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'info',
          details: { timestamp: new Date().toISOString() }
        });
      } else {
        console.warn(`❌ Şifre değiştirme başarısız: ${req.ip} - ${result.message}`);
        await ActivityLogger.log({
          type: 'admin',
          action: 'Password change failed',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'warning',
          details: { reason: result.message }
        });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Şifre değiştirme hatası:", error);
      await ActivityLogger.log({
        type: 'admin',
        action: 'Password change error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'error',
        details: { error: error instanceof Error ? error.message : String(error) }
      });
      res.status(500).json({
        success: false,
        message: "Şifre değiştirilirken bir hata oluştu"
      });
    }
  });
}
