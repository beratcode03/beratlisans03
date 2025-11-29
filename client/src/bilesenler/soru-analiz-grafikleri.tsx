// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { BookOpen, Calendar, RefreshCw } from "lucide-react";
import { Button } from "@/bilesenler/arayuz/button";
import { Input } from "@/bilesenler/arayuz/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/bilesenler/arayuz/popover";
import { QuestionLog } from "@shared/sema";
import { getTodayTurkey } from "@shared/utils/date";

export function QuestionAnalysisCharts() {
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | '3month' | '6month'>('daily');
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 13);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => getTodayTurkey());
  // Geçici state değerleri - Uygula butonuna basana kadar aktif değil
  const [tempStartDate, setTempStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 13);
    return date.toISOString().split('T')[0];
  });
  const [tempEndDate, setTempEndDate] = useState(() => getTodayTurkey());
  
  const { data: questionLogs = [] } = useQuery<QuestionLog[]>({
    queryKey: ["/api/question-logs"],
  });
  
  // Arşivlenen soru kayıtlarını da çek
  const { data: archivedQuestionLogs = [] } = useQuery<QuestionLog[]>({
    queryKey: ["/api/question-logs/archived"],
  });
  
  // Deneme sonuçlarını ve arşivleri çek (Günlük Soru Çözüm Analizi için)
  const { data: examResults = [] } = useQuery<any[]>({
    queryKey: ["/api/exam-results"],
  });
  
  const { data: archivedExamResults = [] } = useQuery<any[]>({
    queryKey: ["/api/exam-results/archived"],
  });
  
  const { data: examSubjectNets = [] } = useQuery<any[]>({
    queryKey: ["/api/exam-subject-nets"],
  });
  
  // Hem soru kayıtlarını hem de deneme verilerini birleştir
  const allQuestionLogs = useMemo(() => {
    return [...questionLogs, ...archivedQuestionLogs];
  }, [questionLogs, archivedQuestionLogs]);
  
  const allExamResults = useMemo(() => {
    return [...examResults, ...archivedExamResults];
  }, [examResults, archivedExamResults]);

  // Günlük/haftalık soru tablosu verilerini hazırlayın - HEM SORU KAYITLARINDAN HEM DENEME SONUÇLARINDAN
  const prepareDailyWeeklyData = () => {
    // Eğer hem soru kayıtları hem de deneme sonuçları yoksa boş döndür
    if (allQuestionLogs.length === 0 && allExamResults.length === 0) return [];

    if (viewMode === 'daily') {
      let dateRange: string[];
      
      if (useCustomDates) {
        // Başlangıç ve bitiş tarihleri arasında tarih aralığı oluşturun
        const start = new Date(startDate);
        const end = new Date(endDate);
        dateRange = [];
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dateRange.push(d.toISOString().split('T')[0]);
        }
      } else {
        // Varsayılan: bugün dahil son 14 gün (bugünden 13 gün geriye)
        dateRange = Array.from({ length: 14 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() - 13 + i);
          return date.toISOString().split('T')[0];
        });
      }

      return dateRange.map(dateStr => {
        // Saat 3 kuralı: Saat 00:00-02:59 arası kayıtlar bir önceki güne ait
        const dayLogs = allQuestionLogs.filter(log => {
          let logDate = log.study_date;
          
          // createdAt varsa saat kontrolü yap
          if (log.createdAt) {
            const created = new Date(log.createdAt);
            const hour = created.getHours();
            
            // Saat 0-2 arası ise bir gün öncesi sayılır
            if (hour >= 0 && hour < 3) {
              const adjustedDate = new Date(created);
              adjustedDate.setDate(adjustedDate.getDate() - 1);
              logDate = adjustedDate.toISOString().split('T')[0];
            }
          }
          
          return logDate === dateStr;
        });
        
        let questionCorrect = dayLogs.reduce((sum, log) => sum + (Number(log.correct_count) || 0), 0);
        let questionWrong = dayLogs.reduce((sum, log) => sum + (Number(log.wrong_count) || 0), 0);
        let questionBlank = dayLogs.reduce((sum, log) => sum + (Number(log.blank_count) || 0), 0);
        
        // Deneme sonuçlarından veri topla (saat 3 kuralı ile)
        const dayExams = allExamResults.filter(exam => {
          let examDate = exam.exam_date;
          
          // createdAt varsa saat kontrolü yap
          if (exam.createdAt) {
            const created = new Date(exam.createdAt);
            const hour = created.getHours();
            
            // Saat 0-2 arası ise bir gün öncesi sayılır
            if (hour >= 0 && hour < 3) {
              const adjustedDate = new Date(created);
              adjustedDate.setDate(adjustedDate.getDate() - 1);
              examDate = adjustedDate.toISOString().split('T')[0];
            }
          }
          
          return examDate === dateStr;
        });
        let examCorrect = 0;
        let examWrong = 0;
        let examBlank = 0;
        let examTytQuestions = 0;
        let examAytQuestions = 0;
        
        dayExams.forEach(exam => {
          // subjects_data'yı parse et
          if (exam.subjects_data) {
            try {
              const subjectsData = typeof exam.subjects_data === 'string' ? JSON.parse(exam.subjects_data) : exam.subjects_data;
              Object.entries(subjectsData).forEach(([key, data]: [string, any]) => {
                const correct = Number(data.correct) || 0;
                const wrong = Number(data.wrong) || 0;
                const blank = Number(data.blank) || 0;
                
                examCorrect += correct;
                examWrong += wrong;
                examBlank += blank;
                
                // TYT/AYT ayrımı
                if (exam.exam_type === 'TYT') {
                  examTytQuestions += correct + wrong;
                } else if (exam.exam_type === 'AYT') {
                  examAytQuestions += correct + wrong;
                }
              });
            } catch (e) {
            }
          }
        });
        
        // Her iki kaynağı birleştir
        let correctQuestions = questionCorrect + examCorrect;
        let wrongQuestions = questionWrong + examWrong;
        let blankQuestions = questionBlank + examBlank;
        let totalQuestions = correctQuestions + wrongQuestions; // Boş dahil değil, sadece doğru + yanlış
        
        // TYT ve AYT sayılarını ayrı hesapla (hem sorulardan hem denemelerden)
        let tytQuestions = dayLogs.filter(log => log.exam_type === 'TYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examTytQuestions;
        let aytQuestions = dayLogs.filter(log => log.exam_type === 'AYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examAytQuestions;
        
        const attempted = correctQuestions + wrongQuestions;
        const totalAttempted = correctQuestions + wrongQuestions;
        
        return {
          date: dateStr,
          dayName: new Date(dateStr).toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }),
          totalQuestions,
          correctQuestions,
          wrongQuestions,
          blankQuestions,
          tytQuestions,
          aytQuestions,
          successRate: attempted > 0 ? Math.round((correctQuestions / attempted) * 100) : 0,
          totalAttempted
        };
      });
    } else if (viewMode === 'weekly') {
      // Haftalık toplama
      const weeks = [];
      const today = new Date();
      
      // Tarih aralığını belirle
      let customStart: Date | null = null;
      let customEnd: Date | null = null;
      if (useCustomDates) {
        customStart = new Date(startDate);
        customEnd = new Date(endDate);
      }
      
      const weeksToShow = useCustomDates ? 52 : 6; // Haftalık görünüm için son 6 hafta
      
      for (let i = weeksToShow - 1; i >= 0; i--) {
        // Hedef haftanın Pazartesi'sini hesaplayın (ISO hafta başlangıcı) UTC'de
        const weekStart = new Date(today);
        const daysFromMonday = (today.getUTCDay() + 6) % 7;
        weekStart.setUTCDate(today.getUTCDate() - (i * 7) - daysFromMonday);
        weekStart.setUTCHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
        weekEnd.setUTCHours(23, 59, 59, 999);
        
        // Custom date kontrolü - hafta tamamen aralık dışındaysa atla
        if (useCustomDates && customStart && customEnd) {
          if (weekEnd < customStart || weekStart > customEnd) {
            continue; // Bu haftayı atla
          }
        }
        
        // UTC tabanlı dize karşılaştırması kullanarak bu haftanın günlüklerini filtrele
        const weekLogs = allQuestionLogs.filter(log => {
          const logDateStr = log.study_date;
          const weekStartStr = weekStart.toISOString().slice(0, 10);
          const weekEndStr = weekEnd.toISOString().slice(0, 10);
          return logDateStr >= weekStartStr && logDateStr <= weekEndStr;
        });
        
        // Soru kayıtlarından haftalık veri topla
        let questionCorrect = weekLogs.reduce((sum, log) => sum + (Number(log.correct_count) || 0), 0);
        let questionWrong = weekLogs.reduce((sum, log) => sum + (Number(log.wrong_count) || 0), 0);
        let questionBlank = weekLogs.reduce((sum, log) => sum + (Number(log.blank_count) || 0), 0);
        
        // Deneme sonuçlarından haftalık veri topla
        const weekExams = allExamResults.filter(exam => {
          const examDateStr = exam.exam_date;
          const weekStartStr = weekStart.toISOString().slice(0, 10);
          const weekEndStr = weekEnd.toISOString().slice(0, 10);
          return examDateStr >= weekStartStr && examDateStr <= weekEndStr;
        });
        
        let examCorrect = 0;
        let examWrong = 0;
        let examBlank = 0;
        let examTytQuestions = 0;
        let examAytQuestions = 0;
        
        weekExams.forEach(exam => {
          // subjects_data'yı parse et
          if (exam.subjects_data) {
            try {
              const subjectsData = typeof exam.subjects_data === 'string' ? JSON.parse(exam.subjects_data) : exam.subjects_data;
              Object.entries(subjectsData).forEach(([key, data]: [string, any]) => {
                const correct = Number(data.correct) || 0;
                const wrong = Number(data.wrong) || 0;
                const blank = Number(data.blank) || 0;
                
                examCorrect += correct;
                examWrong += wrong;
                examBlank += blank;
                
                // TYT/AYT ayrımı
                if (exam.exam_type === 'TYT') {
                  examTytQuestions += correct + wrong;
                } else if (exam.exam_type === 'AYT') {
                  examAytQuestions += correct + wrong;
                }
              });
            } catch (e) {
            }
          }
        });
        
        // Her iki kaynağı birleştir
        let correctQuestions = questionCorrect + examCorrect;
        let wrongQuestions = questionWrong + examWrong;
        let blankQuestions = questionBlank + examBlank;
        let totalQuestions = correctQuestions + wrongQuestions; // Boş dahil değil, sadece doğru + yanlış
        
        // TYT ve AYT sayılarını ayrı hesapla (hem sorulardan hem denemelerden)
        let tytQuestions = weekLogs.filter(log => log.exam_type === 'TYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examTytQuestions;
        let aytQuestions = weekLogs.filter(log => log.exam_type === 'AYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examAytQuestions;
        
        const attempted = correctQuestions + wrongQuestions;
        const totalAttempted = correctQuestions + wrongQuestions;
        
        // Tarih aralığı içeren açıklayıcı hafta etiketi oluştuR
        const weekKey = `${weekStart.getUTCFullYear()}-W${String(8 - i).padStart(2, '0')}`;
        const startMonth = weekStart.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' });
        const endMonth = weekEnd.toLocaleDateString('tr-TR', { month: 'short', timeZone: 'UTC' });
        const startYear = weekStart.getUTCFullYear();
        const endYear = weekEnd.getUTCFullYear();
        
        let weekLabel;
        if (startMonth === endMonth && startYear === endYear) {
          // Aynı ay ve yıl
          weekLabel = `${weekStart.getUTCDate().toString().padStart(2, '0')}–${weekEnd.getUTCDate().toString().padStart(2, '0')} ${startMonth}`;
        } else if (startYear === endYear) {
          // Farklı aylar
          weekLabel = `${weekStart.getUTCDate().toString().padStart(2, '0')} ${startMonth} – ${weekEnd.getUTCDate().toString().padStart(2, '0')} ${endMonth}`;
        } else {
          // Farklı yıllar
          weekLabel = `${weekStart.getUTCDate().toString().padStart(2, '0')} ${startMonth} ${startYear} – ${weekEnd.getUTCDate().toString().padStart(2, '0')} ${endMonth} ${endYear}`;
        }
        
        weeks.push({
          date: weekKey,
          dayName: weekLabel,
          totalQuestions,
          correctQuestions,
          wrongQuestions,
          blankQuestions,
          tytQuestions,
          aytQuestions,
          successRate: attempted > 0 ? Math.round((correctQuestions / attempted) * 100) : 0,
          totalAttempted
        });
      }
      
      return weeks;
    } else if (viewMode === '3month' || viewMode === '6month') {
      // Aylık toplama (3 ay veya 6 ay)
      const months = [];
      const today = new Date();
      const monthsToShow = viewMode === '3month' ? 3 : 6;
      
      for (let i = monthsToShow - 1; i >= 0; i--) {
        // Hedef ayın ilk ve son günlerini hesapla
        const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59, 999);
        
        const monthStartStr = monthStart.toISOString().slice(0, 10);
        const monthEndStr = monthEnd.toISOString().slice(0, 10);
        
        // Bu ayın soru kayıtlarını filtrele
        const monthLogs = allQuestionLogs.filter(log => 
          log.study_date >= monthStartStr && log.study_date <= monthEndStr
        );
        
        // Soru kayıtlarından aylık veri topla
        let questionCorrect = monthLogs.reduce((sum, log) => sum + (Number(log.correct_count) || 0), 0);
        let questionWrong = monthLogs.reduce((sum, log) => sum + (Number(log.wrong_count) || 0), 0);
        let questionBlank = monthLogs.reduce((sum, log) => sum + (Number(log.blank_count) || 0), 0);
        
        // Deneme sonuçlarından aylık veri topla
        const monthExams = allExamResults.filter(exam => 
          exam.exam_date >= monthStartStr && exam.exam_date <= monthEndStr
        );
        
        let examCorrect = 0;
        let examWrong = 0;
        let examBlank = 0;
        let examTytQuestions = 0;
        let examAytQuestions = 0;
        
        monthExams.forEach(exam => {
          const examNets = examSubjectNets.filter((n: any) => n.exam_id === exam.id);
          examNets.forEach((netData: any) => {
            examCorrect += Number(netData.correct_count) || 0;
            examWrong += Number(netData.wrong_count) || 0;
            examBlank += Number(netData.blank_count || netData.empty_count) || 0;
            
            // TYT/AYT ayrımı
            if (exam.exam_type === 'TYT') {
              examTytQuestions += (Number(netData.correct_count) || 0) + (Number(netData.wrong_count) || 0);
            } else if (exam.exam_type === 'AYT') {
              examAytQuestions += (Number(netData.correct_count) || 0) + (Number(netData.wrong_count) || 0);
            }
          });
        });
        
        // Her iki kaynağı birleştir
        let correctQuestions = questionCorrect + examCorrect;
        let wrongQuestions = questionWrong + examWrong;
        let blankQuestions = questionBlank + examBlank;
        let totalQuestions = correctQuestions + wrongQuestions;
        
        // TYT ve AYT sayılarını ayrı hesapla
        let tytQuestions = monthLogs.filter(log => log.exam_type === 'TYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examTytQuestions;
        let aytQuestions = monthLogs.filter(log => log.exam_type === 'AYT').reduce((sum, log) => 
          sum + (Number(log.correct_count) || 0) + (Number(log.wrong_count) || 0), 0
        ) + examAytQuestions;
        
        const attempted = correctQuestions + wrongQuestions;
        const totalAttempted = correctQuestions + wrongQuestions;
        
        // Ay etiketi oluştur
        const monthLabel = monthStart.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
        
        months.push({
          date: monthStartStr,
          dayName: monthLabel,
          totalQuestions,
          correctQuestions,
          wrongQuestions,
          blankQuestions,
          tytQuestions,
          aytQuestions,
          successRate: attempted > 0 ? Math.round((correctQuestions / attempted) * 100) : 0,
          totalAttempted
        });
      }
      
      return months;
    }
  };

  const dailyWeeklyData = useMemo(() => prepareDailyWeeklyData(), [allQuestionLogs, allExamResults, examSubjectNets, viewMode, useCustomDates, startDate, endDate]);

  return (
    <div className="space-y-6 mb-8">
      {/* Geliştirilmiş Günlük/Haftalık Soru Grafiği */}
      <div className="bg-gradient-to-br from-emerald-50/60 via-card to-blue-50/40 dark:from-emerald-950/30 dark:via-card dark:to-blue-950/25 rounded-2xl border-2 border-emerald-200/40 dark:border-emerald-800/40 p-8 relative overflow-hidden shadow-2xl backdrop-blur-sm">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-500/10 to-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-gradient-to-tr from-blue-500/10 to-emerald-500/10 rounded-full blur-2xl"></div>
        <div className="relative">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-br from-emerald-500 via-blue-500 to-emerald-600 rounded-xl shadow-lg">
                <BookOpen className="h-6 w-6 text-white drop-shadow-lg" />
              </div>
              <div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 via-blue-600 to-emerald-700 bg-clip-text text-transparent">
                  {useCustomDates ? (
                    <>📚 {startDate} - {endDate} arası toplam soru çözüm analizi</>
                  ) : (
                    <>📚 {viewMode === 'daily' ? 'Günlük' : viewMode === 'weekly' ? 'Haftalık' : viewMode === '3month' ? '3 Aylık' : '6 Aylık'} Soru Çözüm Analizi</>
                  )}
                </h3>
                <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70 font-medium">
                  Hem soru kayıtlarından hem de deneme sonuçlarından toplam verileriniz
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex border-2 border-emerald-200/50 dark:border-emerald-700/50 rounded-xl p-1 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm">
                <Button
                  variant={viewMode === 'daily' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('daily')}
                  className={`text-sm px-4 py-2 h-auto font-medium transition-all duration-200 rounded-lg ${
                    viewMode === 'daily'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg hover:shadow-xl'
                      : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                  data-testid="button-daily-view"
                >
                  📅 Günlük
                </Button>
                <Button
                  variant={viewMode === 'weekly' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('weekly')}
                  className={`text-sm px-4 py-2 h-auto font-medium transition-all duration-200 rounded-lg ${
                    viewMode === 'weekly'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg hover:shadow-xl'
                      : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                  data-testid="button-weekly-view"
                >
                  🗓️ Haftalık
                </Button>
                <Button
                  variant={viewMode === '3month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('3month')}
                  className={`text-sm px-3 py-2 h-auto font-medium transition-all duration-200 rounded-lg ${
                    viewMode === '3month'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg hover:shadow-xl'
                      : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                  data-testid="button-3month-view"
                >
                  📊 3 Aylık
                </Button>
                <Button
                  variant={viewMode === '6month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('6month')}
                  className={`text-sm px-3 py-2 h-auto font-medium transition-all duration-200 rounded-lg ${
                    viewMode === '6month'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg hover:shadow-xl'
                      : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  }`}
                  data-testid="button-6month-view"
                >
                  📈 6 Aylık
                </Button>
                
                {/* Tarih Aralığı Popover */}
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={useCustomDates ? 'default' : 'ghost'}
                      size="sm"
                      className={`text-sm px-4 py-2 h-auto font-medium transition-all duration-200 rounded-lg ${
                        useCustomDates
                          ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg hover:shadow-xl'
                          : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                      }`}
                      data-testid="button-custom-dates"
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Tarih Seç
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4 bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-700" align="end">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">Başlangıç:</label>
                        <Input
                          type="date"
                          value={tempStartDate}
                          onChange={(e) => setTempStartDate(e.target.value)}
                          className="text-sm border-emerald-200 dark:border-emerald-700 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-start-date"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap">Bitiş:</label>
                        <Input
                          type="date"
                          value={tempEndDate}
                          onChange={(e) => setTempEndDate(e.target.value)}
                          className="text-sm border-emerald-200 dark:border-emerald-700 focus:border-emerald-500 focus:ring-emerald-500"
                          data-testid="input-end-date"
                        />
                      </div>
                      <div className="flex flex-col gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-700">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setStartDate(tempStartDate);
                            setEndDate(tempEndDate);
                            setUseCustomDates(true);
                            setIsPopoverOpen(false);
                          }}
                          className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          data-testid="button-apply-dates"
                        >
                          ✅ Uygula
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const today = new Date();
                            const twoWeeksAgo = new Date();
                            twoWeeksAgo.setDate(today.getDate() - 13);
                            const startDateStr = twoWeeksAgo.toISOString().split('T')[0];
                            const endDateStr = today.toISOString().split('T')[0];
                            setStartDate(startDateStr);
                            setEndDate(endDateStr);
                            setTempStartDate(startDateStr);
                            setTempEndDate(endDateStr);
                            setUseCustomDates(false);
                            setIsPopoverOpen(false);
                          }}
                          className="w-full text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700"
                          data-testid="button-reset-dates"
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Sıfırla (Son 14 gün)
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {!useCustomDates && (
                <div className="text-sm text-muted-foreground bg-emerald-100/60 dark:bg-emerald-900/30 px-4 py-2 rounded-full border border-emerald-200/50 dark:border-emerald-700/50 font-medium">
                  {viewMode === 'daily' ? 'Son 14 gün' : viewMode === 'weekly' ? 'Son 6 hafta' : viewMode === '3month' ? 'Son 3 ay' : 'Son 6 ay'}
                </div>
              )}
            </div>
          </div>
          
          {dailyWeeklyData.length === 0 || dailyWeeklyData.every(d => d.totalQuestions === 0) ? (
            <div className="text-center py-20 text-muted-foreground">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-blue-100 dark:from-emerald-900/30 dark:to-blue-900/30 flex items-center justify-center mx-auto mb-6 shadow-lg">
                <BookOpen className="h-10 w-10 text-emerald-500" />
              </div>
              <h4 className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Soru çözüm verisi bulunmuyor</h4>
              <p className="text-sm opacity-75 mb-4">Soru kayıtları veri girişi yapılmadan gözükmez.</p>
              <div className="flex justify-center space-x-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"></div>
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce delay-100"></div>
                <div className="w-2 h-2 rounded-full bg-emerald-600 animate-bounce delay-200"></div>
              </div>
            </div>
          ) : (
            <>
              <div className="h-96 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyWeeklyData} margin={{ top: 20, right: 40, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" stroke="currentColor" />
                    <XAxis 
                      dataKey="dayName" 
                      className="text-xs text-muted-foreground"
                      tick={{ fontSize: 11, fontWeight: 500 }}
                      stroke="currentColor"
                      axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
                    />
                    <YAxis 
                      yAxisId="questions"
                      className="text-xs text-muted-foreground"
                      tick={{ fontSize: 11, fontWeight: 500 }}
                      stroke="currentColor"
                      axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
                      label={{ value: 'Soru Sayısı', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                    />
                    <YAxis 
                      yAxisId="percentage"
                      orientation="right"
                      className="text-xs text-muted-foreground"
                      tick={{ fontSize: 11, fontWeight: 500 }}
                      stroke="currentColor"
                      axisLine={{ stroke: 'currentColor', strokeWidth: 1 }}
                      domain={[0, 100]}
                      label={{ value: 'Başarı %', angle: 90, position: 'insideRight', style: { textAnchor: 'middle' } }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '13px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                        padding: '12px'
                      }}
                      content={({ payload, label }) => {
                        if (!payload || payload.length === 0) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                            <div className="font-semibold mb-2 text-sm">📅 {label}</div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">✅ Doğru:</span>
                                <span className="font-medium text-green-600 dark:text-green-400">{data.correctQuestions} soru</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">❌ Yanlış:</span>
                                <span className="font-medium text-red-600 dark:text-red-400">{data.wrongQuestions} soru</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">⚪ Boş:</span>
                                <span className="font-medium text-gray-600 dark:text-gray-400">{data.blankQuestions} soru</span>
                              </div>
                              {(data.tytQuestions > 0 || data.aytQuestions > 0) && (
                                <div className="border-t border-border my-1 pt-1">
                                  {data.tytQuestions > 0 && (
                                    <div className="flex justify-between gap-3">
                                      <span className="text-muted-foreground">📚 TYT:</span>
                                      <span className="font-medium text-purple-600 dark:text-purple-400">{data.tytQuestions} soru</span>
                                    </div>
                                  )}
                                  {data.aytQuestions > 0 && (
                                    <div className="flex justify-between gap-3">
                                      <span className="text-muted-foreground">📘 AYT:</span>
                                      <span className="font-medium text-indigo-600 dark:text-indigo-400">{data.aytQuestions} soru</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="border-t border-border my-1 pt-1">
                                <div className="flex justify-between gap-3">
                                  <span className="text-muted-foreground">📊 Toplam:</span>
                                  <span className="font-semibold">{data.totalQuestions} soru</span>
                                </div>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-muted-foreground">📈 Başarı:</span>
                                <span className="font-semibold text-blue-600 dark:text-blue-400">%{data.successRate}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="rect"
                    />
                    
                    {/* Degrade efektli geliştirilmiş çubuklar */}
                    <Bar 
                      yAxisId="questions" 
                      dataKey="correctQuestions" 
                      stackId="a" 
                      fill="url(#correctGradient)" 
                      name="Doğru" 
                      radius={[0, 0, 0, 0]} 
                    />
                    <Bar 
                      yAxisId="questions" 
                      dataKey="wrongQuestions" 
                      stackId="a" 
                      fill="url(#wrongGradient)" 
                      name="Yanlış" 
                      radius={[4, 4, 0, 0]} 
                    />
                    
                    {/* Mavi çizgi - yeşil ve kırmızı barların kesişim noktalarından geçer */}
                    <Line
                      yAxisId="questions"
                      type="monotone"
                      dataKey="correctQuestions"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', r: 6, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 8, strokeWidth: 2 }}
                      name="Kesişim Noktası"
                    />
                    
                    {/* Degrade Tanımları */}
                    <defs>
                      <linearGradient id="correctGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="wrongGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#ef4444" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                      <linearGradient id="successGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#1d4ed8" />
                      </linearGradient>
                    </defs>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              {/* Modern Özet İstatistikler */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t-2 border-emerald-200/30 dark:border-emerald-700/30">
                {/* Toplam Çözülen Soru - Doğru + Yanlış (Boş Hariç) */}
                <div className="group relative bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/50 dark:to-green-950/50 rounded-2xl p-5 border-2 border-emerald-200/50 dark:border-emerald-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="text-4xl font-black bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent mb-2 drop-shadow-sm">
                      {dailyWeeklyData.reduce((sum, d) => sum + d.correctQuestions + d.wrongQuestions, 0)}
                    </div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">Toplam Çözülen Soru</div>
                    <div className="flex items-center gap-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span className="text-blue-600 dark:text-blue-400">TYT: {dailyWeeklyData.reduce((sum, d) => sum + (d.tytQuestions || 0), 0)}</span>
                      <span className="text-green-600 dark:text-green-400">AYT: {dailyWeeklyData.reduce((sum, d) => sum + (d.aytQuestions || 0), 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Toplam Doğru */}
                <div className="group relative bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-2xl p-5 border-2 border-green-200/50 dark:border-green-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="text-4xl font-black bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-2 drop-shadow-sm">
                      {dailyWeeklyData.reduce((sum, d) => sum + d.correctQuestions, 0)}
                    </div>
                    <div className="text-xs font-bold text-green-700 dark:text-green-300">Toplam Doğru</div>
                  </div>
                </div>

                {/* Toplam Yanlış */}
                <div className="group relative bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 rounded-2xl p-5 border-2 border-red-200/50 dark:border-red-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="text-4xl font-black bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-2 drop-shadow-sm">
                      {dailyWeeklyData.reduce((sum, d) => sum + d.wrongQuestions, 0)}
                    </div>
                    <div className="text-xs font-bold text-red-700 dark:text-red-300">Toplam Yanlış</div>
                  </div>
                </div>

                {/* Toplam Boş */}
                <div className="group relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/50 rounded-2xl p-5 border-2 border-amber-200/50 dark:border-amber-700/50 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl"></div>
                  <div className="relative">
                    <div className="text-4xl font-black bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent mb-2 drop-shadow-sm">
                      {dailyWeeklyData.reduce((sum, d) => sum + (d.blankQuestions || 0), 0)}
                    </div>
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-300">Toplam Boş</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
