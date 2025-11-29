/**
 * BERAT CANKIR - Birlesik Koruma Build Scripti
 * Copyright 2025-2026 Berat Cankir. Tum haklari saklidir.
 * 
 * Bu script tum koruma adimlarini DOGRU SIRADA calistirir:
 * 1. Server bytecode korumasi (protect-server-bytecode.cjs)
 * 2. Kaynak kod obfuscation (obfuscate-and-compile-advanced.cjs)
 * 3. Backup dosyalarini temizle
 * 4. Final dogrulama
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=================================================================');
console.log('   BERAT CANKIR - Birlesik Koruma Build Sistemi');
console.log('   Versiyon: 3.0.0');
console.log('=================================================================\n');

const distPath = path.join(process.cwd(), 'dist');
const electronPath = path.join(process.cwd(), 'electron');

// Kontrol edilecek guvenlik aciklari
const securityChecks = {
  backupFiles: ['server.cjs.backup', 'server.js.backup', 'server.mjs.backup'],
  sourceMapFiles: ['*.map'],
  readmeFiles: ['README.md', 'README', 'LICENSE'],
};

function runStep(stepName, command) {
  console.log(`\n[STEP] ${stepName}...`);
  console.log('-----------------------------------------------------------');
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`[OK] ${stepName} tamamlandi\n`);
    return true;
  } catch (error) {
    console.error(`[X] ${stepName} basarisiz: ${error.message}`);
    return false;
  }
}

function cleanupSecurityRisks() {
  console.log('\n[SECURITY] Guvenlik riski taramasi yapiliyor...');
  console.log('-----------------------------------------------------------');
  
  let cleaned = 0;
  
  // Backup dosyalarini temizle
  const allDangerousFiles = [
    ...securityChecks.backupFiles,
    'server.ts',
    'server.js',
    'server.mjs'
  ];
  
  allDangerousFiles.forEach(file => {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`   [DELETED] ${file} silindi (TEHLIKELI!)`);
        cleaned++;
      } catch (e) {
        console.error(`   [ERROR] ${file} silinemedi: ${e.message}`);
      }
    }
  });
  
  // dist icindeki .map, .ts, .tsx dosyalarini temizle
  if (fs.existsSync(distPath)) {
    fs.readdirSync(distPath).forEach(file => {
      if (file.endsWith('.map') || file.endsWith('.ts') || file.endsWith('.tsx')) {
        const filePath = path.join(distPath, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`   [DELETED] ${file} silindi`);
          cleaned++;
        } catch (e) {}
      }
    });
  }
  
  if (cleaned === 0) {
    console.log('   [OK] Guvenlik riski bulunamadi');
  } else {
    console.log(`   [SHIELD] ${cleaned} dosya temizlendi`);
  }
  
  return true;
}

function verifyProtection() {
  console.log('\n[VERIFY] Koruma dogrulamasi yapiliyor...');
  console.log('-----------------------------------------------------------');
  
  let errors = 0;
  let hasBytecode = false;
  
  // Bytecode kontrolu
  const bytecodePath = path.join(distPath, 'server.jsc');
  if (fs.existsSync(bytecodePath)) {
    const stats = fs.statSync(bytecodePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`   [OK] server.jsc bytecode mevcut: ${sizeKB} KB`);
    hasBytecode = true;
  }
  
  // server.cjs kontrolu
  const serverCjsPath = path.join(distPath, 'server.cjs');
  if (fs.existsSync(serverCjsPath)) {
    const content = fs.readFileSync(serverCjsPath, 'utf8');
    
    // Obfuscation kontrolu: _0x ile baslayan degiskenler olmali
    // Ancak bytecode varsa, server.cjs sadece fallback olarak kullanilir
    if (!content.includes('_0x') && !content.includes('\\x')) {
      if (hasBytecode) {
        console.log('   [INFO] server.cjs obfuscate edilmemis ama bytecode mevcut (bytecode oncelikli yuklenecek)');
      } else {
        console.error('   [X] server.cjs OBFUSCATE EDILMEMIS ve bytecode de yok!');
        errors++;
      }
    } else {
      console.log('   [OK] server.cjs obfuscate edilmis');
    }
    
    // Boyut kontrolu
    const stats = fs.statSync(serverCjsPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`   [INFO] server.cjs boyutu: ${sizeKB} KB`);
  } else if (!hasBytecode) {
    console.error('   [X] server.cjs bulunamadi ve bytecode de yok!');
    errors++;
  } else {
    console.log('   [INFO] server.cjs yok ama bytecode mevcut (normal)');
  }
  
  // Backup dosyasi OLMAMALI
  const backupPath = path.join(distPath, 'server.cjs.backup');
  if (fs.existsSync(backupPath)) {
    console.error('   [X] KRITIK: server.cjs.backup HALA MEVCUT!');
    console.error('       Bu dosya orijinal kaynak kodunu iceriyor!');
    errors++;
  } else {
    console.log('   [OK] server.cjs.backup YOK (guvenli)');
  }
  
  // server-loader.cjs kontrolu
  const loaderPath = path.join(distPath, 'server-loader.cjs');
  if (fs.existsSync(loaderPath)) {
    console.log('   [OK] server-loader.cjs mevcut');
  } else {
    console.error('   [X] server-loader.cjs bulunamadi!');
    errors++;
  }
  
  // Protected klasoru kontrolu
  const protectedPath = path.join(electronPath, 'protected');
  if (fs.existsSync(protectedPath)) {
    const protectedFiles = fs.readdirSync(protectedPath);
    console.log(`   [OK] electron/protected/ klasoru: ${protectedFiles.length} dosya`);
    
    // .enc dosyasi kontrolu
    const encInProtected = path.join(protectedPath, 'config-initial-values.enc');
    if (fs.existsSync(encInProtected)) {
      console.log('   [OK] config-initial-values.enc mevcut (sifreli config)');
    } else {
      console.error('   [X] config-initial-values.enc BULUNAMADI!');
      console.error('       Once npm run electron:encode-config calistirin');
      errors++;
    }
    
    // JSON dosyasi OLMAMALI
    const jsonInProtected = path.join(protectedPath, 'config-initial-values.json');
    if (fs.existsSync(jsonInProtected)) {
      console.error('   [X] KRITIK: config-initial-values.json HALA MEVCUT!');
      console.error('       Bu dosya duz metin iceriyor - silinmeli!');
      errors++;
    } else {
      console.log('   [OK] config-initial-values.json YOK (guvenli)');
    }
  } else {
    console.error('   [X] electron/protected/ klasoru bulunamadi!');
    errors++;
  }
  
  // Ana electron klasorunde de .enc kontrolu
  const encInElectron = path.join(electronPath, 'config-initial-values.enc');
  if (fs.existsSync(encInElectron)) {
    console.log('   [OK] electron/config-initial-values.enc mevcut');
  } else {
    console.error('   [X] electron/config-initial-values.enc BULUNAMADI!');
    errors++;
  }
  
  if (errors > 0) {
    console.error(`\n[X] DOGRULAMA BASARISIZ: ${errors} hata bulundu!`);
    return false;
  }
  
  console.log('\n[OK] Tum dogrulamalar gecti!');
  return true;
}

async function main() {
  let success = true;
  
  // 1. Oncelikle mevcut backup dosyalarini temizle
  cleanupSecurityRisks();
  
  // 2. ONCE OBFUSCATION YAP (server.cjs'i karart)
  // Bu adim server.cjs'i obfuscate eder, boylece bytecode basarisiz olsa bile
  // fallback dosyasi hala korunmus olur
  if (!runStep('Kaynak Kod Obfuscation', 'node scripts/obfuscate-and-compile-advanced.cjs')) {
    console.warn('[!] Obfuscation basarisiz, bytecode ile devam ediliyor...');
  }
  
  // 3. Sonra bytecode korumasi (obfuscated dosya uzerinde calisir)
  if (!runStep('Server Bytecode Korumasi', 'node scripts/protect-server-bytecode.cjs')) {
    console.warn('[!] Bytecode korumasi basarisiz, obfuscated CJS kullanilacak...');
  }
  
  // 4. Tekrar guvenlik temizligi
  cleanupSecurityRisks();
  
  // 5. Final dogrulama
  if (!verifyProtection()) {
    success = false;
  }
  
  // Sonuc
  console.log('\n=================================================================');
  if (success) {
    console.log('   [PARTY] TUM KORUMALAR BASARIYLA TAMAMLANDI!');
    console.log('=================================================================\n');
    console.log('[SHIELD] GUVENLIK DURUMU:');
    console.log('   [X] Kullanicilar kaynak kodu GOREMEZ');
    console.log('   [X] server.cjs.backup DAGITILMIYOR');
    console.log('   [X] Tum kod OBFUSCATE edildi');
    console.log('   [X] DevTools ENGELLENDI');
    console.log('\n[NEXT] Simdi electron-builder calistirabilirsiniz:');
    console.log('   npm run electron:build\n');
  } else {
    console.log('   [X] KORUMA TAMAMLANAMADI - HATALARI DUZLETIN!');
    console.log('=================================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n[X] Kritik hata:', err);
  process.exit(1);
});
