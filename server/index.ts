process.env.DOTENV_CONFIG_QUIET = "true";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), '.env'), debug: false });

import express from "express";
import { registerRoutes } from "./rotalar";
import { serveStatic } from "./static";
import { validateEnvironmentVariables } from "./env-validation";
import { storage } from "./depolama";
import { licenseScheduler } from "./license-scheduler";

validateEnvironmentVariables();

const app = express();

if (process.env.NODE_ENV === "production" || process.env.ELECTRON_ENV === "true") {
  app.set("env", "production");
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";

  server.listen(port, host, () => {
    licenseScheduler.start();
  });

  function scheduleAutoArchive() {
    const now = new Date();
    const turkeyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    
    const nextSunday = new Date(turkeyTime);
    const currentDay = nextSunday.getDay();
    
    let daysUntilSunday: number;
    if (currentDay === 0) {
      const targetTime = new Date(turkeyTime);
      targetTime.setHours(23, 59, 0, 0);
      daysUntilSunday = turkeyTime < targetTime ? 0 : 7;
    } else {
      daysUntilSunday = 7 - currentDay;
    }
    
    nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
    nextSunday.setHours(23, 59, 0, 0);
    
    const msUntilSunday = nextSunday.getTime() - turkeyTime.getTime();

    setTimeout(() => {
      storage.autoArchiveOldData()
        .then(() => {})
        .catch((error) => {});
      
      setInterval(() => {
        storage.autoArchiveOldData()
          .then(() => {})
          .catch((error) => {});
      }, 7 * 24 * 60 * 60 * 1000);
    }, msUntilSunday);
  }

  scheduleAutoArchive();
})();
