// Build script for bundling server for Electron
// BERAT CANKIR - Electron ASAR Paketleme Uyumlu Build Script
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function build() {
  try {
    console.log('[BUILD] Server bundle başlatılıyor...');
    
    // First, build the server bundle
    await esbuild.build({
      entryPoints: ['server/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: 'dist/server.cjs',
      keepNames: true,
      define: {
        'process.env.NODE_ENV': '"production"',
        // import.meta'yı CJS'te undefined olarak tanımla
        'import.meta.url': 'undefined',
        'import.meta': '{}'
      },
      external: [
        'lightningcss',
        'fs',
        'path',
        'crypto',
        'os',
        'util',
        'stream',
        'events',
        'http',
        'https',
        'url',
        'querystring',
        'zlib',
        'buffer',
        'module',
        'node:*'
      ],
      // Don't minify to make it easier to debug
      minify: false
    });
    
    console.log('[BUILD] Bundle oluşturuldu, post-processing başlıyor...');
    
    // Post-process: Fix createRequire calls
    const serverPath = path.join(__dirname, '..', 'dist', 'server.cjs');
    let content = fs.readFileSync(serverPath, 'utf-8');
    
    // Add robust __filename and __dirname polyfill at the top
    // KRITIK: Electron asar paketinde __filename undefined olabilir
    // Bu yüzden process.resourcesPath ile mutlak yol oluşturmalıyız
    const polyfill = `
// ============================================================================
// BERAT CANKIR - Electron ASAR Paket Uyumlu Polyfill
// ============================================================================
// KRITIK: __filename ve __dirname Electron paketinde undefined olabilir
// Bu polyfill saf CJS ortamında çalışır (import.meta YOK)
const _path = require('path');
const _fs = require('fs');

// Electron paket içinde mi kontrol et
// KRITIK: electron:dev modunda da process.resourcesPath tanımlı olduğundan
// ELECTRON_ENV ve NODE_ENV ortam değişkenlerini kullanıyoruz
// Electron main.cjs, packaged modda ELECTRON_ENV='true' ve NODE_ENV='production' ayarlıyor
const _isPackaged = 
  process.env.ELECTRON_ENV === 'true' && 
  process.env.NODE_ENV === 'production' &&
  typeof process.resourcesPath !== 'undefined' && 
  process.resourcesPath !== '';

console.log('[SERVER POLYFILL] NODE_ENV:', process.env.NODE_ENV);
console.log('[SERVER POLYFILL] ELECTRON_ENV:', process.env.ELECTRON_ENV);
console.log('[SERVER POLYFILL] _isPackaged:', _isPackaged);
console.log('[SERVER POLYFILL] process.resourcesPath:', process.resourcesPath || 'undefined');

// Güvenli __dirname polyfill
(function() {
  if (typeof __dirname !== 'undefined' && __dirname && __dirname !== '') {
    console.log('[SERVER POLYFILL] __dirname zaten tanımlı:', __dirname);
    return; // Zaten tanımlı
  }
  
  // Electron paketlenmiş uygulama - app.asar.unpacked içinden çalışıyor
  if (_isPackaged) {
    // Server kodu app.asar.unpacked/dist/ içinde
    global.__dirname = _path.join(process.resourcesPath, 'app.asar.unpacked', 'dist');
    console.log('[SERVER POLYFILL] __dirname ayarlandı (packaged):', global.__dirname);
  } else {
    // Geliştirme modu veya paketlenmemiş
    global.__dirname = _path.resolve(process.cwd(), 'dist');
    console.log('[SERVER POLYFILL] __dirname ayarlandı (dev/fallback):', global.__dirname);
  }
})();

// Güvenli __filename polyfill  
(function() {
  if (typeof __filename !== 'undefined' && __filename && __filename !== '') {
    return; // Zaten tanımlı
  }
  
  global.__filename = _path.join(__dirname, 'server.cjs');
})();

// KRITIK: Güvenli createRequire wrapper
// import.meta.url CJS'te ASLA çalışmaz
const _createRequire = require('module').createRequire;
function _getSafeRequire() {
  try {
    return _createRequire(__filename);
  } catch (e) {
    try {
      const fakePath = _path.join(process.cwd(), '__electron_require__.js');
      return _createRequire(fakePath);
    } catch (e2) {
      return require;
    }
  }
}
const _require = _getSafeRequire();

console.log('[SERVER] __dirname:', __dirname);
console.log('[SERVER] __filename:', __filename);
console.log('[SERVER] _isPackaged:', _isPackaged);
// ============================================================================
`;
    
    // Inject polyfill at the beginning
    content = polyfill + '\n' + content;
    
    // Fix any createRequire calls - use a proper CJS-compatible approach
    // Replace ALL problematic import.meta patterns
    // KRITIK: import.meta CJS'te çalışmaz, sadece __filename kullan
    
    // Pattern 1: createRequire(import.meta.url)
    content = content.replace(
      /createRequire\s*\(\s*import\.meta\.url\s*\)/g,
      '_createRequire(__filename)'
    );
    
    // Pattern 2: createRequire(undefined)
    content = content.replace(
      /createRequire\s*\(\s*undefined\s*\)/g,
      '_createRequire(__filename)'
    );
    
    // Pattern 3: createRequire()
    content = content.replace(
      /createRequire\s*\(\s*\)/g,
      '_createRequire(__filename)'
    );
    
    // Pattern 4: createRequire(__filename || import.meta.url)
    content = content.replace(
      /createRequire\s*\(\s*__filename\s*\|\|\s*import\.meta\.url\s*\)/g,
      '_createRequire(__filename)'
    );
    
    // Pattern 5: typeof import.meta !== 'undefined' kontrollerini false yap
    content = content.replace(
      /typeof\s+import\.meta\s*!==?\s*['"]undefined['"]/g,
      'false'
    );
    
    // Pattern 6: import.meta.url referanslarını __filename ile değiştir
    content = content.replace(
      /import\.meta\.url/g,
      '"file://" + __filename'
    );
    
    // Pattern 7: import.meta referanslarını boş obje yap
    content = content.replace(
      /import\.meta(?!\.)/g,
      '({})'
    );
    
    fs.writeFileSync(serverPath, content, 'utf-8');
    
    console.log('[BUILD] ✅ Server bundled successfully for Electron');
    console.log('[BUILD] Post-processing tamamlandı');
    
    // Verify the output
    const stats = fs.statSync(serverPath);
    console.log('[BUILD] Output size:', (stats.size / 1024).toFixed(2), 'KB');
    
  } catch (error) {
    console.error('❌ Server bundle failed:', error);
    process.exit(1);
  }
}

build();
