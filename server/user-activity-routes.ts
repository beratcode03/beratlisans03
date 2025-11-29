import { type Express, type Request, type Response } from "express";
import UserActivityLogger from "./user-activity-logger";

export function registerUserActivityRoutes(app: Express) {
  // Tüm kullanıcı aktivitelerini getir
  app.get("/api/user-activities", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      // ✅ DÜZELTME: Tüm aktiviteleri getir (userId'ye göre değil)
      const activities = UserActivityLogger.getRecent(limit);
      
      res.json({
        success: true,
        activities: activities, // ✅ "data" yerine "activities" kullan (electron uyumlu)
        total: activities.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Aktiviteler alınamadı",
        activities: []
      });
    }
  });

  // Tüm aktiviteleri temizle
  app.post("/api/user-activities/clear", async (req: Request, res: Response) => {
    try {
      // ✅ DÜZELTME: Tüm aktiviteleri sil
      const allActivities = UserActivityLogger.getAll();
      const removedCount = allActivities.length;
      
      // Tüm aktiviteleri sil
      UserActivityLogger.clear();
      
      res.json({
        success: true,
        message: `${removedCount} aktivite temizlendi`,
        removedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Aktiviteler temizlenemedi",
      });
    }
  });

  // Eski aktiviteleri temizle (30+ gün önceki)
  app.delete("/api/user-activities/old", async (req: Request, res: Response) => {
    try {
      const daysToKeep = parseInt(req.query.days as string) || 30;
      const removedCount = UserActivityLogger.clearOld(daysToKeep);
      
      res.json({
        success: true,
        message: `${removedCount} eski aktivite temizlendi`,
        removedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Eski aktiviteler temizlenemedi",
      });
    }
  });
}
