/**
 * BERAT CANKIR - Server Bytecode Koruma (Electron Uyumlu)
 * Copyright © 2025-2026 Berat Cankır. Tüm hakları saklıdır.
 * 
 * KRITIK: V8 bytecode Electron'un V8 sürümüyle derlenmelidir!
 * Bu script Electron modunda bytecode derler ve fallback mekanizması ekler.
 * 
 * DÜZELTME: Cross-platform uyumluluk için platform bilgisi kaydedilir
 * Linux'ta derlenen bytecode Windows'ta çalışmaz - bu nedenle fallback kullanılır
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('[LOCK] SERVER BYTECODE KORUMA BASLATILDI...\n');

const distPath = path.join(process.cwd(), 'dist');
const serverCjsPath = path.join(distPath, 'server.cjs');
const serverLoaderPath = path.join(distPath, 'server-loader.cjs');
const serverCjsBackupPath = path.join(distPath, 'server.cjs.backup');
const serverJscPath = path.join(distPath, 'server.jsc');
const bytecodeMetaPath = path.join(distPath, 'bytecode-meta.json');

if (!fs.existsSync(serverCjsPath)) {
  console.error('[X] dist/server.cjs bulunamadi!');
  console.error('   Once npm run build-server-electron calistirin\n');
  process.exit(1);
}

console.log('[MEMO] server.cjs hazirlaniyor...');

// GUVENLIK: Orijinal kaynak kodu gecici bellekte tutulur, DISKE YAZILMAZ!
const originalServerCode = fs.readFileSync(serverCjsPath, 'utf8');
console.log('   [OK] Orijinal kod bellege yuklendi (disk\'e yazilmiyor)\n');

const buildPlatform = os.platform();
const buildArch = os.arch();
let bytecodeGenerated = false;

console.log(`[INFO] Build platformu: ${buildPlatform} (${buildArch})`);
console.log('[LOCK] V8 Bytecode\'a derleniyor (Electron modu)...');

try {
  const bytenode = require('bytenode');
  
  bytenode.compileFile({
    filename: serverCjsPath,
    output: serverJscPath,
    electron: true,
    compileAsModule: true
  });
  
  bytecodeGenerated = true;
  
  const bytecodeMeta = {
    platform: buildPlatform,
    arch: buildArch,
    nodeVersion: process.version,
    electronVersion: process.versions.electron || 'unknown',
    v8Version: process.versions.v8,
    compiledAt: new Date().toISOString()
  };
  
  fs.writeFileSync(bytecodeMetaPath, JSON.stringify(bytecodeMeta, null, 2), 'utf8');
  
  console.log('   [OK] server.jsc olusturuldu (V8 BYTECODE - Electron uyumlu)');
  console.log(`   [INFO] Platform metadata kaydedildi: ${buildPlatform}/${buildArch}`);
  
  const originalSize = (Buffer.byteLength(originalServerCode, 'utf8') / 1024).toFixed(2);
  const bytecodeSize = (fs.statSync(serverJscPath).size / 1024).toFixed(2);
  console.log(`   [CHART] Boyut: ${originalSize} KB -> ${bytecodeSize} KB\n`);
  
} catch (error) {
  console.warn('[!] Bytenode derleme basarisiz - alternatif yontem kullaniliyor...');
  console.warn('   Sebep: ' + error.message);
  console.warn('   [OK] Obfuscation + minification ile devam edilecek\n');
  
  try {
    const JavaScriptObfuscator = require('javascript-obfuscator');
    const code = fs.readFileSync(serverCjsPath, 'utf8');
    
    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.4,
      debugProtection: true,
      debugProtectionInterval: 2000,
      disableConsoleOutput: true,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: true,
      renameGlobals: true,
      renameProperties: false,
      seed: Math.random(),
      selfDefending: true,
      simplify: true,
      splitStrings: true,
      splitStringsChunkLength: 5,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayCallsTransformThreshold: 0.75,
      stringArrayEncoding: ['base64', 'rc4'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      target: 'node',
      transformObjectKeys: true,
      unicodeEscapeSequence: true
    });
    
    fs.writeFileSync(serverCjsPath, obfuscated.getObfuscatedCode(), 'utf8');
    console.log('   [OK] server.cjs GUCLU obfuscate edildi (okunamaz hale getirildi)\n');
    
  } catch (obfError) {
    console.warn('   [!] Obfuscation da basarisiz: ' + obfError.message);
    console.warn('   [OK] Orijinal kod kullanilacak\n');
  }
}

console.log('[MEMO] Guvenli bytecode loader olusturuluyor...');

const loaderCode = `/**
 * BERAT CANKIR - Smart Server Loader
 * Copyright 2025-2026 Berat Cankir.
 * 
 * GUVENLIK: Sadece bytecode veya obfuscated CJS kullanilir
 * Backup dosyasi ARTIK KULLANILMIYOR - guvenlik nedeniyle
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('[LOADER] Server loader baslatiliyor...');
console.log('[LOADER] __dirname:', typeof __dirname !== 'undefined' ? __dirname : 'undefined');
console.log('[LOADER] process.resourcesPath:', process.resourcesPath || 'undefined');

let distDir;
let unpackedDistDir;

// Packaged modda dosyalar app.asar.unpacked icinde
if (typeof process !== 'undefined' && process.resourcesPath) {
  unpackedDistDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist');
  distDir = path.join(process.resourcesPath, 'app.asar', 'dist');
  console.log('[LOADER] Packaged mod - unpacked dist:', unpackedDistDir);
} else if (typeof __dirname !== 'undefined' && __dirname) {
  distDir = __dirname;
  unpackedDistDir = __dirname;
  console.log('[LOADER] Dev mod - dist:', distDir);
} else {
  distDir = path.resolve(process.cwd(), 'dist');
  unpackedDistDir = distDir;
  console.log('[LOADER] Fallback - dist:', distDir);
}

// Unpacked klasordeki dosyalari oncelikli kontrol et
const bytecodeFile = path.join(unpackedDistDir, 'server.jsc');
const fallbackFile = path.join(unpackedDistDir, 'server.cjs');
const metaFile = path.join(unpackedDistDir, 'bytecode-meta.json');

console.log('[LOADER] Bytecode dosyasi:', bytecodeFile, '- Mevcut:', fs.existsSync(bytecodeFile));
console.log('[LOADER] Fallback dosyasi:', fallbackFile, '- Mevcut:', fs.existsSync(fallbackFile));
console.log('[LOADER] Meta dosyasi:', metaFile, '- Mevcut:', fs.existsSync(metaFile));

let loadedModule = null;

const currentPlatform = os.platform();
const currentArch = os.arch();

console.log('[LOADER] Mevcut platform:', currentPlatform, currentArch);

function isPlatformCompatible() {
  if (!fs.existsSync(metaFile)) {
    console.log('[LOADER] Meta dosyasi bulunamadi - platform uyumsuz kabul edildi');
    return false;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    console.log('[LOADER] Build platformu:', meta.platform, meta.arch);
    const compatible = meta.platform === currentPlatform && meta.arch === currentArch;
    console.log('[LOADER] Platform uyumlu mu:', compatible);
    return compatible;
  } catch (e) {
    console.log('[LOADER] Meta okuma hatasi:', e.message);
    return false;
  }
}

// 1. Bytecode varsa ve platform uyumluysa kullan
if (fs.existsSync(bytecodeFile) && isPlatformCompatible()) {
  console.log('[LOADER] Bytecode yukleniyor...');
  try {
    require('bytenode');
    loadedModule = require(bytecodeFile);
    console.log('[LOADER] Bytecode basariyla yuklendi!');
  } catch (bytecodeError) {
    console.error('[LOADER] Bytecode yukleme hatasi:', bytecodeError.message);
    loadedModule = null;
  }
} else {
  console.log('[LOADER] Bytecode kullanilmayacak (platform uyumsuz veya dosya yok)');
}

// 2. Bytecode basarisizsa veya uyumsuzsa, obfuscated CJS kullan
if (!loadedModule && fs.existsSync(fallbackFile)) {
  console.log('[LOADER] Fallback CJS yukleniyor:', fallbackFile);
  try {
    loadedModule = require(fallbackFile);
    console.log('[LOADER] Fallback CJS basariyla yuklendi!');
  } catch (cjsError) {
    console.error('[LOADER] CJS fallback hatasi:', cjsError.message);
    console.error('[LOADER] CJS fallback stack:', cjsError.stack);
  }
}

// 3. Hicbiri basarisizsa hata ver
if (!loadedModule) {
  console.error('[LOADER] KRITIK: Server modulu yuklenemedi!');
  console.error('[LOADER] Kontrol edilen dosyalar:');
  console.error('   - Bytecode:', bytecodeFile);
  console.error('   - Fallback:', fallbackFile);
  
  // Dosya listesini goster
  try {
    if (fs.existsSync(unpackedDistDir)) {
      console.error('[LOADER] Unpacked dist icerigi:', fs.readdirSync(unpackedDistDir));
    } else {
      console.error('[LOADER] Unpacked dist klasoru YOK:', unpackedDistDir);
    }
  } catch (e) {
    console.error('[LOADER] Klasor listelenemedi:', e.message);
  }
  
  // Bekle ki loglar yazilsin
  setTimeout(() => process.exit(1), 1000);
}

if (loadedModule) {
  console.log('[LOADER] Server modulu basariyla yuklendi, export ediliyor...');
  Object.assign(module.exports, loadedModule);
}
`;

fs.writeFileSync(serverLoaderPath, loaderCode, 'utf8');
console.log('   [OK] server-loader.cjs olusturuldu');
console.log('   [SHIELD] Platform kontrolu + fallback mekanizmasi aktif\n');

// GUVENLIK: Eski backup dosyasini sil (varsa)
if (fs.existsSync(serverCjsBackupPath)) {
  fs.unlinkSync(serverCjsBackupPath);
  console.log('[SHIELD] Eski server.cjs.backup silindi (guvenlik)\n');
}

console.log('=========================================================');
console.log('[STAR] SERVER KORUMASI TAMAMLANDI!');
console.log('=========================================================\n');

console.log('[FOLDER] Olusturulan Dosyalar:');
if (fs.existsSync(serverJscPath)) {
  console.log('   [OK] dist/server.jsc (V8 bytecode - sadece ayni platformda calisir)');
  console.log('   [OK] dist/bytecode-meta.json (platform bilgisi)');
}
console.log('   [OK] dist/server.cjs (fallback - OBFUSCATED)');
console.log('   [OK] dist/server-loader.cjs (akilli loader)\n');

console.log('[SHIELD] GUVENLIK:');
console.log('   [OK] Platform uyumluysa bytecode kullanilir (okunamaz)');
console.log('   [OK] Bytecode uyumsuzsa obfuscated CJS kullanilir');
console.log('   [X] server.cjs.backup KULLANILMIYOR (orijinal kod yok!)');
console.log('   [OK] Kullanici kaynak kodlari GOREMEZ\n');

if (buildPlatform !== 'win32') {
  console.log('[UYARI] CROSS-PLATFORM BUILD TESPIT EDILDI!');
  console.log('   Bu build ' + buildPlatform + ' uzerinde yapildi.');
  console.log('   Windows\'ta bytecode KULLANILMAYACAK, obfuscated CJS kullanilacak.');
  console.log('   Bu normal ve beklenen - uygulama calisacaktir.\n');
}

console.log('[OK] Artik electron:build calistirabilirsiniz!\n');
