// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

export function MidnightCountdown() {
  const [timeUntilMidnight, setTimeUntilMidnight] = useState("");

  useEffect(() => {
    const calculateTimeUntilMidnight = () => {
      // Türkiye saati için bugün 23:59'a kalan süre (GMT+3)
      const now = new Date();
      const turkeyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
      
      // Bugün 23:59'u hesapla
      const todayMidnight = new Date(turkeyTime);
      todayMidnight.setHours(23, 59, 59, 999);
      
      const diff = todayMidnight.getTime() - turkeyTime.getTime();
      
      // Eğer bugün 23:59 geçtiyse (negatif), yarın 23:59'a kadar hesapla
      const timeDiff = diff > 0 ? diff : diff + (24 * 60 * 60 * 1000);
      
      const hours = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
      
      return `${hours.toString().padStart(2, '0')}sa:${minutes.toString().padStart(2, '0')}dk:${seconds.toString().padStart(2, '0')}sn`;
    };

    const updateTimer = () => {
      setTimeUntilMidnight(calculateTimeUntilMidnight());
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 rounded-lg border border-purple-200 dark:border-purple-800">
      <Clock className="h-4 w-4" />
      <div className="flex flex-col">
        <span className="text-xs font-medium">Gün Sonu 23:59</span>
        <span className="text-sm font-bold font-mono">{timeUntilMidnight}</span>
      </div>
    </div>
  );
}

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
