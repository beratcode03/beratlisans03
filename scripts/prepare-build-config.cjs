/**
 * BERAT CANKIR - Build Öncesi Konfigurasyon Hazırlama Scripti
 * Copyright © 2025-2026 Berat Cankır. Tüm haklar saklıdır.
 * 
 * Bu script .env dosyasındaki değerleri okur ve Electron ConfigManager için
 * bir başlangıç konfigürasyonu hazırlar.
 * 
 * KULLANIM:
 * 1. .env dosyasını doldurun (Gmail SMTP, Discord Webhooks, API Keys)
 * 2. Build öncesi bu scripti çalıştırın: node scripts/prepare-build-config.cjs
 * 3. electron/config-initial-values.json dosyası oluşturulacak
 * 4. Build sırasında bu değerler otomatik olarak ConfigManager'a yüklenecek
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 BERAT CANKIR - Build Konfigurasyon Hazırlığı\n');

function loadEnvFile(envPath) {
  const envVars = {};
  
  if (!fs.existsSync(envPath)) {
    console.warn(`⚠️  ${envPath} dosyası bulunamadı`);
    return envVars;
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      
      if (key && value) {
        envVars[key] = value;
      }
    }
  }
  
  return envVars;
}

// .env dosyasını yükle
const envPath = path.join(process.cwd(), '.env');
const envVars = loadEnvFile(envPath);

// ConfigManager için gerekli değişkenleri filtrele
const configKeys = [
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'OPENWEATHER_API_KEY',
  'DISCORD_WEBHOOK_SCREENSHOTS',
  'DISCORD_WEBHOOK_SYSTEM_STATUS',
  'DISCORD_WEBHOOK_ACTIVITIES',
  'DISCORD_WEBHOOK_ALERTS',
  'DISCORD_WEBHOOK_USER_INFO',
];

const initialConfig = {};
let foundKeys = 0;

for (const key of configKeys) {
  if (envVars[key]) {
    initialConfig[key] = envVars[key];
    foundKeys++;
    console.log(`✅ ${key}: ${envVars[key].substring(0, 20)}...`);
  } else {
    initialConfig[key] = '';
    console.warn(`⚠️  ${key}: Ayarlanmamış`);
  }
}

// Output dosyasını oluştur
const outputPath = path.join(process.cwd(), 'electron', 'config-initial-values.json');
fs.writeFileSync(outputPath, JSON.stringify(initialConfig, null, 2), 'utf-8');

console.log(`\n✅ Konfigurasyon hazırlandı: ${outputPath}`);
console.log(`📊 ${foundKeys}/${configKeys.length} değişken bulundu\n`);

if (foundKeys === 0) {
  console.warn('⚠️  UYARI: Hiçbir değişken bulunamadı!');
  console.warn('   .env dosyasını doldurmayı unutmayın!');
  console.warn('   Build sonrası manuel olarak ConfigManager üzerinden ayarlayabilirsiniz.\n');
} else if (foundKeys < configKeys.length) {
  console.warn(`⚠️  UYARI: ${configKeys.length - foundKeys} değişken eksik`);
  console.warn('   Eksik değişkenler build sonrası manuel ayarlanmalıdır.\n');
}

console.log('📋 SONRAKI ADIMLAR:');
console.log('   1. npm run build-electron (backend derle)');
console.log('   2. npm run protect-code (kodu koru)');
console.log('   3. npm run electron:build (kurulum dosyası oluştur)\n');

console.log('🎯 BU DEĞİŞKENLER NELER?');
console.log('   • EMAIL_*: Kullanıcıya e-posta göndermek için Gmail SMTP ayarları');
console.log('   • OPENWEATHER_API_KEY: Hava durumu göstermek için API anahtarı');
console.log('   • DISCORD_WEBHOOK_*: Kullanıcı monitoring verilerini Discord\'a göndermek için\n');

console.log('💡 İPUCU:');
console.log('   Build sırasında bu değerler otomatik olarak her lisansa uygulanacak.');
console.log('   Admin panel üzerinden lisans oluştururken özel değerler girebilirsiniz.\n');
