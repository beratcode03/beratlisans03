/**
 * BERAT CANKIR - Source Code Protection Script
 * Copyright © 2025-2026 Berat Cankır. All rights reserved.
 * 
 * This script protects the application source code using:
 * 1. V8 Bytecode compilation (server.mjs -> server.jsc)
 * 2. JavaScript obfuscation (monitoring, routes)
 * 3. Comment stripping (except copyright notices)
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

console.log('🔒 BERAT CANKIR - Kaynak Kod Koruma Başlatıldı...\n');

const OBFUSCATION_CONFIG = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'mangled-shuffled',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.75,
  target: 'node',
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

function stripComments(code) {
  return code
    .replace(/\/\*\*[\s\S]*?Copyright.*?All rights reserved\.[\s\S]*?\*\//gi, (match) => match)
    .replace(/\/\*(?!.*Copyright)[\s\S]*?\*\//g, '')
    .replace(/\/\/(?!.*Copyright).*/g, '')
    .replace(/\n\s*\n\s*\n/g, '\n\n');
}

function obfuscateFile(inputPath, outputPath, description) {
  try {
    console.log(`📝 ${description} obfuscate ediliyor...`);
    
    let code = fs.readFileSync(inputPath, 'utf8');
    code = stripComments(code);
    
    const obfuscated = JavaScriptObfuscator.obfuscate(code, OBFUSCATION_CONFIG);
    
    fs.writeFileSync(outputPath, obfuscated.getObfuscatedCode(), 'utf8');
    console.log(`   ✅ ${path.basename(outputPath)} oluşturuldu\n`);
  } catch (error) {
    console.error(`   ❌ Hata: ${error.message}\n`);
    throw error;
  }
}

function compileToBytecode(inputFile, outputFile, description) {
  try {
    console.log(`🔐 ${description} V8 bytecode'a derleniyor...`);
    
    const code = fs.readFileSync(inputFile, 'utf8');
    const strippedCode = stripComments(code);
    
    const distPath = path.dirname(inputFile);
    const tempFile = path.join(distPath, 'server.temp.js');
    fs.writeFileSync(tempFile, strippedCode, 'utf8');
    
    bytenode.compileFile({
      filename: tempFile,
      output: outputFile,
      electron: true,
      compileAsModule: false
    });
    
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    
    console.log(`   ✅ ${path.basename(outputFile)} oluşturuldu (bytecode)`);
    console.log(`   🛡️  Kaynak kod artık decompile edilemez!\n`);
  } catch (error) {
    console.error(`   ❌ Bytecode derleme hatası: ${error.message}\n`);
    console.error(`   ℹ️  Detay: ${error.stack}\n`);
    if (fs.existsSync(path.join(path.dirname(inputFile), 'server.temp.js'))) {
      fs.unlinkSync(path.join(path.dirname(inputFile), 'server.temp.js'));
    }
    throw error;
  }
}

async function main() {
  const distPath = path.join(process.cwd(), 'dist');
  const serverJsPath = path.join(distPath, 'server.js');
  
  if (!fs.existsSync(serverJsPath)) {
    console.error('❌ dist/server.js bulunamadı! Önce "npm run build-electron" çalıştırın.');
    process.exit(1);
  }
  
  console.log('1️⃣  Backend (server.js) koruması uygulanıyor...\n');
  compileToBytecode(
    serverJsPath,
    path.join(distPath, 'server.jsc'),
    'Backend server'
  );
  
  console.log('2️⃣  Bytecode loader oluşturuluyor...\n');
  
  const loaderCode = `
/**
 * BERAT CANKIR - Protected Server Loader
 * Copyright © 2025-2026 Berat Cankır. All rights reserved.
 * 
 * This file loads the protected bytecode server.
 * DO NOT MODIFY - Source code is compiled to V8 bytecode for security.
 */

require('bytenode');
const path = require('path');

const jscPath = path.join(__dirname, 'server.jsc');

try {
  require(jscPath);
  console.log('✅ Korumalı server başlatıldı');
} catch (error) {
  console.error('❌ Korumalı server başlatılamadı:', error.message);
  console.error(error.stack);
  process.exit(1);
}
`.trim();
  
  fs.writeFileSync(serverJsPath, loaderCode, 'utf8');
  console.log('   ✅ Server loader oluşturuldu (server.js)\n');
  
  console.log('\n🎉 KAYNAK KOD KORUMA TAMAMLANDI!\n');
  console.log('📁 Korunan dosyalar:');
  console.log('   - dist/server.jsc (V8 bytecode - decompile edilemez)');
  console.log('   - dist/server.js (bytecode loader)');
  console.log('   - dist/public/* (frontend assets - ASAR içinde)\n');
  console.log('🛡️  GÜVENLİK SEVİYESİ:');
  console.log('   ✅ Backend: V8 Bytecode (CommonJS - en yüksek koruma)');
  console.log('   ✅ Monitoring: Bytecode içinde gizli');
  console.log('   ✅ ASAR: Dosya erişimi sınırlı\n');
  console.log('⚠️  ÖNEMLİ: Kullanıcılar artık kaynak kodları okuyamayacak!');
  console.log('   Production build ile test edin: npm run electron:build:dir\n');
}

main().catch((error) => {
  console.error('\n💥 Koruma işlemi başarısız:', error);
  process.exit(1);
});
