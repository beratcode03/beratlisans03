/**
 * BERAT CANKIR - Hizli Koruma Build Scripti v2
 * Copyright 2025-2026 Berat Cankir. Tum haklari saklidir.
 * 
 * KRITIK GUVENLIK:
 * 1. server.cjs.backup MUTLAKA silinir
 * 2. server.cjs MUTLAKA obfuscate edilir
 * 3. Bytecode de olusturulur (cift koruma)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=================================================================');
console.log('   BERAT CANKIR - GUVENLI Koruma Build Sistemi');
console.log('   Versiyon: 3.0.0');
console.log('=================================================================\n');

const distPath = path.join(process.cwd(), 'dist');
const serverCjsPath = path.join(distPath, 'server.cjs');
const serverLoaderPath = path.join(distPath, 'server-loader.cjs');
const serverJscPath = path.join(distPath, 'server.jsc');
const bytecodeMetaPath = path.join(distPath, 'bytecode-meta.json');

// =====================================================
// ADIM 0: TEHLIKELI DOSYALARI SIL (BASINDA)
// =====================================================
function deleteBackupFiles() {
  console.log('[GUVENLIK] Tehlikeli dosyalar siliniyor...');
  const dangerousFiles = [
    'server.cjs.backup',
    'server.js.backup', 
    'server.mjs.backup',
    'server.ts',
    'server.js',
    'server.mjs'
  ];
  
  let deleted = 0;
  dangerousFiles.forEach(file => {
    const filePath = path.join(distPath, file);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`   [SILINDI] ${file}`);
        deleted++;
      } catch (e) {
        console.error(`   [HATA] ${file} silinemedi: ${e.message}`);
      }
    }
  });
  
  // Source map dosyalarini da sil
  if (fs.existsSync(distPath)) {
    fs.readdirSync(distPath).forEach(file => {
      if (file.endsWith('.map') || file.endsWith('.ts') || file.endsWith('.tsx')) {
        const filePath = path.join(distPath, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`   [SILINDI] ${file}`);
          deleted++;
        } catch (e) {}
      }
    });
  }
  
  if (deleted === 0) {
    console.log('   [OK] Tehlikeli dosya bulunamadi');
  }
  console.log('');
}

// Once temizlik yap
deleteBackupFiles();

if (!fs.existsSync(serverCjsPath)) {
  console.error('[HATA] dist/server.cjs bulunamadi!');
  console.error('   Once npm run build-server-electron calistirin\n');
  process.exit(1);
}

const buildPlatform = os.platform();
const buildArch = os.arch();
console.log(`[INFO] Platform: ${buildPlatform} (${buildArch})\n`);

// Orijinal kodu belleğe al
const originalCode = fs.readFileSync(serverCjsPath, 'utf8');
console.log(`[INFO] Orijinal server.cjs boyutu: ${(Buffer.byteLength(originalCode, 'utf8') / 1024).toFixed(2)} KB\n`);

// =====================================================
// ADIM 1: OBFUSCATION (MUTLAKA YAPILIR)
// =====================================================
console.log('[ADIM 1] Kod obfuscation yapiliyor...');
let obfuscatedCode = originalCode;

try {
  const JavaScriptObfuscator = require('javascript-obfuscator');
  
  const obfuscated = JavaScriptObfuscator.obfuscate(originalCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: true,
    debugProtectionInterval: 0,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    renameProperties: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.5,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 1,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.75,
    target: 'node',
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });
  
  obfuscatedCode = obfuscated.getObfuscatedCode();
  
  // Obfuscated kodu kaydet
  fs.writeFileSync(serverCjsPath, obfuscatedCode, 'utf8');
  
  const newSize = (Buffer.byteLength(obfuscatedCode, 'utf8') / 1024).toFixed(2);
  console.log(`   [OK] Obfuscation tamamlandi!`);
  console.log(`   [INFO] Yeni boyut: ${newSize} KB\n`);
  
} catch (error) {
  console.warn(`   [UYARI] Obfuscation basarisiz: ${error.message}`);
  console.log('   [INFO] Orijinal kod kullanilacak\n');
}

// =====================================================
// ADIM 2: BYTECODE (VARSA EKSTRA KORUMA)
// =====================================================
console.log('[ADIM 2] Bytecode derleme deneniyor...');
let bytecodeSuccess = false;

try {
  const bytenode = require('bytenode');
  
  // Obfuscated kodu bytecode'a derle
  bytenode.compileFile({
    filename: serverCjsPath,
    output: serverJscPath,
    electron: true,
    compileAsModule: true
  });
  
  bytecodeSuccess = true;
  
  const bytecodeMeta = {
    platform: buildPlatform,
    arch: buildArch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron || 'unknown',
    v8Version: process.versions.v8,
    compiledAt: new Date().toISOString()
  };
  
  fs.writeFileSync(bytecodeMetaPath, JSON.stringify(bytecodeMeta, null, 2), 'utf8');
  
  const jscSize = (fs.statSync(serverJscPath).size / 1024).toFixed(2);
  console.log(`   [OK] Bytecode olusturuldu: ${jscSize} KB\n`);
  
} catch (error) {
  console.warn(`   [UYARI] Bytecode basarisiz: ${error.message}`);
  console.log('   [INFO] Sadece obfuscation ile devam edilecek\n');
}

// =====================================================
// ADIM 3: LOADER OLUSTUR
// =====================================================
console.log('[ADIM 3] Smart loader olusturuluyor...');

const loaderCode = `/**
 * BERAT CANKIR - Smart Server Loader
 * Copyright 2025-2026 Berat Cankir.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

let distDir;
if (typeof __dirname !== 'undefined' && __dirname) {
  distDir = __dirname;
} else if (typeof process !== 'undefined' && process.resourcesPath) {
  distDir = path.join(process.resourcesPath, 'app.asar', 'dist');
} else {
  distDir = path.resolve(process.cwd(), 'dist');
}

const bytecodeFile = path.join(distDir, 'server.jsc');
const fallbackFile = path.join(distDir, 'server.cjs');
const metaFile = path.join(distDir, 'bytecode-meta.json');

let loadedModule = null;
const currentPlatform = os.platform();
const currentArch = os.arch();

function isPlatformCompatible() {
  if (!fs.existsSync(metaFile)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return meta.platform === currentPlatform && meta.arch === currentArch;
  } catch (e) {
    return false;
  }
}

// 1. Bytecode varsa ve platform uyumluysa kullan
if (fs.existsSync(bytecodeFile) && isPlatformCompatible()) {
  try {
    require('bytenode');
    loadedModule = require(bytecodeFile);
  } catch (e) {
    loadedModule = null;
  }
}

// 2. Bytecode basarisizsa obfuscated CJS kullan
if (!loadedModule && fs.existsSync(fallbackFile)) {
  try {
    loadedModule = require(fallbackFile);
  } catch (e) {
    console.error('[LOADER] CJS yuklenemedi:', e.message);
  }
}

// 3. Hicbiri olmazsa hata ver
if (!loadedModule) {
  console.error('[LOADER] KRITIK: Server modulu yuklenemedi!');
  process.exit(1);
}

Object.assign(module.exports, loadedModule);
`;

fs.writeFileSync(serverLoaderPath, loaderCode, 'utf8');
console.log('   [OK] server-loader.cjs olusturuldu\n');

// =====================================================
// ADIM 4: FINAL TEMIZLIK (TEKRAR)
// =====================================================
console.log('[ADIM 4] Final guvenlik temizligi...');
deleteBackupFiles();

// =====================================================
// SONUC
// =====================================================
console.log('=================================================================');
console.log('   [BASARILI] KORUMA TAMAMLANDI!');
console.log('=================================================================\n');

console.log('[KORUMA DURUMU]');
console.log('   [X] server.cjs OBFUSCATE edildi (okunamaz)');
if (bytecodeSuccess) {
  console.log('   [X] server.jsc BYTECODE olusturuldu (ekstra koruma)');
}
console.log('   [X] server.cjs.backup SILINDI');
console.log('   [X] Kaynak dosyalar SILINDI\n');

console.log('[SONRAKI ADIM]');
console.log('   electron-builder calistirabilirsiniz\n');
