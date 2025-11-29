/**
 * BERAT CANKIR - package.json Geri Yükleme
 * Electron build sonrası orijinal package.json'u geri yükler
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Orijinal package.json geri yükleniyor...');

const packageJsonPath = path.join(process.cwd(), 'package.json');
const backupPath = path.join(process.cwd(), 'package.json.backup');

if (fs.existsSync(backupPath)) {
  fs.copyFileSync(backupPath, packageJsonPath);
  fs.unlinkSync(backupPath);
  console.log('✅ package.json geri yüklendi');
  console.log('✅ Backup dosyası silindi');
} else {
  console.warn('⚠️  Backup dosyası bulunamadı');
}
