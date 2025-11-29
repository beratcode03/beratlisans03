import { licenseStorage } from "./license-storage";

export class LicenseScheduler {
  private checkInterval: NodeJS.Timeout | null = null;

  start() {
    this.checkExpiredLicenses();
    
    this.checkInterval = setInterval(() => {
      this.checkExpiredLicenses();
    }, 60000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkExpiredLicenses() {
    try {
      const expiredLicenses = await licenseStorage.checkExpiredLicenses();
      
      if (expiredLicenses.length > 0) {
        for (const license of expiredLicenses) {
          await licenseStorage.getActivationsByLicenseId(license.id);
        }
      }
    } catch (error) {}
  }

  async checkLicenseStatus(licenseId: string): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    try {
      const license = await licenseStorage.getLicenseById(licenseId);
      
      if (!license) {
        return { isValid: false, reason: 'Lisans bulunamadı' };
      }

      if (license.isRevoked) {
        return { isValid: false, reason: 'Lisans iptal edilmiş' };
      }

      if (license.expiresAt) {
        const now = new Date();
        const expiryDate = new Date(license.expiresAt);
        const gracePeriodMs = 60 * 1000;
        const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
        
        if (now > expiryWithGrace) {
          await licenseStorage.expireLicense(licenseId);
          
          return { isValid: false, reason: 'Lisans süresi dolmuş' };
        }
      }

      if (!license.isActive) {
        return { isValid: false, reason: 'Lisans aktif değil' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, reason: 'Kontrol hatası' };
    }
  }
}

export const licenseScheduler = new LicenseScheduler();
