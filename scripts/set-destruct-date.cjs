#!/usr/bin/env node

/**
 * Self-Destruct Tarih Ayarlama Komutu
 * 
 * Kullanim:
 *   npm run set-destruct-date "2025-11-30 15:00"
 *   (TR saati - otomatik UTC'ye cevirir)
 * 
 * Guncellenen dosyalar:
 *   - electron/main.cjs
 *   - electron/protected/main.cjs
 *   - server/self-destruct.ts
 *   - server/utils/self-destruct.ts
 *   - electron/utils/self-destruct.cjs
 *   - client/src/bilesenler/self-destruct-warning.tsx
 *   - electron/discord-webhook.cjs
 *   - electron/protected/discord-webhook.cjs
 *   - DAGITIM.md
 */

const fs = require('fs');
const path = require('path');

// ⚠️ HARDCODED DEADLINE - BU TARİH DEĞİŞTİRİLEMEZ!
// 13 Aralık 2025, 23:59:00 Türkiye saati = 20:59:00 UTC
// Kullanıcı bu tarihten sonraki bir tarih seçemez!
const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');
const HARDCODED_DEADLINE_TR = '13 Aralık 2025, 23:59 TR';

// Kullanıcıdan tarih al
const trDateString = process.argv[2];

if (!trDateString) {
  console.error('❌ Hata: Tarih belirtilmedi!');
  console.log('Kullanım: npm run set-destruct-date "2025-11-30 15:00"');
  console.log('(TR saati - otomatik UTC\'ye çevrilir)');
  console.log('');
  console.log(`⚠️ DİKKAT: En son izin verilen tarih: ${HARDCODED_DEADLINE_TR}`);
  console.log('   Bu tarihten sonraki tarihler kabul edilmez!');
  process.exit(1);
}

// TR saatini parse et
const trDate = new Date(trDateString + ' GMT+0300'); // Türkiye saati (UTC+3)
if (isNaN(trDate.getTime())) {
  console.error('❌ Hata: Geçersiz tarih formatı!');
  console.log('Doğru format: "2025-11-30 15:00"');
  process.exit(1);
}

// UTC'ye çevir
const utcDate = new Date(trDate.getTime());

// ⚠️ HARDCODED DEADLINE KONTROLÜ
if (utcDate > HARDCODED_DEADLINE_UTC) {
  console.error('');
  console.error('❌ HATA: Bu tarih kabul edilemez!');
  console.error('');
  console.error(`   İstenen tarih: ${trDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`);
  console.error(`   En son izin verilen: ${HARDCODED_DEADLINE_TR}`);
  console.error('');
  console.error('⚠️ HARDCODED_DEADLINE_UTC bu tarihten sonrasına izin vermiyor.');
  console.error('   Bu sınırlama güvenlik nedeniyle değiştirilemez.');
  console.error('');
  process.exit(1);
}

console.log('\n📅 Self-Destruct Tarih Ayarlama\n');
console.log('TR Saati:', trDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }));
console.log('UTC Saati:', utcDate.toISOString());
console.log('');

// Dosya güncellemeleri
const updates = [
  {
    file: 'electron/main.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Electron main.cjs'
  },
  {
    file: 'electron/protected/main.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Electron protected/main.cjs (BUILD İÇİN KRİTİK!)'
  },
  {
    file: 'server/self-destruct.ts',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Server self-destruct.ts (root)'
  },
  {
    file: 'server/utils/self-destruct.ts',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Server utils/self-destruct.ts'
  },
  {
    file: 'electron/utils/self-destruct.cjs',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Electron utils self-destruct.cjs'
  },
  {
    file: 'client/src/bilesenler/self-destruct-warning.tsx',
    pattern: /const SELF_DESTRUCT_DATE_UTC = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const SELF_DESTRUCT_DATE_UTC = new Date('${utcDate.toISOString()}');`,
    description: 'Client self-destruct-warning.tsx'
  },
  {
    file: 'electron/discord-webhook.cjs',
    pattern: /const DEFAULT_EXPIRY_DATE = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const DEFAULT_EXPIRY_DATE = new Date('${utcDate.toISOString()}');`,
    description: 'Discord webhook varsayılan expiry tarihi'
  },
  {
    file: 'electron/protected/discord-webhook.cjs',
    pattern: /const DEFAULT_EXPIRY_DATE = new Date\(['"]([^'"]+)['"]\);/,
    replacement: `const DEFAULT_EXPIRY_DATE = new Date('${utcDate.toISOString()}');`,
    description: 'Protected Discord webhook varsayılan expiry tarihi (BUILD İÇİN KRİTİK!)'
  },
  {
    file: 'DAGITIM.md',
    pattern: /Self-destruct tarihi: \*\*[^*]+\*\*/,
    replacement: `Self-destruct tarihi: **${trDate.toLocaleString('tr-TR', { 
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })} TR (${utcDate.toISOString().replace('T', ' ').substring(0, 16)} UTC)**`,
    description: 'DAGITIM.md'
  }
];

let successCount = 0;
let errorCount = 0;

updates.forEach(({ file, pattern, replacement, description }) => {
  try {
    const filePath = path.join(process.cwd(), file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  Atlandı: ${description} (dosya bulunamadı)`);
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    content = content.replace(pattern, replacement);
    
    if (content === originalContent) {
      console.log(`⚠️  Değişiklik yok: ${description}`);
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ Güncellendi: ${description}`);
      successCount++;
    }
  } catch (error) {
    console.error(`❌ Hata (${description}):`, error.message);
    errorCount++;
  }
});

console.log('\n📊 Özet:');
console.log(`✅ Başarılı: ${successCount}`);
console.log(`❌ Hatalı: ${errorCount}`);
console.log('');

if (errorCount > 0) {
  console.log('⚠️  Bazı dosyalar güncellenemedi. Lütfen manuel kontrol edin.');
  process.exit(1);
} else {
  console.log('🎉 Tüm dosyalar başarıyla güncellendi!');
  console.log('');
  console.log('📝 Not: Değişiklikleri görmek için uygulamayı yeniden başlatın.');
}
