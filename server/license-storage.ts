import { type License, type InsertLicense, type Activation, type InsertActivation, type LicenseCheckpoint, type InsertLicenseCheckpoint, type ActivityLog, type InsertActivityLog, licenses, activations, licenseCheckpoints } from "@shared/sema";
import { randomUUID } from "crypto";
import { promises as fs, readFileSync, existsSync } from "fs";
import path from "path";
import { encryption } from "./encryption";
import { getDataDir } from "./path-resolver";

// ✅ DÜZELTME: path-resolver kullan (paketlenmiş uygulamada doğru yol)
const DATA_FILE = path.join(getDataDir(), 'licenses.json');

interface LicenseData {
  licenses: License[];
  activations: Activation[];
  checkpoints: LicenseCheckpoint[];
  activityLogs: ActivityLog[];
}

class LicenseStorage {
  private data: LicenseData = {
    licenses: [],
    activations: [],
    checkpoints: [],
    activityLogs: []
  };

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      if (existsSync(DATA_FILE)) {
        const fileContent = readFileSync(DATA_FILE, 'utf-8');
        
        let decrypted: string;
        try {
          decrypted = encryption.decrypt(fileContent);
        } catch (decryptError) {
          try {
            const parsed = JSON.parse(fileContent);
            this.data = {
              licenses: parsed.licenses || [],
              activations: parsed.activations || [],
              checkpoints: parsed.checkpoints || [],
              activityLogs: parsed.activityLogs || []
            };
            this.saveData().catch(() => {});
            return;
          } catch (parseError) {
            this.data = {
              licenses: [],
              activations: [],
              checkpoints: [],
              activityLogs: []
            };
            this.saveData().catch(() => {});
            return;
          }
        }
        
        const parsed = JSON.parse(decrypted);
        this.data = {
          licenses: parsed.licenses || [],
          activations: parsed.activations || [],
          checkpoints: parsed.checkpoints || [],
          activityLogs: parsed.activityLogs || []
        };
      } else {
        this.data = {
          licenses: [],
          activations: [],
          checkpoints: [],
          activityLogs: []
        };
        this.saveData();
      }
    } catch (error) {
      this.data = {
        licenses: [],
        activations: [],
        checkpoints: [],
        activityLogs: []
      };
      this.saveData().catch(() => {});
    }
  }

  private async saveData() {
    try {
      const dataDir = path.dirname(DATA_FILE);
      if (!existsSync(dataDir)) {
        await fs.mkdir(dataDir, { recursive: true });
      }
      
      const jsonData = JSON.stringify(this.data, null, 2);
      const encrypted = encryption.encrypt(jsonData);
      await fs.writeFile(DATA_FILE, encrypted, 'utf-8');
    } catch (error) {
      throw error;
    }
  }

  async createLicense(licenseData: InsertLicense): Promise<License> {
    const license: License = {
      id: randomUUID(),
      licenseKey: licenseData.licenseKey,
      customerName: licenseData.customerName,
      customerEmail: licenseData.customerEmail,
      
      // Lisansa özel kullanıcı bilgileri
      userFullName: licenseData.userFullName || null,
      
      // Lisansa özel email konfigürasyonu
      emailUser: licenseData.emailUser || null,
      emailPass: licenseData.emailPass || null,
      emailFrom: licenseData.emailFrom || null,
      
      // Lisansa özel API anahtarları
      openweatherApiKey: licenseData.openweatherApiKey || null,
      
      licenseType: licenseData.licenseType,
      maxActivations: licenseData.maxActivations,
      currentActivations: 0,
      isActive: true,
      isRevoked: false,
      revokedReason: null,
      revokedAt: null,
      expiresAt: licenseData.expiresAt || null,
      features: licenseData.features || null,
      notes: licenseData.notes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.data.licenses.push(license);
    await this.saveData();

    await this.createCheckpoint({
      licenseId: license.id,
      action: 'created',
      details: `Lisans oluşturuldu: ${license.customerName} (${license.licenseType})`,
    });

    return license;
  }

  async getLicenses(): Promise<License[]> {
    return this.data.licenses.filter(l => !l.isRevoked);
  }

  async getAllLicenses(): Promise<License[]> {
    return this.data.licenses;
  }

  async getLicenseById(id: string): Promise<License | undefined> {
    return this.data.licenses.find(l => l.id === id);
  }

  async getLicenseByKey(licenseKey: string): Promise<License | undefined> {
    return this.data.licenses.find(l => l.licenseKey === licenseKey);
  }

  async updateLicense(id: string, updates: Partial<InsertLicense>): Promise<License | undefined> {
    const index = this.data.licenses.findIndex(l => l.id === id);
    if (index === -1) return undefined;

    const currentLicense = this.data.licenses[index];
    this.data.licenses[index] = {
      ...currentLicense,
      ...updates,
      updatedAt: new Date(),
    } as License;

    await this.saveData();
    return this.data.licenses[index];
  }

  async expireLicense(id: string): Promise<License | undefined> {
    const index = this.data.licenses.findIndex(l => l.id === id);
    if (index === -1) return undefined;

    this.data.licenses[index] = {
      ...this.data.licenses[index],
      isActive: false,
      currentActivations: 0,
      updatedAt: new Date(),
    };

    const activeActivations = this.data.activations.filter(
      a => a.licenseId === id && a.isActive
    );
    
    for (const activation of activeActivations) {
      await this.deactivateLicense(activation.id, 'Lisans süresi doldu');
    }

    await this.saveData();

    await this.createCheckpoint({
      licenseId: id,
      action: 'expired',
      details: `Lisans süresi doldu - ${activeActivations.length} aktivasyon kapatıldı`,
    });

    return this.data.licenses[index];
  }

  async revokeLicense(id: string, reason: string): Promise<License | undefined> {
    const index = this.data.licenses.findIndex(l => l.id === id);
    if (index === -1) return undefined;

    this.data.licenses[index] = {
      ...this.data.licenses[index],
      isRevoked: true,
      isActive: false,
      revokedReason: reason,
      revokedAt: new Date().toISOString(),
      updatedAt: new Date(),
    };

    await this.saveData();

    await this.createCheckpoint({
      licenseId: id,
      action: 'revoked',
      details: `Lisans iptal edildi: ${reason}`,
    });

    const activeActivations = this.data.activations.filter(
      a => a.licenseId === id && a.isActive
    );
    for (const activation of activeActivations) {
      await this.deactivateLicense(activation.id, 'Lisans iptal edildi');
    }

    return this.data.licenses[index];
  }

  async createActivation(activationData: InsertActivation): Promise<Activation> {
    const license = await this.getLicenseById(activationData.licenseId);
    if (!license) {
      throw new Error('Lisans bulunamadı');
    }

    if (license.isRevoked) {
      throw new Error('Bu lisans iptal edilmiş');
    }

    // ✅ DÜZELTME: 60 saniyelik grace period ekle (saat senkronizasyon sorunları için)
    if (license.expiresAt) {
      const now = new Date();
      const expiryDate = new Date(license.expiresAt);
      const gracePeriodMs = 60 * 1000; // 60 saniye grace period
      const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
      
      if (now > expiryWithGrace) {
        throw new Error('Lisans süresi dolmuş');
      }
    }

    const activeActivationsForLicense = this.data.activations.filter(
      a => a.licenseId === activationData.licenseId && a.isActive
    );

    const existingActivation = activeActivationsForLicense.find(
      a => a.hardwareId === activationData.hardwareId
    );

    if (existingActivation) {
      existingActivation.lastHeartbeat = new Date().toISOString();
      await this.saveData();
      
      await this.createCheckpoint({
        licenseId: activationData.licenseId,
        activationId: existingActivation.id,
        action: 'heartbeat',
        details: `Heartbeat: ${existingActivation.machineName || 'Bilinmeyen PC'}`,
        ipAddress: activationData.ipAddress,
      });
      
      return existingActivation;
    }

    if (activeActivationsForLicense.length >= license.maxActivations) {
      const activatedMachines = activeActivationsForLicense
        .map(a => a.machineName || a.hardwareId.substring(0, 8))
        .join(', ');
      throw new Error(`Bu lisans maksimum ${license.maxActivations} cihazda aktif olabilir. Aktif cihazlar: ${activatedMachines}`);
    }

    const hardwareAlreadyUsed = this.data.activations.find(
      a => a.hardwareId === activationData.hardwareId && a.isActive
    );
    
    if (hardwareAlreadyUsed && hardwareAlreadyUsed.licenseId !== activationData.licenseId) {
      throw new Error(`Bu cihaz başka bir lisansla aktif. Önce diğer lisansı deaktive edin.`);
    }

    const activation: Activation = {
      id: randomUUID(),
      licenseId: activationData.licenseId,
      hardwareId: activationData.hardwareId,
      machineName: activationData.machineName || null,
      operatingSystem: activationData.operatingSystem || null,
      cpuInfo: activationData.cpuInfo || null,
      totalRam: activationData.totalRam || null,
      macAddress: activationData.macAddress || null,
      ipAddress: activationData.ipAddress || null,
      location: activationData.location || null,
      isActive: true,
      deactivatedAt: null,
      deactivatedReason: null,
      lastHeartbeat: new Date().toISOString(),
      activatedAt: new Date(),
      createdAt: new Date(),
    };

    this.data.activations.push(activation);

    // Aktivasyon sayısını güncelle - yeni aktivasyon da dahil
    const licenseIndex = this.data.licenses.findIndex(l => l.id === activationData.licenseId);
    if (licenseIndex !== -1) {
      // Güncel aktif aktivasyon sayısını hesapla (yeni eklenen de dahil)
      const updatedActiveCount = this.data.activations.filter(
        a => a.licenseId === activationData.licenseId && a.isActive
      ).length;
      this.data.licenses[licenseIndex].currentActivations = updatedActiveCount;
    }

    await this.saveData();

    await this.createCheckpoint({
      licenseId: activationData.licenseId,
      activationId: activation.id,
      action: 'activated',
      details: `Yeni aktivasyon: ${activationData.machineName || 'Bilinmeyen'} (${activationData.hardwareId})`,
      ipAddress: activationData.ipAddress,
    });

    return activation;
  }

  async getActivations(): Promise<Activation[]> {
    return this.data.activations.filter(a => a.isActive);
  }

  async getActivationsByLicenseId(licenseId: string): Promise<Activation[]> {
    return this.data.activations.filter(a => a.licenseId === licenseId);
  }

  async getActivationByHardwareId(licenseId: string, hardwareId: string): Promise<Activation | undefined> {
    return this.data.activations.find(
      a => a.licenseId === licenseId && a.hardwareId === hardwareId && a.isActive
    );
  }

  async getActivationByHardwareIdOnly(hardwareId: string): Promise<Activation | undefined> {
    return this.data.activations.find(
      a => a.hardwareId === hardwareId && a.isActive
    );
  }

  async deactivateLicense(activationId: string, reason: string): Promise<Activation | undefined> {
    const index = this.data.activations.findIndex(a => a.id === activationId);
    if (index === -1) return undefined;

    const activation = this.data.activations[index];
    this.data.activations[index] = {
      ...activation,
      isActive: false,
      deactivatedAt: new Date().toISOString(),
      deactivatedReason: reason,
    };

    const license = await this.getLicenseById(activation.licenseId);
    if (license) {
      const licenseIndex = this.data.licenses.findIndex(l => l.id === activation.licenseId);
      if (licenseIndex !== -1) {
        // Güncel aktif aktivasyon sayısını hesapla (deaktive edilen hariç)
        const updatedActiveCount = this.data.activations.filter(
          a => a.licenseId === activation.licenseId && a.isActive
        ).length;
        this.data.licenses[licenseIndex].currentActivations = updatedActiveCount;
      }
    }

    await this.saveData();

    await this.createCheckpoint({
      licenseId: activation.licenseId,
      activationId: activationId,
      action: 'deactivated',
      details: `Aktivasyon kaldırıldı: ${reason}`,
    });

    return this.data.activations[index];
  }

  async updateHeartbeat(activationId: string): Promise<boolean> {
    const index = this.data.activations.findIndex(a => a.id === activationId);
    if (index === -1) return false;

    this.data.activations[index].lastHeartbeat = new Date().toISOString();
    await this.saveData();

    return true;
  }

  async createCheckpoint(checkpointData: InsertLicenseCheckpoint): Promise<LicenseCheckpoint> {
    const checkpoint: LicenseCheckpoint = {
      id: randomUUID(),
      licenseId: checkpointData.licenseId,
      activationId: checkpointData.activationId || null,
      action: checkpointData.action,
      details: checkpointData.details || null,
      ipAddress: checkpointData.ipAddress || null,
      userAgent: checkpointData.userAgent || null,
      createdAt: new Date(),
    };

    this.data.checkpoints.push(checkpoint);
    await this.saveData();

    return checkpoint;
  }

  async getCheckpointsByLicenseId(licenseId: string): Promise<LicenseCheckpoint[]> {
    return this.data.checkpoints
      .filter(c => c.licenseId === licenseId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getLicenseStats(): Promise<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
    totalActivations: number;
  }> {
    const now = new Date();
    const gracePeriodMs = 60 * 1000; // 60 saniye grace period
    
    const total = this.data.licenses.length;
    const revoked = this.data.licenses.filter(l => l.isRevoked).length;
    // ✅ DÜZELTME: Grace period ile expire kontrolü
    const expired = this.data.licenses.filter(
      l => {
        if (!l.expiresAt || l.isRevoked) return false;
        const expiryDate = new Date(l.expiresAt);
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        return now > expiryWithGrace;
      }
    ).length;
    const active = total - revoked - expired;
    const totalActivations = this.data.activations.filter(a => a.isActive).length;

    return {
      total,
      active,
      revoked,
      expired,
      totalActivations,
    };
  }

  async checkExpiredLicenses(): Promise<License[]> {
    const now = new Date();
    // ✅ DÜZELTME: 60 saniyelik grace period ekle (zaman senkronizasyonu sorunları için)
    const gracePeriodMs = 60 * 1000; // 60 saniye
    
    const expiredLicenses = this.data.licenses.filter(
      l => {
        if (!l.expiresAt || l.isRevoked || !l.isActive) return false;
        
        const expiryDate = new Date(l.expiresAt);
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        
        return now > expiryWithGrace;
      }
    );

    for (const license of expiredLicenses) {
      console.log(`⏰ Lisans süresi doldu: ${license.customerName} - ${license.expiresAt}`);
      await this.expireLicense(license.id);
    }

    return expiredLicenses;
  }

  async logActivity(logData: InsertActivityLog, ipAddress?: string, userAgent?: string): Promise<ActivityLog> {
    const activityLog: ActivityLog = {
      id: randomUUID(),
      action: logData.action,
      category: logData.category,
      userId: logData.userId || null,
      targetId: logData.targetId || null,
      targetType: logData.targetType || null,
      details: logData.details || null,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      severity: logData.severity || 'info',
      createdAt: new Date(),
    };

    if (!this.data.activityLogs) {
      this.data.activityLogs = [];
    }

    this.data.activityLogs.push(activityLog);
    
    if (this.data.activityLogs.length > 10000) {
      this.data.activityLogs = this.data.activityLogs.slice(-5000);
    }

    await this.saveData();

    return activityLog;
  }

  async getActivityLogs(limit: number = 100, category?: string): Promise<ActivityLog[]> {
    let logs = this.data.activityLogs || [];
    
    if (category) {
      logs = logs.filter(log => log.category === category);
    }

    return logs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getActivityLogsByUser(userId: string, limit: number = 50): Promise<ActivityLog[]> {
    return (this.data.activityLogs || [])
      .filter(log => log.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getActivityLogsByLicense(licenseId: string, limit: number = 50): Promise<ActivityLog[]> {
    return (this.data.activityLogs || [])
      .filter(log => log.targetId === licenseId && log.targetType === 'license')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

export const licenseStorage = new LicenseStorage();
