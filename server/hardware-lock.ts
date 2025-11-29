import crypto from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface HardwareFingerprint {
  cpuId: string;
  cpuModel: string;
  cpuCores: number;
  totalRam: string;
  motherboardId: string;
  macAddresses: string[];
  osType: string;
  osRelease: string;
  hostname: string;
  fingerprint: string;
  fingerprintComponents: string[];
}

export interface HardwareTolerance {
  toleranceScore: number;
  maxToleranceScore: number;
  isWithinTolerance: boolean;
  changedComponents: string[];
}

export class HardwareLock {
  private static TOLERANCE_WEIGHTS = {
    cpu: 40,
    motherboard: 30,
    ram: 15,
    mac: 15,
  };

  static async getHardwareFingerprint(): Promise<HardwareFingerprint> {
    const cpuInfo = this.getCPUInfo();
    const ramInfo = this.getRAMInfo();
    const macAddresses = this.getMACAddresses();
    const motherboardId = await this.getMotherboardId();
    const osInfo = this.getOSInfo();

    const components = [
      `CPU:${cpuInfo.model}:${cpuInfo.cores}`,
      `MB:${motherboardId}`,
      `RAM:${ramInfo}`,
      `MAC:${macAddresses.sort().join(',')}`,
    ];

    const fingerprint = this.generateFingerprint(components);

    return {
      cpuId: cpuInfo.id,
      cpuModel: cpuInfo.model,
      cpuCores: cpuInfo.cores,
      totalRam: ramInfo,
      motherboardId,
      macAddresses,
      osType: osInfo.type,
      osRelease: osInfo.release,
      hostname: os.hostname(),
      fingerprint,
      fingerprintComponents: components,
    };
  }

  private static getCPUInfo(): { id: string; model: string; cores: number } {
    const cpus = os.cpus();
    const model = cpus[0]?.model || 'Unknown';
    const cores = cpus.length;
    
    const cpuHash = crypto
      .createHash('sha256')
      .update(model + cores.toString())
      .digest('hex')
      .substring(0, 16);

    return {
      id: cpuHash,
      model,
      cores,
    };
  }

  private static getRAMInfo(): string {
    const totalMemBytes = os.totalmem();
    const totalMemGB = Math.floor(totalMemBytes / (1024 * 1024 * 1024));
    return `${totalMemGB}GB`;
  }

  private static getMACAddresses(): string[] {
    const networkInterfaces = os.networkInterfaces();
    const macAddresses: string[] = [];

    for (const name of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[name];
      if (interfaces) {
        for (const iface of interfaces) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddresses.push(iface.mac);
          }
        }
      }
    }

    return [...new Set(macAddresses)];
  }

  private static async getMotherboardId(): Promise<string> {
    try {
      // Windows-only uygulama
      const { stdout } = await execAsync('wmic baseboard get serialnumber');
      const lines = stdout.split('\n').filter(line => line.trim());
      const serialNumber = lines[1]?.trim() || 'Unknown';
      return serialNumber !== 'SerialNumber' ? serialNumber : this.getFallbackMotherboardId();
    } catch (error) {
      console.warn('Anakart ID alinamadi, fallback kullaniliyor:', error);
      return this.getFallbackMotherboardId();
    }
  }

  private static getFallbackMotherboardId(): string {
    const cpuInfo = this.getCPUInfo();
    const hostname = os.hostname();
    const platform = os.platform();
    
    const fallbackData = `${platform}-${hostname}-${cpuInfo.model}`;
    return crypto
      .createHash('sha256')
      .update(fallbackData)
      .digest('hex')
      .substring(0, 16);
  }

  private static getOSInfo(): { type: string; release: string } {
    return {
      type: os.type(),
      release: os.release(),
    };
  }

  private static generateFingerprint(components: string[]): string {
    const combined = components.join('|');
    return crypto
      .createHash('sha256')
      .update(combined)
      .digest('hex');
  }

  static compareFingerprints(
    original: HardwareFingerprint,
    current: HardwareFingerprint
  ): HardwareTolerance {
    let toleranceScore = 0;
    const maxToleranceScore = 100;
    const changedComponents: string[] = [];

    if (original.cpuModel !== current.cpuModel || original.cpuCores !== current.cpuCores) {
      toleranceScore += this.TOLERANCE_WEIGHTS.cpu;
      changedComponents.push('CPU');
    }

    if (original.motherboardId !== current.motherboardId) {
      toleranceScore += this.TOLERANCE_WEIGHTS.motherboard;
      changedComponents.push('Motherboard');
    }

    if (original.totalRam !== current.totalRam) {
      toleranceScore += this.TOLERANCE_WEIGHTS.ram;
      changedComponents.push('RAM');
    }

    const originalMacs = new Set(original.macAddresses);
    const currentMacs = new Set(current.macAddresses);
    const commonMacs = [...originalMacs].filter(mac => currentMacs.has(mac));
    
    if (commonMacs.length === 0) {
      toleranceScore += this.TOLERANCE_WEIGHTS.mac;
      changedComponents.push('Network');
    }

    const isWithinTolerance = toleranceScore <= 30;

    return {
      toleranceScore,
      maxToleranceScore,
      isWithinTolerance,
      changedComponents,
    };
  }

  static generateHardwareId(fingerprint: HardwareFingerprint): string {
    return fingerprint.fingerprint;
  }

  static async validateHardwareLock(
    storedHardwareId: string,
    storedHardwareData?: string
  ): Promise<{
    isValid: boolean;
    currentFingerprint: HardwareFingerprint;
    tolerance?: HardwareTolerance;
    reason?: string;
  }> {
    const currentFingerprint = await this.getHardwareFingerprint();
    const currentHardwareId = this.generateHardwareId(currentFingerprint);

    if (storedHardwareId === currentHardwareId) {
      return {
        isValid: true,
        currentFingerprint,
      };
    }

    if (storedHardwareData) {
      try {
        const storedFingerprint: HardwareFingerprint = JSON.parse(storedHardwareData);
        const tolerance = this.compareFingerprints(storedFingerprint, currentFingerprint);

        if (tolerance.isWithinTolerance) {
          return {
            isValid: true,
            currentFingerprint,
            tolerance,
            reason: `Donanım değişikliği tespit edildi ancak tolerans dahilinde: ${tolerance.changedComponents.join(', ')}`,
          };
        } else {
          return {
            isValid: false,
            currentFingerprint,
            tolerance,
            reason: `Önemli donanım değişikliği tespit edildi: ${tolerance.changedComponents.join(', ')} (Skor: ${tolerance.toleranceScore}/${tolerance.maxToleranceScore})`,
          };
        }
      } catch (error) {
        console.error('⚠️  Donanım verileri parse edilemedi:', error);
      }
    }

    return {
      isValid: false,
      currentFingerprint,
      reason: 'Donanım ID eşleşmiyor',
    };
  }

  static obfuscateHardwareId(hardwareId: string): string {
    return hardwareId.substring(0, 8) + '...' + hardwareId.substring(hardwareId.length - 8);
  }

  static getDetailedHardwareInfo(): {
    system: any;
    cpu: any;
    memory: any;
    network: any;
  } {
    const cpus = os.cpus();
    const networkInterfaces = os.networkInterfaces();

    return {
      system: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        version: os.version(),
        hostname: os.hostname(),
        arch: os.arch(),
        uptime: os.uptime(),
      },
      cpu: {
        model: cpus[0]?.model,
        speed: cpus[0]?.speed,
        cores: cpus.length,
        endianness: os.endianness(),
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        totalGB: Math.floor(os.totalmem() / (1024 * 1024 * 1024)),
        freeGB: Math.floor(os.freemem() / (1024 * 1024 * 1024)),
      },
      network: {
        interfaces: Object.keys(networkInterfaces).map(name => ({
          name,
          addresses: networkInterfaces[name]?.map(iface => ({
            address: iface.address,
            family: iface.family,
            mac: iface.mac,
            internal: iface.internal,
          })),
        })),
      },
    };
  }
}

export const hardwareLock = HardwareLock;
