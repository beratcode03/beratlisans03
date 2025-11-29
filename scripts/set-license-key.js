#!/usr/bin/env node

/**
 * Lisans Anahtari Degistirme Komutu
 * 
 * Kullanim:
 *   npm run set-license-key "YENI-ANAHTAR-BURAYA"
 * 
 * Guncellenen dosyalar:
 *   - electron/license-check.cjs
 *   - electron/protected/license-check.cjs (varsa)
 *   - AFYONLU.md
 *   - DAGITIM.md
 */

const fs = require('fs');
const path = require('path');

// Kullanicidan yeni lisans anahtarini al
const newLicenseKey = process.argv[2];

if (!newLicenseKey) {
  console.error('Hata: Lisans anahtari belirtilmedi!');
  console.log('Kullanim: npm run set-license-key "YENI-ANAHTAR-BURAYA"');
  console.log('Ornek: npm run set-license-key "XXXX-YYYY-ZZZZ-WWWW"');
  process.exit(1);
}

// Lisans anahtari formatini dogrula (4 grup, tire ile ayrilmis)
const licensePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
if (!licensePattern.test(newLicenseKey.toUpperCase())) {
  console.error('Hata: Gecersiz lisans anahtari formati!');
  console.log('Dogru format: XXXX-XXXX-XXXX-XXXX (4 grup, tire ile ayrilmis)');
  console.log('Ornek: B3SN-QRB6-0BC3-306B');
  process.exit(1);
}

const formattedKey = newLicenseKey.toUpperCase();

console.log('\n Lisans Anahtari Degistirme\n');
console.log('Yeni Anahtar:', formattedKey);
console.log('');

// Herhangi bir XXXX-XXXX-XXXX-XXXX formatindaki anahtari yakala
const anyLicenseKeyPattern = /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g;

// Dosya guncellemeleri
const updates = [
  {
    file: 'electron/license-check.cjs',
    patterns: [
      {
        pattern: /const VALID_LICENSE_KEY = '[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}';/,
        replacement: `const VALID_LICENSE_KEY = '${formattedKey}';`
      }
    ],
    description: 'Electron license-check.cjs (VALID_LICENSE_KEY)'
  },
  {
    file: 'electron/protected/license-check.cjs',
    patterns: [
      {
        pattern: /const VALID_LICENSE_KEY = '[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}';/,
        replacement: `const VALID_LICENSE_KEY = '${formattedKey}';`
      }
    ],
    description: 'Electron protected/license-check.cjs'
  },
  {
    file: 'AFYONLU.md',
    patterns: [
      {
        pattern: /`[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}`/g,
        replacement: `\`${formattedKey}\``
      },
      {
        pattern: /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g,
        replacement: formattedKey
      }
    ],
    description: 'AFYONLU.md dokumantasyonu'
  },
  {
    file: 'DAGITIM.md',
    patterns: [
      {
        pattern: /[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/g,
        replacement: formattedKey
      }
    ],
    description: 'DAGITIM.md (varsa)'
  }
];

let successCount = 0;
let errorCount = 0;
let skippedCount = 0;

updates.forEach(({ file, patterns, description }) => {
  try {
    const filePath = path.join(process.cwd(), file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`Atlandi: ${description} (dosya bulunamadi)`);
      skippedCount++;
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    patterns.forEach(({ pattern, replacement }) => {
      content = content.replace(pattern, replacement);
    });
    
    if (content === originalContent) {
      console.log(`Degisiklik yok: ${description}`);
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`Guncellendi: ${description}`);
      successCount++;
    }
  } catch (error) {
    console.error(`Hata (${description}):`, error.message);
    errorCount++;
  }
});

console.log('\n Ozet:');
console.log(`Basarili: ${successCount}`);
console.log(`Atlanan: ${skippedCount}`);
console.log(`Hatali: ${errorCount}`);
console.log('');

if (errorCount > 0) {
  console.log('Bazi dosyalar guncellenemedi. Lutfen manuel kontrol edin.');
  process.exit(1);
} else {
  console.log('Lisans anahtari basariyla degistirildi!');
  console.log('');
  console.log('Not: Degisiklikleri uygulamak icin projeyi yeniden derleyin:');
  console.log('  npm run build');
  console.log('  npm run electron:build');
}
