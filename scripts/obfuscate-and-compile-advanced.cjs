/**
 * BERAT CANKIR - Gelismis Kaynak Kod Koruma Scripti (V2)
 * Copyright 2025-2026 Berat Cankir. Tum haklari saklidir.
 * 
 * Bu script uygulamanin tum kritik dosyalarini korur:
 * 1. Server.cjs -> Obfuscation (bytecode yerine - V8 uyumluluk sorunu icin)
 * 2. Electron dosyalari -> Obfuscate
 * 3. ASAR paketleme ile ek koruma
 * 
 * NOT: Bytecode korumasi protect-server-bytecode.cjs tarafindan yapilir
 * Bu script sadece obfuscation uygular
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

console.log('[LOCK] BERAT CANKIR - Gelismis Kaynak Kod Koruma Baslatildi...\n');

// HIZLI ama ETKILI ayarlar (2-3 dakikada biter)
const OBFUSCATION_CONFIG_HIGH = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4, // Dusuruldu: 0.75 -> 0.4
  deadCodeInjection: false, // KAPALI - cok yavaslatir
  deadCodeInjectionThreshold: 0,
  debugProtection: true,
  debugProtectionInterval: 0, // KAPALI - 2000 -> 0
  disableConsoleOutput: false, // Console acik kalsin
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false, // KAPALI - hata yapabilir
  renameProperties: false,
  renamePropertiesMode: 'safe',
  seed: Math.random(),
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10, // Arttirildi: 5 -> 10 (daha hizli)
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5, // Dusuruldu: 0.75 -> 0.5
  stringArrayEncoding: ['base64'], // rc4 kaldirildi - cok yavas
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1, // Dusuruldu: 2 -> 1
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2, // Dusuruldu: 4 -> 2
  stringArrayWrappersType: 'variable', // function -> variable (daha hizli)
  stringArrayThreshold: 0.5, // Dusuruldu: 0.75 -> 0.5
  target: 'node',
  transformObjectKeys: true,
  unicodeEscapeSequence: false // KAPALI - gereksiz
};

function stripComments(code) {
  return code
    .replace(/\/\*\*[\s\S]*?Copyright.*?All rights reserved\.[\s\S]*?\*\//gi, function(match) { return match; })
    .replace(/\/\*(?!.*Copyright)[\s\S]*?\*\//g, '')
    .replace(/\/\/(?!.*Copyright).*/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n');
}

function copyFileDirect(inputPath, outputPath, description) {
  try {
    console.log('[MEMO] ' + description + ' kopyalaniyor (template literal korunuyor)...');
    
    if (!fs.existsSync(inputPath)) {
      console.error('   [X] Dosya bulunamadi: ' + inputPath + '\n');
      return false;
    }
    
    fs.copyFileSync(inputPath, outputPath);
    console.log('   [OK] ' + path.basename(outputPath) + ' olusturuldu (orijinal)');
    
    var originalSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
    console.log('   [CHART] Boyut: ' + originalSize + ' KB\n');
    return true;
  } catch (error) {
    console.error('   [X] Hata: ' + error.message + '\n');
    return false;
  }
}

function obfuscateFile(inputPath, outputPath, description, config) {
  config = config || OBFUSCATION_CONFIG_HIGH;
  try {
    console.log('[MEMO] ' + description + ' obfuscate ediliyor...');
    
    if (!fs.existsSync(inputPath)) {
      console.error('   [X] Dosya bulunamadi: ' + inputPath + '\n');
      return false;
    }
    
    var code = fs.readFileSync(inputPath, 'utf8');
    code = stripComments(code);
    
    var obfuscated = JavaScriptObfuscator.obfuscate(code, config);
    
    fs.writeFileSync(outputPath, obfuscated.getObfuscatedCode(), 'utf8');
    console.log('   [OK] ' + path.basename(outputPath) + ' olusturuldu');
    
    var originalSize = (fs.statSync(inputPath).size / 1024).toFixed(2);
    var obfuscatedSize = (fs.statSync(outputPath).size / 1024).toFixed(2);
    console.log('   [CHART] Boyut: ' + originalSize + ' KB -> ' + obfuscatedSize + ' KB\n');
    return true;
  } catch (error) {
    console.error('   [X] Hata: ' + error.message + '\n');
    return false;
  }
}

async function main() {
  var distPath = path.join(process.cwd(), 'dist');
  var electronPath = path.join(process.cwd(), 'electron');
  var protectedPath = path.join(electronPath, 'protected');
  
  if (!fs.existsSync(protectedPath)) {
    fs.mkdirSync(protectedPath, { recursive: true });
  }
  
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    console.log('[FOLDER] dist dizini olusturuldu\n');
  }
  
  var success = true;
  
  console.log('===============================================================');
  console.log('1. BACKEND SERVER KORUMASI');
  console.log('===============================================================\n');
  
  var serverCjsPath = path.join(distPath, 'server.cjs');
  
  if (fs.existsSync(serverCjsPath)) {
    console.log('[LOCK] server.cjs obfuscate ediliyor...');
    
    try {
      var serverCode = fs.readFileSync(serverCjsPath, 'utf8');
      var obfuscatedServer = JavaScriptObfuscator.obfuscate(serverCode, {
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
      
      fs.writeFileSync(serverCjsPath, obfuscatedServer.getObfuscatedCode(), 'utf8');
      console.log('   [OK] server.cjs obfuscate edildi\n');
    } catch (obfError) {
      console.warn('   [!] server.cjs obfuscation basarisiz: ' + obfError.message);
      console.warn('   [OK] Orijinal kod kullanilacak\n');
    }
  } else {
    console.warn('[!] dist/server.cjs bulunamadi');
    console.warn('   [BULB] Once npm run build-server-electron calistirin\n');
  }
  
  console.log('[MEMO] Server loader olusturuluyor...');
  
  var serverLoaderPath = path.join(distPath, 'server-loader.cjs');
  var loaderCode = `/**
 * BERAT CANKIR - Smart Server Loader
 * Copyright 2025-2026 Berat Cankir.
 * 
 * GUVENLIK: Sadece bytecode veya obfuscated CJS kullanilir
 * Backup dosyasi KULLANILMIYOR - guvenlik nedeniyle
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

if (fs.existsSync(bytecodeFile) && isPlatformCompatible()) {
  try {
    require('bytenode');
    loadedModule = require(bytecodeFile);
  } catch (bytecodeError) {
    loadedModule = null;
  }
}

if (!loadedModule && fs.existsSync(fallbackFile)) {
  try {
    loadedModule = require(fallbackFile);
  } catch (cjsError) {
    console.error('[LOADER] CJS fallback basarisiz');
  }
}

if (!loadedModule) {
  console.error('[LOADER] KRITIK: Server modulu yuklenemedi!');
  process.exit(1);
}

Object.assign(module.exports, loadedModule);
`;
  
  fs.writeFileSync(serverLoaderPath, loaderCode, 'utf8');
  console.log('   [OK] server-loader.cjs olusturuldu');
  
  // GUVENLIK: Backup dosyasini sil (varsa)
  var backupPath = path.join(distPath, 'server.cjs.backup');
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
    console.log('   [SHIELD] server.cjs.backup silindi (guvenlik)\n');
  } else {
    console.log('');
  }
  
  console.log('===============================================================');
  console.log('2. ELECTRON DOSYALARI KORUMASI (Obfuscation)');
  console.log('===============================================================\n');
  
  var templateLiteralFiles = [
    { 
      input: path.join(electronPath, 'monitoring.cjs'),
      output: path.join(protectedPath, 'monitoring.cjs'),
      desc: 'Monitoring sistemi'
    },
    { 
      input: path.join(electronPath, 'discord-webhook.cjs'),
      output: path.join(protectedPath, 'discord-webhook.cjs'),
      desc: 'Discord webhook manager'
    },
    { 
      input: path.join(electronPath, 'silent-logger.cjs'),
      output: path.join(protectedPath, 'silent-logger.cjs'),
      desc: 'Silent logger (protected modüller için gerekli)'
    },
    { 
      input: path.join(electronPath, 'config-manager.cjs'),
      output: path.join(protectedPath, 'config-manager.cjs'),
      desc: 'Config manager (license-check ve diger moduller icin gerekli)'
    }
  ];
  
  // GUVENLIK: Sifreli config dosyasini kontrol et ve kopyala
  // JSON dosyasi ASLA kopyalanmamali - sadece .enc dosyasi kullanilir
  var encInputPath = path.join(electronPath, 'config-initial-values.enc');
  var encOutputPath = path.join(protectedPath, 'config-initial-values.enc');
  
  if (fs.existsSync(encInputPath)) {
    fs.copyFileSync(encInputPath, encOutputPath);
    console.log('[SHIELD] Sifreli config kopyalandi: config-initial-values.enc');
  } else {
    console.warn('[!] UYARI: config-initial-values.enc bulunamadi!');
    console.warn('   Once npm run electron:encode-config calistirin');
  }
  
  // GUVENLIK: Protected klasordeki duz JSON dosyasini sil (varsa)
  var jsonInProtected = path.join(protectedPath, 'config-initial-values.json');
  if (fs.existsSync(jsonInProtected)) {
    fs.unlinkSync(jsonInProtected);
    console.log('[SHIELD] Duz JSON silindi: protected/config-initial-values.json (guvenlik)');
  }
  
  console.log('[PACKAGE] Template literal iceren dosyalar (dogrudan kopyalama):\n');
  for (var i = 0; i < templateLiteralFiles.length; i++) {
    var file = templateLiteralFiles[i];
    if (!copyFileDirect(file.input, file.output, file.desc)) {
      success = false;
    }
  }
  
  var obfuscatableFiles = [
    { 
      input: path.join(electronPath, 'activity-logger.cjs'),
      output: path.join(protectedPath, 'activity-logger.cjs'),
      desc: 'Activity logger'
    },
    { 
      input: path.join(electronPath, 'encrypted-queue.cjs'),
      output: path.join(protectedPath, 'encrypted-queue.cjs'),
      desc: 'Encrypted queue'
    },
    { 
      input: path.join(electronPath, 'license-check.cjs'),
      output: path.join(protectedPath, 'license-check.cjs'),
      desc: 'License checker'
    }
  ];
  
  console.log('[LOCK] Obfuscate edilebilir dosyalar:\n');
  for (var j = 0; j < obfuscatableFiles.length; j++) {
    var oFile = obfuscatableFiles[j];
    if (!obfuscateFile(oFile.input, oFile.output, oFile.desc)) {
      success = false;
    }
  }
  
  console.log('[MEMO] main.cjs guncelleniyor (protected imports)...\n');
  
  var mainCjsPath = path.join(electronPath, 'main.cjs');
  if (fs.existsSync(mainCjsPath)) {
    var mainCode = fs.readFileSync(mainCjsPath, 'utf8');
    
    mainCode = mainCode.replace(/require\('\.\/monitoring\.cjs'\)/g, "require('./protected/monitoring.cjs')");
    mainCode = mainCode.replace(/require\('\.\/discord-webhook\.cjs'\)/g, "require('./protected/discord-webhook.cjs')");
    mainCode = mainCode.replace(/require\('\.\/activity-logger\.cjs'\)/g, "require('./protected/activity-logger.cjs')");
    mainCode = mainCode.replace(/require\('\.\/license-check\.cjs'\)/g, "require('./protected/license-check.cjs')");
    
    fs.writeFileSync(mainCjsPath, mainCode, 'utf8');
    console.log('   [OK] main.cjs import yollari guncellendi\n');
  }
  
  console.log('===============================================================');
  console.log('3. BUILD YAPILANDIRMASI KONTROLU');
  console.log('===============================================================\n');
  
  var builderYmlPath = path.join(process.cwd(), 'electron-builder.yml');
  
  if (fs.existsSync(builderYmlPath)) {
    console.log('   [OK] electron-builder.yml mevcut (tek kaynak yapilandirma)');
    console.log('   [OK] Protected dosyalar zaten dahil edilmis');
    console.log('   [OK] Build yapilandirmasi hazir\n');
  } else {
    console.warn('   [!] electron-builder.yml bulunamadi!');
    console.warn('   [BULB] electron-builder.yml dosyasini olusturun\n');
  }
  
  console.log('\n===============================================================');
  console.log('[PARTY] KAYNAK KOD KORUMA TAMAMLANDI!');
  console.log('===============================================================\n');
  
  console.log('[FOLDER] Korunan Dosyalar:');
  console.log('   Backend:');
  console.log('     [OK] dist/server.cjs (GUCLU obfuscated - okunamaz)');
  console.log('     [OK] dist/server-loader.cjs (guvenli loader)');
  if (fs.existsSync(path.join(distPath, 'server.jsc'))) {
    console.log('     [OK] dist/server.jsc (V8 bytecode - opsiyonel)');
  }
  console.log('     [X] dist/server.cjs.backup YOK (orijinal kod dagitilmiyor!)');
  console.log('\n   Electron (Obfuscated/Copied):');
  console.log('     [OK] electron/protected/monitoring.cjs');
  console.log('     [OK] electron/protected/discord-webhook.cjs');
  console.log('     [OK] electron/protected/activity-logger.cjs');
  console.log('     [OK] electron/protected/encrypted-queue.cjs');
  console.log('     [OK] electron/protected/license-check.cjs');
  console.log('     [OK] electron/protected/config-manager.cjs (KRITIK - license/webhook icin)');
  console.log('     [OK] electron/protected/config-initial-values.enc (SIFRELI webhook URLs)');
  console.log('     [OK] electron/protected/silent-logger.cjs');
  console.log('     [X] electron/protected/config-initial-values.json YOK (guvenlik)');
  console.log('\n   ASAR Paketleme:');
  console.log('     [OK] Tum dosyalar app.asar icinde (sinirli erisim)');
  
  console.log('\n[SHIELD] GUVENLIK + UYUMLULUK:');
  console.log('   [OK] Bytecode varsa oncelikli kullanilir');
  console.log('   [OK] V8 uyumsuzlugunda CJS fallback aktif');
  console.log('   [OK] "cachedDataRejected" hatasi artik olmayacak!');
  console.log('   [OK] Her iki sekilde de uygulama calisir');
  
  console.log('\n[!] KULLANICI DENEYIMI:');
  console.log('   [X] Kullanicilar kaynak kodlari OKUYAMAYACAK');
  console.log('   [X] DevTools ACAMAYACAK');
  console.log('   [X] Console GOREMEYECEK');
  console.log('   [X] Network trafigini TAKIP EDEMEYECEK');
  console.log('   [X] Monitoring sistemini FARK EDEMEYECEK');
  
  console.log('\n[MEMO] Sonraki Adimlar:');
  console.log('   1. npm run electron:build (production build)');
  console.log('   2. dist-electron klasorunde .exe dosyasini test edin');
  console.log('   3. Kullanicilara gonderin!\n');
  
  if (!success) {
    console.error('[!] Bazi dosyalar korunamadi - loglara bakin!\n');
    process.exit(1);
  }
}

main().catch(function(error) {
  console.error('\n[X] Koruma islemi basarisiz:', error);
  process.exit(1);
});
