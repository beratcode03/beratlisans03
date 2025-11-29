#!/usr/bin/env node
/**
 * Self-Destruct Tarih Doğrulama Scripti
 * Tüm dosyalardaki SELF_DESTRUCT_DATE_UTC değerlerinin tutarlılığını kontrol eder
 * VE HARDCODED_DEADLINE_UTC ile karşılaştırarak efektif tarihi hesaplar
 * 
 * Kullanım: npm run verify-destruct-date
 */

const fs = require('fs');
const path = require('path');

console.log('');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          SELF-DESTRUCT TARİH DOĞRULAMA (v2)                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');

// Ayarlanabilir tarih kontrol edilecek dosyalar
const filesToCheck = [
  {
    path: path.join(__dirname, '..', 'electron', 'main.cjs'),
    name: 'electron/main.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/
  },
  {
    path: path.join(__dirname, '..', 'server', 'self-destruct.ts'),
    name: 'server/self-destruct.ts',
    pattern: /export const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/
  },
  {
    path: path.join(__dirname, '..', 'electron', 'utils', 'self-destruct.cjs'),
    name: 'electron/utils/self-destruct.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/
  },
  {
    path: path.join(__dirname, '..', 'client', 'src', 'bilesenler', 'self-destruct-warning.tsx'),
    name: 'client/src/bilesenler/self-destruct-warning.tsx',
    pattern: /export const SELF_DESTRUCT_DATE_UTC = new Date\('([^']+)'\);/
  }
];

// HARDCODED_DEADLINE_UTC kontrolü (sadece main.cjs'de var)
const hardcodedPattern = /const HARDCODED_DEADLINE_UTC = new Date\('([^']+)'\);/;
const mainCjsPath = path.join(__dirname, '..', 'electron', 'main.cjs');

const foundDates = [];
let allFilesExist = true;
let allPatternsFound = true;
let hardcodedDeadline = null;

// HARDCODED_DEADLINE_UTC'yi oku
console.log('🔒 HARDCODED_DEADLINE_UTC Kontrolü (Sabit Failsafe):');
console.log('');

if (fs.existsSync(mainCjsPath)) {
  const mainContent = fs.readFileSync(mainCjsPath, 'utf-8');
  const hardMatch = mainContent.match(hardcodedPattern);
  
  if (hardMatch) {
    const hardDateStr = hardMatch[1];
    const hardDate = new Date(hardDateStr);
    const hardTurkeyDate = new Date(hardDate.getTime() + (3 * 60 * 60 * 1000));
    const hardTurkeyStr = hardTurkeyDate.toISOString().replace('T', ' ').replace('.000Z', '');
    
    hardcodedDeadline = {
      utc: hardDateStr,
      turkey: hardTurkeyStr,
      timestamp: hardDate.getTime()
    };
    
    console.log(`   ⚠️  SABİT DEADLINE (değiştirilemez):`);
    console.log(`   UTC:     ${hardDateStr}`);
    console.log(`   Türkiye: ${hardTurkeyStr}`);
    console.log('');
  } else {
    console.log('   ✅ HARDCODED_DEADLINE_UTC bulunamadı (sadece ayarlanabilir tarih kullanılıyor)');
    console.log('');
  }
} else {
  console.log('   ⚠️  electron/main.cjs bulunamadı!');
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('');

console.log('📂 Ayarlanabilir Tarih Kontrolü (SELF_DESTRUCT_DATE_UTC):');
console.log('');

for (const file of filesToCheck) {
  if (!fs.existsSync(file.path)) {
    console.log(`❌ ${file.name}: Dosya bulunamadı!`);
    allFilesExist = false;
    continue;
  }

  const content = fs.readFileSync(file.path, 'utf-8');
  const match = content.match(file.pattern);

  if (!match) {
    console.log(`❌ ${file.name}: SELF_DESTRUCT_DATE_UTC bulunamadı!`);
    allPatternsFound = false;
    continue;
  }

  const dateStr = match[1];
  const date = new Date(dateStr);
  
  // Türkiye saatine çevir (UTC+3)
  const turkeyDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
  const turkeyStr = turkeyDate.toISOString().replace('T', ' ').replace('.000Z', '');
  
  console.log(`✅ ${file.name}`);
  console.log(`   UTC:     ${dateStr}`);
  console.log(`   Türkiye: ${turkeyStr}`);
  console.log('');

  foundDates.push({
    file: file.name,
    utc: dateStr,
    turkey: turkeyStr,
    timestamp: date.getTime()
  });
}

console.log('════════════════════════════════════════════════════════════════');
console.log('');

if (!allFilesExist || !allPatternsFound) {
  console.log('❌ Bazı dosyalar bulunamadı veya pattern eşleşmedi!');
  process.exit(1);
}

// Tutarlılık kontrolü
const uniqueDates = [...new Set(foundDates.map(d => d.timestamp))];

if (uniqueDates.length === 1) {
  console.log('✅ TÜM DOSYALAR TUTARLI!');
  console.log('');
  
  const configuredDate = foundDates[0];
  
  console.log('📋 Ayarlanabilir Tarih:');
  console.log(`   UTC:     ${configuredDate.utc}`);
  console.log(`   Türkiye: ${configuredDate.turkey} (UTC+3)`);
  console.log('');
  
  // Efektif tarih hesapla (min of configured vs hardcoded)
  let effectiveTimestamp = configuredDate.timestamp;
  let effectiveSource = 'Ayarlanabilir';
  
  if (hardcodedDeadline && hardcodedDeadline.timestamp < configuredDate.timestamp) {
    effectiveTimestamp = hardcodedDeadline.timestamp;
    effectiveSource = 'HARDCODED (sabit)';
    
    console.log('❌ HATA: Ayarlanabilir tarih sabit deadline\'dan sonra!');
    console.log('');
    console.log('📋 Efektif (Geçerli) Tarih:');
    console.log(`   Kaynak:  ${effectiveSource}`);
    console.log(`   UTC:     ${hardcodedDeadline.utc}`);
    console.log(`   Türkiye: ${hardcodedDeadline.turkey} (UTC+3)`);
    console.log('');
    console.log('   Self-destruct bu tarihte tetiklenecek çünkü sabit deadline');
    console.log('   ayarlanabilir tarihten daha erken.');
    console.log('');
    console.log('   Lütfen ayarlanabilir tarihi sabit deadline\'dan önce ayarlayın:');
    console.log(`   npm run set-destruct-date "${hardcodedDeadline.turkey.substring(0, 16)}"`);
    console.log('');
    
    // Exit with non-zero when configured > hardcoded
    process.exit(2);
  } else if (hardcodedDeadline) {
    console.log('📋 Efektif (Geçerli) Tarih:');
    console.log(`   Kaynak:  ${effectiveSource}`);
    console.log(`   UTC:     ${configuredDate.utc}`);
    console.log(`   Türkiye: ${configuredDate.turkey} (UTC+3)`);
    console.log('');
  }
  
  // Kalan süreyi hesapla
  const now = Date.now();
  const diff = effectiveTimestamp - now;
  
  if (diff > 0) {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`⏰ Kalan Süre: ${days} gün, ${hours} saat, ${minutes} dakika`);
  } else {
    console.log('⚠️  SÜRE DOLMUŞ! Self-destruct aktif olmalı.');
  }
  console.log('');
} else {
  console.log('❌ TUTARSIZLIK TESPİT EDİLDİ!');
  console.log('');
  console.log('Farklı tarihler bulundu:');
  foundDates.forEach(d => {
    console.log(`  - ${d.file}: ${d.utc}`);
  });
  console.log('');
  console.log('Düzeltmek için çalıştırın:');
  console.log('  npm run set-destruct-date "YYYY-MM-DD HH:mm"');
  console.log('');
  process.exit(1);
}
