import crypto from 'crypto';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface HardwareInfo {
  hardwareId: string;
  machineName: string;
  operatingSystem: string;
  cpuInfo: string;
  totalRam: string;
  platform: string;
  architecture: string;
  macAddresses: string[];
}

export class HardwareIdentifier {
  async getHardwareId(): Promise<string> {
    const components: string[] = [];
    
    components.push(os.hostname());
    components.push(os.platform());
    components.push(os.arch());
    
    const cpus = os.cpus();
    if (cpus.length > 0) {
      components.push(cpus[0].model);
    }
    
    const networkInterfaces = os.networkInterfaces();
    const macAddresses: string[] = [];
    for (const [, addresses] of Object.entries(networkInterfaces)) {
      if (addresses) {
        for (const addr of addresses) {
          if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
            macAddresses.push(addr.mac);
          }
        }
      }
    }
    components.push(...macAddresses.sort());
    
    const fingerprint = components.join('|');
    const hardwareId = crypto.createHash('sha256')
      .update(fingerprint)
      .digest('hex')
      .substring(0, 32);
    
    return hardwareId.toUpperCase();
  }

  async getDetailedHardwareInfo(): Promise<HardwareInfo> {
    const hardwareId = await this.getHardwareId();
    const machineName = os.hostname();
    const operatingSystem = `${os.type()} ${os.release()} (${os.platform()})`;
    
    const cpus = os.cpus();
    const cpuInfo = cpus.length > 0 
      ? `${cpus[0].model} (${cpus.length} çekirdek)` 
      : 'Bilinmiyor';
    
    const totalRam = `${(os.totalmem() / (1024 ** 3)).toFixed(2)} GB`;
    
    const networkInterfaces = os.networkInterfaces();
    const macAddresses: string[] = [];
    for (const [, addresses] of Object.entries(networkInterfaces)) {
      if (addresses) {
        for (const addr of addresses) {
          if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
            macAddresses.push(addr.mac);
          }
        }
      }
    }
    
    return {
      hardwareId,
      machineName,
      operatingSystem,
      cpuInfo,
      totalRam,
      platform: os.platform(),
      architecture: os.arch(),
      macAddresses: macAddresses.sort()
    };
  }

  compareHardwareIds(id1: string, id2: string): boolean {
    return id1.toUpperCase() === id2.toUpperCase();
  }

  async getSystemFingerprint(): Promise<string> {
    const info = await this.getDetailedHardwareInfo();
    return `${info.hardwareId}-${info.platform}-${info.architecture}`;
  }

  isLicenseValid(expectedHardwareId: string, actualHardwareId: string, tolerance: number = 0): boolean {
    if (expectedHardwareId === actualHardwareId) {
      return true;
    }
    
    if (tolerance > 0) {
      const expected = expectedHardwareId.toLowerCase();
      const actual = actualHardwareId.toLowerCase();
      
      let matchingChars = 0;
      const minLength = Math.min(expected.length, actual.length);
      
      for (let i = 0; i < minLength; i++) {
        if (expected[i] === actual[i]) {
          matchingChars++;
        }
      }
      
      const similarity = matchingChars / expected.length;
      return similarity >= (1 - tolerance / 100);
    }
    
    return false;
  }
}

export const hardwareId = new HardwareIdentifier();
