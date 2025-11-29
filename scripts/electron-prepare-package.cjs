/**
 * BERAT CANKIR - Electron Build Öncesi package.json Hazırlama
 * "require is not defined in ES module scope" hatasını düzeltir
 * 
 * Web uygulaması için "type": "module" gerekli,
 * ama Electron production için CommonJS gerekiyor.
 * 
 * Bu script geçici bir package.json oluşturur VE server'ı CommonJS olarak build eder.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Electron için hazırlık başlıyor...\n');

// 1. package.json'u yedekle ve değiştir
const packageJsonPath = path.join(process.cwd(), 'package.json');
const backupPath = path.join(process.cwd(), 'package.json.backup');

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(packageJsonPath, backupPath);
  console.log('✅ package.json yedeklendi');
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

if (packageJson.type === 'module') {
  delete packageJson.type;
  console.log('✅ "type": "module" kaldırıldı');
}

packageJson.type = 'commonjs';
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('✅ "type": "commonjs" eklendi (Electron build için)');

// 2. dist klasörünü temizle
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
  console.log('✅ Eski dist klasörü temizlendi');
}

// 3. Server'ı CommonJS formatında build et
console.log('\n🔨 Server CommonJS formatında build ediliyor...');
try {
  execSync('npm run build-server-electron', { stdio: 'inherit' });
  console.log('✅ Server başarıyla CommonJS formatında build edildi');
} catch (error) {
  console.error('❌ Server build hatası:', error.message);
  process.exit(1);
}

console.log('\n✅ Electron build için tüm hazırlıklar tamamlandı');
console.log('💡 Build sonrası "npm run electron:restore-package" ile geri yükleyin\n');
