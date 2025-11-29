import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/bilesenler/arayuz/dialog";
import { Card, CardContent } from "@/bilesenler/arayuz/card";
import { Badge } from "@/bilesenler/arayuz/badge";
import { Button } from "@/bilesenler/arayuz/button";
import { ScrollArea } from "@/bilesenler/arayuz/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/bilesenler/arayuz/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, sorguIstemcisi } from "@/kutuphane/sorguIstemcisi";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/bilesenler/arayuz/alert-dialog";
import { 
  Clock, 
  CheckSquare, 
  FileText, 
  BookOpen, 
  Target, 
  Brain,
  Trash2,
  RefreshCw,
  Loader2,
  Calendar,
  Filter,
  BarChart3,
  Timer,
  ListChecks,
  TrendingUp
} from "lucide-react";

interface UserActivity {
  id: string;
  userId: string;
  userName: string;
  category: 'task' | 'exam' | 'question' | 'study' | 'goal' | 'flashcard' | 'license' | 'system';
  action: 'created' | 'updated' | 'deleted' | 'archived' | 'completed' | 'verified' | 'expired' | 'started' | 'stopped';
  entityId: string;
  entityType: string;
  details: string | null;
  payloadSnapshot: string | null;
  createdAt: string;
}

interface AktivitelerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TimeFilter = 'all' | '1week' | '1month' | '3months';
type CategoryFilter = 'all' | 'task' | 'exam' | 'question' | 'study';

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'task':
      return <CheckSquare className="w-4 h-4" />;
    case 'exam':
      return <FileText className="w-4 h-4" />;
    case 'question':
      return <BookOpen className="w-4 h-4" />;
    case 'study':
      return <Clock className="w-4 h-4" />;
    case 'goal':
      return <Target className="w-4 h-4" />;
    case 'flashcard':
      return <Brain className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
};

const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    task: 'Gorev',
    exam: 'Deneme',
    question: 'Soru',
    study: 'Calisma',
    goal: 'Hedef',
    flashcard: 'Flash Card',
    license: 'Lisans',
    system: 'Sistem'
  };
  return labels[category] || category;
};

const getActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    created: 'Eklendi',
    updated: 'Guncellendi',
    deleted: 'Silindi',
    archived: 'Arsivlendi',
    completed: 'Tamamlandi',
    verified: 'Dogrulandi',
    expired: 'Suresi Doldu',
    started: 'Basladi',
    stopped: 'Durdu'
  };
  return labels[action] || action;
};

const getActionColor = (action: string) => {
  switch (action) {
    case 'created':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'completed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'deleted':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'archived':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'updated':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'task':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    case 'exam':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
    case 'question':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
    case 'study':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    case 'goal':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    case 'flashcard':
      return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
};

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Istanbul'
    }).format(date);
  } catch {
    return dateStr;
  }
};

const parsePayload = (payloadSnapshot: string | null) => {
  if (!payloadSnapshot) return null;
  try {
    return JSON.parse(payloadSnapshot);
  } catch {
    return null;
  }
};

const renderPayloadDetails = (category: string, payload: any, action: string) => {
  if (!payload) return null;

  switch (category) {
    case 'study':
      return (
        <div className="mt-2 text-sm text-muted-foreground space-y-1 pl-2 border-l-2 border-purple-500/30">
          {payload.hours !== undefined && payload.minutes !== undefined && (
            <div className="flex items-center gap-1"><Timer className="w-3 h-3" />Sure: <span className="font-medium text-foreground">{payload.hours} saat {payload.minutes} dakika {payload.seconds || 0} saniye</span></div>
          )}
          {payload.study_date && (
            <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Tarih: <span className="font-medium text-foreground">{payload.study_date}</span></div>
          )}
          {payload.total_seconds && (
            <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />Toplam: <span className="font-medium text-foreground">{Math.floor(payload.total_seconds / 3600)} saat {Math.floor((payload.total_seconds % 3600) / 60)} dakika</span></div>
          )}
        </div>
      );
    
    case 'task':
      return (
        <div className="mt-2 text-sm text-muted-foreground space-y-1 pl-2 border-l-2 border-purple-500/30">
          {payload.title && (
            <div className="flex items-center gap-1"><ListChecks className="w-3 h-3" />Baslik: <span className="font-medium text-foreground">{payload.title}</span></div>
          )}
          {payload.description && (
            <div className="text-xs opacity-80">Aciklama: {payload.description}</div>
          )}
          {payload.priority && (
            <div className="flex items-center gap-1">Oncelik: <Badge variant="secondary" className="text-xs">{payload.priority === 'high' ? 'Yuksek' : payload.priority === 'medium' ? 'Orta' : 'Dusuk'}</Badge></div>
          )}
          {payload.dueDate && (
            <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Bitis Tarihi: <span className="font-medium text-foreground">{payload.dueDate}</span></div>
          )}
          {action === 'completed' && (
            <div className="text-green-600 dark:text-green-400 font-medium">Gorev basariyla tamamlandi!</div>
          )}
        </div>
      );
    
    case 'exam':
      return (
        <div className="mt-2 text-sm text-muted-foreground space-y-1 pl-2 border-l-2 border-indigo-500/30">
          {payload.exam_name && (
            <div className="flex items-center gap-1"><FileText className="w-3 h-3" />Deneme Adi: <span className="font-medium text-foreground">{payload.exam_name}</span></div>
          )}
          {payload.display_name && (
            <div>Gorunen Ad: <span className="font-medium text-foreground">{payload.display_name}</span></div>
          )}
          {payload.exam_type && (
            <div className="flex items-center gap-1">Tur: <Badge variant="secondary" className="text-xs">{payload.exam_type}</Badge></div>
          )}
          {payload.exam_date && (
            <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Tarih: <span className="font-medium text-foreground">{payload.exam_date}</span></div>
          )}
          {payload.tyt_net !== undefined && (
            <div className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />TYT Net: <span className="font-bold text-purple-600 dark:text-purple-400">{payload.tyt_net}</span></div>
          )}
          {payload.ayt_net !== undefined && (
            <div className="flex items-center gap-1"><BarChart3 className="w-3 h-3" />AYT Net: <span className="font-bold text-purple-600 dark:text-purple-400">{payload.ayt_net}</span></div>
          )}
          {payload.time_spent_minutes && (
            <div className="flex items-center gap-1"><Timer className="w-3 h-3" />Sure: <span className="font-medium text-foreground">{payload.time_spent_minutes} dakika</span></div>
          )}
        </div>
      );
    
    case 'question':
      return (
        <div className="mt-2 text-sm text-muted-foreground space-y-1 pl-2 border-l-2 border-cyan-500/30">
          {payload.subject && (
            <div className="flex items-center gap-1"><BookOpen className="w-3 h-3" />Ders: <span className="font-medium text-foreground">{payload.subject}</span></div>
          )}
          {payload.exam_type && (
            <div className="flex items-center gap-1">Sinav Turu: <Badge variant="secondary" className="text-xs">{payload.exam_type}</Badge></div>
          )}
          <div className="flex gap-3 flex-wrap">
            {payload.correct_count !== undefined && (
              <span className="text-green-600 dark:text-green-400">Dogru: <span className="font-bold">{payload.correct_count}</span></span>
            )}
            {payload.wrong_count !== undefined && (
              <span className="text-red-600 dark:text-red-400">Yanlis: <span className="font-bold">{payload.wrong_count}</span></span>
            )}
            {payload.blank_count !== undefined && (
              <span className="text-gray-600 dark:text-gray-400">Bos: <span className="font-bold">{payload.blank_count}</span></span>
            )}
          </div>
          {payload.study_date && (
            <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Tarih: <span className="font-medium text-foreground">{payload.study_date}</span></div>
          )}
          {payload.time_spent_minutes && (
            <div className="flex items-center gap-1"><Timer className="w-3 h-3" />Sure: <span className="font-medium text-foreground">{payload.time_spent_minutes} dakika</span></div>
          )}
          {payload.wrong_topics && payload.wrong_topics.length > 0 && (
            <div className="mt-1">
              <div className="text-xs opacity-70">Hatali Konular:</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {payload.wrong_topics.slice(0, 5).map((topic: any, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300">
                    {typeof topic === 'string' ? topic : topic.topic || topic.name}
                  </Badge>
                ))}
                {payload.wrong_topics.length > 5 && (
                  <Badge variant="outline" className="text-xs">+{payload.wrong_topics.length - 5} daha</Badge>
                )}
              </div>
            </div>
          )}
        </div>
      );
    
    default:
      return null;
  }
};

export function AktivitelerModal({ open, onOpenChange }: AktivitelerModalProps) {
  const { toast } = useToast();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; activities: UserActivity[]; total: number }>({
    queryKey: ['/api/user-activities'],
    enabled: open,
  });

  const clearActivitiesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/user-activities/clear"),
    onSuccess: () => {
      sorguIstemcisi.invalidateQueries({ queryKey: ['/api/user-activities'] });
      toast({ 
        title: "Temizlendi", 
        description: "Tum aktiviteler basariyla silindi.",
        duration: 3000
      });
      setShowDeleteAllDialog(false);
    },
    onError: () => {
      toast({ 
        title: "Hata", 
        description: "Aktiviteler silinemedi.",
        variant: "destructive",
        duration: 3000
      });
    },
  });

  const activities = data?.activities || [];

  const filteredActivities = useMemo(() => {
    let filtered = [...activities];
    
    if (timeFilter !== 'all') {
      const now = new Date();
      let cutoffDate: Date;
      
      switch (timeFilter) {
        case '1week':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '1month':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '3months':
          cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }
      
      filtered = filtered.filter(activity => new Date(activity.createdAt) >= cutoffDate);
    }
    
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(activity => activity.category === categoryFilter);
    }
    
    return filtered;
  }, [activities, timeFilter, categoryFilter]);

  const stats = useMemo(() => {
    const taskCount = filteredActivities.filter(a => a.category === 'task').length;
    const examCount = filteredActivities.filter(a => a.category === 'exam').length;
    const questionCount = filteredActivities.filter(a => a.category === 'question').length;
    const studyCount = filteredActivities.filter(a => a.category === 'study').length;
    
    let totalStudySeconds = 0;
    filteredActivities
      .filter(a => a.category === 'study')
      .forEach(a => {
        const payload = parsePayload(a.payloadSnapshot);
        if (payload) {
          if (payload.total_seconds) {
            totalStudySeconds += payload.total_seconds;
          } else if (payload.hours !== undefined && payload.minutes !== undefined) {
            totalStudySeconds += (payload.hours * 3600) + (payload.minutes * 60) + (payload.seconds || 0);
          }
        }
      });

    let totalQuestions = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    filteredActivities
      .filter(a => a.category === 'question')
      .forEach(a => {
        const payload = parsePayload(a.payloadSnapshot);
        if (payload) {
          const correct = parseInt(payload.correct_count) || 0;
          const wrong = parseInt(payload.wrong_count) || 0;
          totalQuestions += correct + wrong;
          totalCorrect += correct;
          totalWrong += wrong;
        }
      });

    return {
      taskCount,
      examCount,
      questionCount,
      studyCount,
      totalStudyHours: Math.floor(totalStudySeconds / 3600),
      totalStudyMinutes: Math.floor((totalStudySeconds % 3600) / 60),
      totalQuestions,
      totalCorrect,
      totalWrong
    };
  }, [filteredActivities]);

  const groupActivitiesByDate = (activities: UserActivity[]) => {
    const groups: Record<string, UserActivity[]> = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.createdAt);
      const dateKey = new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Istanbul'
      }).format(date);
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });
    
    return groups;
  };

  const groupedActivities = groupActivitiesByDate(filteredActivities);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Aktivitelerim
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Tum aktivitelerinizi ve islemlerinizi detayli olarak burada gorebilirsiniz
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-3 text-center">
                <ListChecks className="w-5 h-5 mx-auto mb-1 text-purple-600 dark:text-purple-400" />
                <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{stats.taskCount}</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Gorev</p>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800">
              <CardContent className="p-3 text-center">
                <FileText className="w-5 h-5 mx-auto mb-1 text-indigo-600 dark:text-indigo-400" />
                <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{stats.examCount}</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">Deneme</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800">
              <CardContent className="p-3 text-center">
                <BookOpen className="w-5 h-5 mx-auto mb-1 text-cyan-600 dark:text-cyan-400" />
                <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">{stats.totalQuestions}</p>
                <p className="text-xs text-cyan-600 dark:text-cyan-400">Soru</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-3 text-center">
                <Timer className="w-5 h-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{stats.totalStudyHours}s {stats.totalStudyMinutes}dk</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Calisma</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div className="flex gap-1">
                  <Button 
                    variant={timeFilter === 'all' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setTimeFilter('all')}
                    data-testid="filter-time-all"
                  >
                    Tumu
                  </Button>
                  <Button 
                    variant={timeFilter === '1week' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setTimeFilter('1week')}
                    data-testid="filter-time-1week"
                  >
                    1 Hafta
                  </Button>
                  <Button 
                    variant={timeFilter === '1month' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setTimeFilter('1month')}
                    data-testid="filter-time-1month"
                  >
                    1 Ay
                  </Button>
                  <Button 
                    variant={timeFilter === '3months' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setTimeFilter('3months')}
                    data-testid="filter-time-3months"
                  >
                    3 Ay
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-activities"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteAllDialog(true)}
                disabled={activities.length === 0}
                data-testid="button-delete-all-activities"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Hepsini Sil
              </Button>
            </div>
          </div>

          <div className="flex gap-1 mb-4 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground mt-1" />
            <Button 
              variant={categoryFilter === 'all' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setCategoryFilter('all')}
              data-testid="filter-category-all"
            >
              Tumu ({activities.length})
            </Button>
            <Button 
              variant={categoryFilter === 'task' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setCategoryFilter('task')}
              data-testid="filter-category-task"
              className="gap-1"
            >
              <CheckSquare className="w-3 h-3" /> Gorev
            </Button>
            <Button 
              variant={categoryFilter === 'exam' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setCategoryFilter('exam')}
              data-testid="filter-category-exam"
              className="gap-1"
            >
              <FileText className="w-3 h-3" /> Deneme
            </Button>
            <Button 
              variant={categoryFilter === 'question' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setCategoryFilter('question')}
              data-testid="filter-category-question"
              className="gap-1"
            >
              <BookOpen className="w-3 h-3" /> Soru
            </Button>
            <Button 
              variant={categoryFilter === 'study' ? 'secondary' : 'ghost'} 
              size="sm"
              onClick={() => setCategoryFilter('study')}
              data-testid="filter-category-study"
              className="gap-1"
            >
              <Clock className="w-3 h-3" /> Calisma
            </Button>
          </div>

          <ScrollArea className="h-[400px] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Yukleniyor...</span>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Clock className="w-12 h-12 mb-4 opacity-50" />
                <p>Secilen filtrelere uygun aktivite bulunmuyor</p>
                <Button 
                  variant="link" 
                  onClick={() => { setTimeFilter('all'); setCategoryFilter('all'); }}
                  className="mt-2"
                >
                  Filtreleri temizle
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedActivities).map(([dateKey, dateActivities]) => (
                  <div key={dateKey}>
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-2 mb-3 z-10">
                      <h3 className="text-sm font-semibold text-muted-foreground border-b pb-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {dateKey}
                        <Badge variant="secondary" className="ml-auto text-xs">{dateActivities.length} aktivite</Badge>
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {dateActivities.map((activity) => {
                        const payload = parsePayload(activity.payloadSnapshot);
                        
                        return (
                          <Card 
                            key={activity.id} 
                            className="hover-elevate transition-all"
                            data-testid={`activity-card-${activity.id}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${getCategoryColor(activity.category)}`}>
                                  {getCategoryIcon(activity.category)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <Badge variant="secondary" className={`text-xs ${getCategoryColor(activity.category)}`}>
                                      {getCategoryLabel(activity.category)}
                                    </Badge>
                                    <Badge variant="secondary" className={`text-xs ${getActionColor(activity.action)}`}>
                                      {getActionLabel(activity.action)}
                                    </Badge>
                                  </div>
                                  
                                  {activity.details && (
                                    <p className="text-sm font-medium text-foreground mt-1">
                                      {activity.details}
                                    </p>
                                  )}
                                  
                                  {renderPayloadDetails(activity.category, payload, activity.action)}
                                  
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {formatDate(activity.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="mt-4 pt-3 border-t text-center text-xs text-muted-foreground">
            Toplam {filteredActivities.length} aktivite gosteriliyor
            {(timeFilter !== 'all' || categoryFilter !== 'all') && (
              <span className="ml-1">(filtrelenmis)</span>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tum Aktiviteleri Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Tum aktivite kayitlariniz kalici olarak silinecek. Bu islem geri alinamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Iptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearActivitiesMutation.mutate()}
              className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-all-activities"
            >
              {clearActivitiesMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Hepsini Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AktivitelerModal;
