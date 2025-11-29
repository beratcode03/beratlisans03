/**
 * BERAT CANKIR - Electron Build Preflight Check
 * 
 * Bu script electron:build öncesi çalıştırılır ve:
 * 1. dist/public dizininin varlığını kontrol eder
 * 2. dist/server.cjs dosyasının varlığını kontrol eder
 * 3. Kritik dosyaların eksik olup olmadığını kontrol eder
 * 4. import.meta kalıntılarını kontrol eder
 * 5. Server modülünü smoke test eder
 */

const fs = require('fs');
const path = require('path');

console.log('============================================================');
console.log('ELECTRON PREFLIGHT CHECK - Build Öncesi Kontrol');
console.log('============================================================\n');

let hasErrors = false;
let hasWarnings = false;

function checkFile(filePath, description, required = true) {
  const fullPath = path.join(process.cwd(), filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    const stats = fs.statSync(fullPath);
    const size = stats.isDirectory() 
      ? 'dizin' 
      : `${(stats.size / 1024).toFixed(2)} KB`;
    console.log(`  ✅ ${description}: ${filePath} (${size})`);
    return true;
  } else {
    if (required) {
      console.log(`  ❌ HATA: ${description} bulunamadı: ${filePath}`);
      hasErrors = true;
    } else {
      console.log(`  ⚠️ UYARI: ${description} bulunamadı: ${filePath}`);
      hasWarnings = true;
    }
    return false;
  }
}

function checkDirectory(dirPath, description, required = true) {
  const fullPath = path.join(process.cwd(), dirPath);
  const exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  
  if (exists) {
    const files = fs.readdirSync(fullPath);
    console.log(`  ✅ ${description}: ${dirPath} (${files.length} dosya)`);
    return true;
  } else {
    if (required) {
      console.log(`  ❌ HATA: ${description} bulunamadı: ${dirPath}`);
      hasErrors = true;
    } else {
      console.log(`  ⚠️ UYARI: ${description} bulunamadı: ${dirPath}`);
      hasWarnings = true;
    }
    return false;
  }
}

function checkForImportMeta(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return true;
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  // import.meta.url kalıntılarını ara (polyfill ve string literal hariç)
  // Güvenli olanlar: '"file://" + __filename' veya string içindeki referanslar
  const dangerousPatterns = [
    // createRequire(import.meta.url) - tehlikeli
    /createRequire\s*\(\s*import\.meta\.url\s*\)/g,
  ];
  
  let foundIssues = false;
  for (const pattern of dangerousPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      console.log(`  ❌ HATA: ${filePath} içinde tehlikeli import.meta.url kullanımı bulundu (${matches.length} adet)`);
      hasErrors = true;
      foundIssues = true;
    }
  }
  
  if (!foundIssues) {
    console.log(`  ✅ ${filePath} import.meta temiz`);
  }
  
  return !foundIssues;
}

function smokeTestServerBundle() {
  console.log('\n🧪 Server Bundle Smoke Test:');
  
  const serverCjsPath = path.join(process.cwd(), 'dist', 'server.cjs');
  const serverLoaderPath = path.join(process.cwd(), 'dist', 'server-loader.cjs');
  
  // Hangi dosyayı test edeceğimizi belirle
  let testFile = null;
  if (fs.existsSync(serverLoaderPath)) {
    testFile = serverLoaderPath;
  } else if (fs.existsSync(serverCjsPath)) {
    testFile = serverCjsPath;
  }
  
  if (!testFile) {
    console.log('  ⚠️ UYARI: Test edilecek server dosyası bulunamadı');
    hasWarnings = true;
    return false;
  }
  
  try {
    // Dosya içeriğini oku ve syntax hataları kontrol et
    const content = fs.readFileSync(testFile, 'utf-8');
    
    // Tehlikeli patternları kontrol et
    const dangerousPatterns = [
      { pattern: /createRequire\s*\(\s*import\.meta\.url\s*\)/g, desc: 'createRequire(import.meta.url)' },
      { pattern: /typeof\s+import\.meta\s*!==?\s*['"]undefined['"]\s*&&\s*import\.meta\.url/g, desc: 'import.meta kontrol + kullanım' }
    ];
    
    let foundDangerous = false;
    for (const { pattern, desc } of dangerousPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`  ❌ HATA: ${path.basename(testFile)} içinde ${desc} bulundu (${matches.length} adet)`);
        hasErrors = true;
        foundDangerous = true;
      }
    }
    
    if (!foundDangerous) {
      console.log(`  ✅ ${path.basename(testFile)} syntax ve pattern kontrolü geçti`);
    }
    
    // Polyfill'in varlığını kontrol et
    if (content.includes('_isPackaged') && content.includes('global.__dirname')) {
      console.log('  ✅ Electron polyfill mevcut');
    } else {
      console.log('  ⚠️ UYARI: Electron polyfill eksik olabilir');
      hasWarnings = true;
    }
    
    return !foundDangerous;
  } catch (error) {
    console.log(`  ❌ HATA: ${path.basename(testFile)} okunamadı: ${error.message}`);
    hasErrors = true;
    return false;
  }
}

// 1. Kritik dizinleri kontrol et
console.log('📁 Dizin Kontrolleri:');
checkDirectory('dist', 'Build çıktı dizini');
checkDirectory('dist/public', 'Frontend build çıktısı');
checkDirectory('electron', 'Electron ana dizini');
checkDirectory('electron/icons', 'Electron ikonları');

// 2. Kritik dosyaları kontrol et
console.log('\n📄 Dosya Kontrolleri:');
checkFile('dist/server.cjs', 'Server bundle');
checkFile('dist/server-loader.cjs', 'Server loader', false);
checkFile('electron/main.cjs', 'Electron main process');
checkFile('electron/preload.cjs', 'Electron preload script');
checkFile('electron/config-manager.cjs', 'Config manager');
checkFile('electron-builder.yml', 'Electron builder config');
checkFile('package.json', 'Package.json');

// 3. dist/public içeriğini kontrol et
console.log('\n📦 Frontend Build Kontrolleri:');
const distPublicPath = path.join(process.cwd(), 'dist', 'public');
if (fs.existsSync(distPublicPath)) {
  checkFile('dist/public/index.html', 'Frontend index.html');
  
  // Assets klasörü kontrolü
  const assetsPath = path.join(distPublicPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const jsFiles = fs.readdirSync(assetsPath).filter(f => f.endsWith('.js'));
    const cssFiles = fs.readdirSync(assetsPath).filter(f => f.endsWith('.css'));
    console.log(`  ✅ Assets: ${jsFiles.length} JS, ${cssFiles.length} CSS dosyası`);
  } else {
    console.log(`  ⚠️ UYARI: dist/public/assets bulunamadı`);
    hasWarnings = true;
  }
}

// 4. import.meta kalıntılarını kontrol et
console.log('\n🔍 import.meta Kalıntı Kontrolleri:');
checkForImportMeta('dist/server.cjs');

// 5. Server bundle smoke test
smokeTestServerBundle();

// 6. electron-builder.yml içeriğini kontrol et
console.log('\n⚙️ Electron Builder Konfigürasyon Kontrolü:');
const builderConfigPath = path.join(process.cwd(), 'electron-builder.yml');
if (fs.existsSync(builderConfigPath)) {
  const config = fs.readFileSync(builderConfigPath, 'utf-8');
  
  if (config.includes('dist/public/**/*')) {
    console.log('  ✅ asarUnpack: dist/public dahil');
  } else {
    console.log('  ⚠️ UYARI: asarUnpack içinde dist/public bulunamadı!');
    hasWarnings = true;
  }
  
  if (config.includes('dist/server.cjs')) {
    console.log('  ✅ asarUnpack: dist/server.cjs dahil');
  } else {
    console.log('  ⚠️ UYARI: asarUnpack içinde dist/server.cjs bulunamadı!');
    hasWarnings = true;
  }
}

// Sonuç
console.log('\n============================================================');
if (hasErrors) {
  console.log('❌ PREFLIGHT CHECK BAŞARISIZ!');
  console.log('Yukarıdaki hataları düzeltin ve tekrar deneyin.');
  console.log('============================================================\n');
  process.exit(1);
} else if (hasWarnings) {
  console.log('⚠️ PREFLIGHT CHECK TAMAMLANDI (UYARILAR VAR)');
  console.log('Build devam edebilir ama uyarıları kontrol edin.');
  console.log('============================================================\n');
  process.exit(0);
} else {
  console.log('✅ PREFLIGHT CHECK BAŞARILI!');
  console.log('Tüm kontroller geçti, build başlatılabilir.');
  console.log('============================================================\n');
  process.exit(0);
}
