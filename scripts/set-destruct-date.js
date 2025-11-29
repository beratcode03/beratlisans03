#!/usr/bin/env node
/**
 * Self-Destruct Tarih Ayarlama Scripti
 * Kullanım: npm run set-destruct-date "2025-11-30 23:59"
 * 
 * Not: Tarih Türkiye saati (UTC+3) olarak girilir ve otomatik UTC'ye çevrilir.
 * TÜM 8 DOSYA GÜNCELLENİR:
 * - electron/main.cjs
 * - electron/protected/main.cjs
 * - server/self-destruct.ts
 * - server/utils/self-destruct.ts
 * - electron/utils/self-destruct.cjs
 * - client/src/bilesenler/self-destruct-warning.tsx
 * - electron/discord-webhook.cjs (DEFAULT_EXPIRY_DATE)
 * - electron/protected/discord-webhook.cjs (DEFAULT_EXPIRY_DATE)
 * 
 * ⚠️ UYARI: electron/main.cjs'de HARDCODED_DEADLINE_UTC adlı bir sabit tarih vardır.
 * Bu tarih değiştirilemez ve efektif self-destruct tarihi min(ayarlanabilir, sabit) olur.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

// HARDCODED_DEADLINE_UTC kontrolü
const hardcodedPattern = /const HARDCODED_DEADLINE_UTC = new Date\('([^']+)'\);/;
const mainCjsPath = path.join(__dirname, '..', 'electron', 'main.cjs');
let hardcodedDeadline = null;

if (fs.existsSync(mainCjsPath)) {
  const mainContent = fs.readFileSync(mainCjsPath, 'utf-8');
  const hardMatch = mainContent.match(hardcodedPattern);
  if (hardMatch) {
    hardcodedDeadline = new Date(hardMatch[1]);
  }
}

if (args.length === 0) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          SELF-DESTRUCT TARİH AYARLAMA SCRIPTİ                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Kullanım: npm run set-destruct-date "YYYY-MM-DD HH:mm"');
  console.log('');
  console.log('Örnekler:');
  console.log('  npm run set-destruct-date "2025-11-30 23:59"');
  console.log('  npm run set-destruct-date "2025-12-15 18:00"');
  console.log('');
  console.log('⚠️  Not: Tarih Türkiye saati (UTC+3) olarak girilmelidir.');
  console.log('   Script otomatik olarak UTC\'ye çevirecektir.');
  console.log('');
  
  if (hardcodedDeadline) {
    const hardTurkeyDate = new Date(hardcodedDeadline.getTime() + (3 * 60 * 60 * 1000));
    console.log('🔒 SABİT DEADLINE (değiştirilemez):');
    console.log(`   ${hardTurkeyDate.toISOString().replace('T', ' ').replace('.000Z', '')} Türkiye`);
    console.log('');
    console.log('   Bu tarihten sonrası için tarih ayarlasanız bile,');
    console.log('   uygulama bu tarihte self-destruct olacaktır.');
    console.log('');
  }
  
  console.log('Güncellenecek dosyalar:');
  console.log('  1. electron/main.cjs');
  console.log('  2. electron/protected/main.cjs');
  console.log('  3. server/self-destruct.ts');
  console.log('  4. server/utils/self-destruct.ts');
  console.log('  5. electron/utils/self-destruct.cjs');
  console.log('  6. client/src/bilesenler/self-destruct-warning.tsx');
  console.log('');
  process.exit(1);
}

const dateTimeStr = args.join(' ');
const dateMatch = dateTimeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);

if (!dateMatch) {
  console.error('');
  console.error('❌ Geçersiz tarih formatı!');
  console.error('');
  console.error('   Doğru format: "YYYY-MM-DD HH:mm"');
  console.error('   Örnek: "2025-11-30 23:59"');
  console.error('');
  process.exit(1);
}

const [, dateStr, hours, minutes] = dateMatch;
const [year, month, day] = dateStr.split('-').map(Number);

// Türkiye saatini UTC'ye çevir (UTC+3)
// JavaScript Date constructor'ı local timezone kullandığından, manual olarak UTC hesaplıyoruz
const turkeyOffsetHours = 3;
const turkeyDate = new Date(Date.UTC(year, month - 1, day, parseInt(hours), parseInt(minutes), 0));
const utcDate = new Date(turkeyDate.getTime() - (turkeyOffsetHours * 60 * 60 * 1000));

const utcISOString = utcDate.toISOString();

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          SELF-DESTRUCT TARİH AYARLAMA                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`📍 Türkiye Saati (UTC+3): ${dateStr} ${hours}:${minutes}`);
console.log(`🌍 UTC Saati:             ${utcISOString}`);
console.log('');

// HARDCODED_DEADLINE_UTC ile karşılaştırma
if (hardcodedDeadline && utcDate.getTime() > hardcodedDeadline.getTime()) {
  const hardTurkeyDate = new Date(hardcodedDeadline.getTime() + (3 * 60 * 60 * 1000));
  const hardTurkeyStr = hardTurkeyDate.toISOString().replace('T', ' ').replace('.000Z', '');
  
  console.log('⚠️  UYARI: Girilen tarih sabit deadline\'dan sonra!');
  console.log('');
  console.log(`   🔒 Sabit Deadline: ${hardTurkeyStr} Türkiye`);
  console.log(`   📍 Girilen Tarih:  ${dateStr} ${hours}:${minutes} Türkiye`);
  console.log('');
  console.log('   Girilen tarih kaydedilecek ama efektif self-destruct tarihi');
  console.log('   sabit deadline olacaktır (daha erken olduğu için).');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

// Güncellenecek dosyalar - TÜM DOSYALAR
// optional: true olan dosyalar varsa güncellenir, yoksa atlanır (hata vermez)
const filesToUpdate = [
  {
    path: path.join(__dirname, '..', 'electron', 'main.cjs'),
    name: 'electron/main.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'electron', 'protected', 'main.cjs'),
    name: 'electron/protected/main.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: true // Bu dosya her zaman mevcut olmayabilir
  },
  {
    path: path.join(__dirname, '..', 'server', 'self-destruct.ts'),
    name: 'server/self-destruct.ts',
    pattern: /export const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `export const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'server', 'utils', 'self-destruct.ts'),
    name: 'server/utils/self-destruct.ts',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'electron', 'utils', 'self-destruct.cjs'),
    name: 'electron/utils/self-destruct.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'client', 'src', 'bilesenler', 'self-destruct-warning.tsx'),
    name: 'client/src/bilesenler/self-destruct-warning.tsx',
    pattern: /export const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/,
    replacement: `export const SELF_DESTRUCT_DATE_UTC = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'electron', 'discord-webhook.cjs'),
    name: 'electron/discord-webhook.cjs',
    pattern: /const DEFAULT_EXPIRY_DATE = new Date\('([^']+)'\);/,
    replacement: `const DEFAULT_EXPIRY_DATE = new Date('${utcISOString}');`,
    optional: false
  },
  {
    path: path.join(__dirname, '..', 'electron', 'protected', 'discord-webhook.cjs'),
    name: 'electron/protected/discord-webhook.cjs',
    pattern: /const DEFAULT_EXPIRY_DATE = new Date\('([^']+)'\);/,
    replacement: `const DEFAULT_EXPIRY_DATE = new Date('${utcISOString}');`,
    optional: false
  }
];

console.log('📝 Dosyalar güncelleniyor...');
console.log('');

let successCount = 0;
let failCount = 0;
let skippedCount = 0;
const results = [];

for (const file of filesToUpdate) {
  try {
    if (!fs.existsSync(file.path)) {
      if (file.optional) {
        // Opsiyonel dosya - sessizce atla
        console.log(`⏭️  ${file.name}: Opsiyonel dosya mevcut değil, atlanıyor.`);
        results.push({ name: file.name, success: true, skipped: true });
        skippedCount++;
        continue;
      }
      console.error(`❌ ${file.name}: Dosya bulunamadı!`);
      results.push({ name: file.name, success: false, error: 'Dosya bulunamadı' });
      failCount++;
      continue;
    }

    let content = fs.readFileSync(file.path, 'utf-8');
    const match = content.match(file.pattern);
    
    if (!match) {
      console.error(`❌ ${file.name}: SELF_DESTRUCT_DATE_UTC bulunamadı!`);
      results.push({ name: file.name, success: false, error: 'Pattern bulunamadı' });
      failCount++;
      continue;
    }

    const oldDate = match[1];
    content = content.replace(file.pattern, file.replacement);
    fs.writeFileSync(file.path, content, 'utf-8');
    
    console.log(`✅ ${file.name}`);
    console.log(`   Eski: ${oldDate}`);
    console.log(`   Yeni: ${utcISOString}`);
    console.log('');
    
    results.push({ name: file.name, success: true, oldDate, newDate: utcISOString });
    successCount++;
  } catch (error) {
    console.error(`❌ ${file.name}: ${error.message}`);
    results.push({ name: file.name, success: false, error: error.message });
    failCount++;
  }
}

console.log('════════════════════════════════════════════════════════════════');
console.log('');

if (failCount === 0) {
  if (skippedCount > 0) {
    console.log(`✅ ${successCount} dosya güncellendi, ${skippedCount} opsiyonel dosya atlandı.`);
  } else {
    console.log(`✅ Tüm ${successCount} dosya başarıyla güncellendi!`);
  }
  console.log('');
  console.log('📋 Özet:');
  console.log(`   Türkiye Saati: ${dateStr} ${hours}:${minutes}`);
  console.log(`   UTC Saati:     ${utcISOString}`);
  
  // Efektif tarih hesapla
  if (hardcodedDeadline && utcDate.getTime() > hardcodedDeadline.getTime()) {
    const hardTurkeyDate = new Date(hardcodedDeadline.getTime() + (3 * 60 * 60 * 1000));
    console.log('');
    console.log(`   ⚠️  Efektif Tarih: ${hardTurkeyDate.toISOString().replace('T', ' ').replace('.000Z', '')} Türkiye`);
    console.log('      (Sabit deadline daha erken olduğu için)');
  }
  
  console.log('');
  console.log('🔄 Değişikliklerin geçerli olması için uygulamayı yeniden başlatın.');
  console.log('');
  console.log('📌 Doğrulama için çalıştırın:');
  console.log('   npm run verify-destruct-date');
  console.log('');
} else {
  console.error(`❌ ${failCount} dosya güncellenemedi!`);
  console.log(`✅ ${successCount} dosya başarıyla güncellendi.`);
  console.log('');
  console.log('Başarısız dosyalar:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
}
