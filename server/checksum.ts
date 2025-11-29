import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

export interface FileChecksum {
  path: string;
  checksum: string;
  size: number;
  modified: Date;
}

export interface ChecksumReport {
  timestamp: Date;
  totalFiles: number;
  totalSize: number;
  files: FileChecksum[];
  overallChecksum: string;
}

export class ChecksumValidator {
  private static async calculateFileChecksum(filePath: string): Promise<string> {
    const fileBuffer = await readFileAsync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  static async generateChecksums(directory: string, ignorePatterns: string[] = []): Promise<ChecksumReport> {
    const files: FileChecksum[] = [];
    let totalSize = 0;

    const defaultIgnore = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.cache',
      'data',
      'logs',
      '.env',
      '.env.local',
      'keys',
      'attached_assets',
    ];

    const allIgnorePatterns = [...defaultIgnore, ...ignorePatterns];

    async function scanDirectory(dir: string) {
      const entries = await readdirAsync(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(directory, fullPath);

        if (allIgnorePatterns.some((pattern) => relativePath.includes(pattern))) {
          continue;
        }

        const stats = await statAsync(fullPath);

        if (stats.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (stats.isFile()) {
          const checksum = await this.calculateFileChecksum(fullPath);
          files.push({
            path: relativePath,
            checksum,
            size: stats.size,
            modified: stats.mtime,
          });
          totalSize += stats.size;
        }
      }
    }

    await scanDirectory(directory);

    files.sort((a, b) => a.path.localeCompare(b.path));

    const allChecksums = files.map((f) => f.checksum).join('');
    const overallChecksum = crypto.createHash('sha256').update(allChecksums).digest('hex');

    return {
      timestamp: new Date(),
      totalFiles: files.length,
      totalSize,
      files,
      overallChecksum,
    };
  }

  static async validateChecksums(
    currentReport: ChecksumReport,
    storedReport: ChecksumReport
  ): Promise<{
    isValid: boolean;
    changes: {
      modified: string[];
      added: string[];
      deleted: string[];
    };
  }> {
    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];

    const currentMap = new Map(currentReport.files.map((f) => [f.path, f]));
    const storedMap = new Map(storedReport.files.map((f) => [f.path, f]));

    for (const [filePath, currentFile] of currentMap) {
      const storedFile = storedMap.get(filePath);
      if (!storedFile) {
        added.push(filePath);
      } else if (currentFile.checksum !== storedFile.checksum) {
        modified.push(filePath);
      }
    }

    for (const filePath of storedMap.keys()) {
      if (!currentMap.has(filePath)) {
        deleted.push(filePath);
      }
    }

    const isValid = modified.length === 0 && added.length === 0 && deleted.length === 0;

    return {
      isValid,
      changes: {
        modified,
        added,
        deleted,
      },
    };
  }

  static async saveChecksumReport(report: ChecksumReport, outputPath: string): Promise<void> {
    const jsonData = JSON.stringify(report, null, 2);
    await fs.promises.writeFile(outputPath, jsonData, 'utf-8');
  }

  static async loadChecksumReport(inputPath: string): Promise<ChecksumReport> {
    const jsonData = await readFileAsync(inputPath, 'utf-8');
    return JSON.parse(jsonData);
  }

  static formatSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

export const checksumValidator = ChecksumValidator;
