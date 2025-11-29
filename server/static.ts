import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function isElectronPackaged(): boolean {
  const resourcesPath = (process as any).resourcesPath || process.env.RESOURCES_PATH;
  
  return !!(
    process.env.ELECTRON_ENV === 'true' && 
    resourcesPath && 
    resourcesPath !== ''
  );
}

function getResourcesPath(): string | undefined {
  return (process as any).resourcesPath || process.env.RESOURCES_PATH;
}

function isElectronDev(): boolean {
  return !!(
    process.env.NODE_ENV === 'development' &&
    process.versions && 
    process.versions.electron
  );
}

function getCurrentDir() {
  if (isElectronPackaged()) {
    const resourcesPath = getResourcesPath();
    return path.join(resourcesPath!, 'app.asar.unpacked', 'dist');
  }
  
  try {
    if (typeof __dirname !== 'undefined' && __dirname && __dirname !== '') {
      return __dirname;
    }
  } catch {}
  
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  
  return process.cwd();
}

const currentDir = getCurrentDir();

export function log(message: string, source = "express") {
}

function findDistPublicPath(): string {
  const packaged = isElectronPackaged();
  const resourcesPath = getResourcesPath();
  
  if (packaged && resourcesPath) {
    const packagedPaths = [
      path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'public'),
      path.join(resourcesPath, 'dist', 'public'),
      path.join(resourcesPath, 'app.asar', 'dist', 'public'),
      path.join(resourcesPath, 'app', 'dist', 'public'),
      path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'dist', 'public'),
      path.join(process.cwd(), 'resources', 'dist', 'public'),
      path.join(process.cwd(), 'dist', 'public'),
    ];
    
    for (let i = 0; i < packagedPaths.length; i++) {
      const p = packagedPaths[i];
      try {
        const exists = fs.existsSync(p);
        
        if (exists) {
          const indexPath = path.join(p, 'index.html');
          const indexExists = fs.existsSync(indexPath);
          
          if (indexExists) {
            return p;
          }
        }
      } catch (err) {}
    }
    
    return packagedPaths[0];
  }
  
  const projectPaths = [
    path.resolve(process.cwd(), 'dist', 'public'),
    path.resolve(currentDir, '..', 'dist', 'public'),
    path.resolve(currentDir, 'public'),
  ];
  
  for (let i = 0; i < projectPaths.length; i++) {
    const p = projectPaths[i];
    try {
      const exists = fs.existsSync(p);
      
      if (exists && fs.statSync(p).isDirectory()) {
        const indexPath = path.join(p, 'index.html');
        const indexExists = fs.existsSync(indexPath);
        
        if (indexExists) {
          return p;
        }
      }
    } catch {}
  }
  
  return projectPaths[0];
}

export function serveStatic(app: Express) {
  const distPath = findDistPublicPath();
  const indexPath = path.join(distPath, 'index.html');

  const distExists = fs.existsSync(distPath);
  const indexExists = distExists && fs.existsSync(indexPath);

  if (!distExists || !indexExists) {
    const errorHtml = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uygulama Hatası</title>
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
      border: 1px solid rgba(139, 92, 246, 0.3);
    }
    h1 {
      color: #ef4444;
      margin-bottom: 20px;
      font-size: 24px;
    }
    p { 
      color: #94a3b8; 
      margin-bottom: 15px;
      line-height: 1.6;
    }
    .error-box {
      background: rgba(0,0,0,0.3);
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
      text-align: left;
      font-family: monospace;
      font-size: 12px;
      color: #fbbf24;
      word-break: break-all;
    }
    .tip {
      color: #8b5cf6;
      font-size: 14px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Frontend Dosyaları Bulunamadı</h1>
    <p>Uygulama arayüzü yüklenemedi. Build dosyaları eksik olabilir.</p>
    <div class="error-box">
      <strong>Aranan dizin:</strong><br>
      ${distPath}<br><br>
      <strong>Dizin mevcut:</strong> ${distExists ? 'Evet' : 'Hayır'}<br>
      <strong>index.html mevcut:</strong> ${indexExists ? 'Evet' : 'Hayır'}
    </div>
    <p class="tip">
      Bu sorunu çözmek için uygulamayı yeniden kurabilir veya 
      geliştiriciye başvurabilirsiniz.
    </p>
  </div>
</body>
</html>`;
    
    app.use("*", (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(500).send(errorHtml);
    });
    
    return;
  }

  app.use(express.static(distPath, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }));

  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
