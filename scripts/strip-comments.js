/**
 * BERAT CANKIR - Comment Stripper Script
 * Copyright © 2025-2026 Berat Cankır. All rights reserved.
 * 
 * This script removes comments from sensitive files while preserving copyright notices.
 */

const fs = require('fs');
const path = require('path');

function stripComments(code) {
  let result = code;
  
  result = result.replace(/\/\*\*[\s\S]*?Copyright.*?All rights reserved\.[\s\S]*?\*\//gi, (match) => match);
  result = result.replace(/\/\*(?!.*Copyright)[\s\S]*?\*\//g, '');
  result = result.replace(/\/\/(?!.*Copyright).*/g, '');
  result = result.replace(/^\s*[\r\n]+/gm, '');
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');
  
  return result.trim() + '\n';
}

function processFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const stripped = stripComments(code);
    fs.writeFileSync(filePath, stripped, 'utf8');
    console.log(`✅ ${path.basename(filePath)} - yorumlar temizlendi`);
  } catch (error) {
    console.error(`❌ ${path.basename(filePath)} - hata:`, error.message);
  }
}

const filesToProcess = [
  'server/activity-logger.ts',
  'server/discord-webhook.ts',
  'server/monitoring-routes.ts',
  'electron/monitoring.cjs'
];

console.log('🧹 BERAT CANKIR - Yorum Temizleme Başlatıldı...\n');

filesToProcess.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    processFile(fullPath);
  } else {
    console.log(`⚠️  ${file} bulunamadı (atlanıyor)`);
  }
});

console.log('\n🎉 Yorum temizleme tamamlandı!');
console.log('📝 Not: Copyright bildirimleri korundu.\n');
