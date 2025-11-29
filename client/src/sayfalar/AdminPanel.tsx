import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arayuz/card';
import { Button } from '@arayuz/button';
import { Input } from '@arayuz/input';
import { Label } from '@arayuz/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@arayuz/select';
import { Badge } from '@arayuz/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@arayuz/dialog';
import { Shield, Key, Users, CheckCircle2, XCircle, Clock, AlertTriangle, Activity, TrendingUp, Lock, Eye, EyeOff, Copy, Check, LogOut, Sparkles, Zap, Settings, Menu } from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { AdminSidebar } from '@/components/admin-sidebar';

interface License {
  id: string;
  licenseKey: string;
  customerName: string;
  customerEmail: string;
  
  // Lisansa özel kullanıcı bilgileri
  userFullName?: string;
  
  // Lisansa özel email konfigürasyonu
  emailUser?: string;
  emailPass?: string;
  emailFrom?: string;
  
  // Lisansa özel API anahtarları
  openweatherApiKey?: string;
  
  licenseType: string;
  maxActivations: number;
  currentActivations: number;
  isActive: boolean;
  isRevoked: boolean;
  expiresAt?: string;
  createdAt: Date;
}

interface Activation {
  id: string;
  licenseId: string;
  hardwareId: string;
  machineName?: string;
  operatingSystem?: string;
  cpuInfo?: string;
  totalRam?: string;
  macAddress?: string;
  ipAddress?: string;
  location?: string;
  isActive: boolean;
  activatedAt: Date;
  lastHeartbeat?: string;
}

interface Stats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  totalActivations: number;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  category: 'license' | 'admin' | 'activation' | 'system' | 'user';
  action: string;
  details?: string;
  metadata?: Record<string, any>;
}

interface User {
  customerName: string;
  customerEmail: string;
  licenseCount: number;
  activationCount: number;
  licenses: License[];
}

interface UserActivity {
  id: string;
  timestamp: string;
  action: string;
  details?: string;
  metadata?: Record<string, any>;
}

export default function AdminPanel() {
  const [activePanel, setActivePanel] = useState<string | null>('create-license'); // Default: Yeni Lisans Oluştur
  const [licenses, setLicenses] = useState<License[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [allActivations, setAllActivations] = useState<Activation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(true); // Default: Yeni Lisans Oluştur
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [showUserActivity, setShowUserActivity] = useState(false);
  const [showUsersList, setShowUsersList] = useState(false);
  const [showUserActivitiesDialog, setShowUserActivitiesDialog] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showLicenseKeys, setShowLicenseKeys] = useState<Record<string, boolean>>({});
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { toast} = useToast();

  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    
    // Lisansa özel kullanıcı bilgileri
    userFullName: '',
    
    // Lisansa özel email konfigürasyonu (opsiyonel)
    emailUser: '',
    emailPass: '',
    emailFrom: '',
    
    // Lisansa özel API anahtarları (opsiyonel)
    openweatherApiKey: '',
    
    licenseType: '1-month' as '3-minute' | '30-minute' | '1-hour' | '3-hour' | '6-hour' | '12-hour' | 'trial' | '1-week' | '3-week' | '1-month' | '3-month' | '6-month' | '1-year' | 'lifetime',
    maxActivations: 1,
  });

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      toast({
        title: '⛔ Yetkisiz Erişim',
        description: 'Admin paneline erişim için giriş yapmalısınız',
        variant: 'destructive',
      });
      setTimeout(() => {
        setLocation('/afyonlu03giris');
      }, 1000);
      return;
    }
    loadLicenses();
    loadAllUserActivations(); // İlk açılışta kullanıcı aktivitelerini yükle
  }, [setLocation, toast]);

  const handleMenuItemClick = (panelId: string) => {
    setActivePanel(panelId);
    
    // Reset all show* flags
    setShowCreateForm(false);
    setShowActivityLogs(false);
    setShowUserActivity(false);
    setShowUsersList(false);
    
    // Set the corresponding flag and load data if needed
    switch(panelId) {
      case 'create-license':
        setShowCreateForm(true);
        break;
      case 'user-activity':
        setShowUserActivity(true);
        loadAllUserActivations();
        break;
      case 'activity-logs':
        setShowActivityLogs(true);
        loadActivityLogs();
        break;
      case 'users-list':
        setShowUsersList(true);
        loadUsers();
        break;
      case 'change-password':
        setShowPasswordDialog(true);
        break;
      case 'stats':
        // Stats always visible
        break;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    toast({
      title: '👋 Güvenli Çıkış',
      description: 'Başarıyla çıkış yaptınız',
    });
    setTimeout(() => {
      setLocation('/');
    }, 500);
  };

  const handleChangePassword = async () => {
    // Validasyonlar
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: '❌ Eksik Bilgi',
        description: 'Tüm alanları doldurunuz',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: '❌ Şifreler Eşleşmiyor',
        description: 'Yeni şifre ve onay şifresi aynı olmalıdır',
        variant: 'destructive',
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast({
        title: '❌ Zayıf Şifre',
        description: 'Yeni şifre en az 8 karakter olmalıdır',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/afyonlu/03panel/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        toast({
          title: '❌ Şifre Değiştirilemedi',
          description: data.message || 'Bir hata oluştu',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: '✅ Şifre Değiştirildi',
        description: data.message || 'Admin şifreniz başarıyla değiştirildi',
      });

      // Formu temizle ve kapat
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordDialog(false);

      // Yeni şifre ile token'ı güncelle
      localStorage.setItem('admin_token', passwordData.newPassword);
    } catch (error) {
      toast({
        title: '❌ Hata',
        description: 'Şifre değiştirme işlemi başarısız oldu',
        variant: 'destructive',
      });
    }
  };

  // ✅ KRITIK GÜVENLİK: Admin token helper
  const getAuthHeaders = () => {
    const token = localStorage.getItem('admin_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const loadLicenses = async () => {
    try {
      const response = await fetch('/api/afyonlu/03panel/licenses', {
        headers: getAuthHeaders()
      });
      
      // ✅ KRITIK: response.ok kontrolü (401/403 hataları için)
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('admin_token');
          toast({
            title: '⛔ Oturum Süresi Doldu',
            description: 'Lütfen tekrar giriş yapın',
            variant: 'destructive',
          });
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setLicenses(data.licenses);
      setStats(data.stats);
    } catch (error) {
    }
  };

  const loadActivityLogs = async () => {
    try {
      const response = await fetch('/api/afyonlu/03panel/activity-logs?limit=100', {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('admin_token');
          toast({
            title: '⛔ Oturum Süresi Doldu',
            description: 'Lütfen tekrar giriş yapın',
            variant: 'destructive',
          });
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setActivityLogs(data.logs || []);
    } catch (error) {
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/afyonlu/03panel/users', {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('admin_token');
          toast({
            title: '⛔ Oturum Süresi Doldu',
            description: 'Lütfen tekrar giriş yapın',
            variant: 'destructive',
          });
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
    }
  };

  const loadUserActivities = async (customerEmail: string) => {
    try {
      const response = await fetch(`/api/afyonlu/03panel/users/${encodeURIComponent(customerEmail)}/activities?limit=100`, {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('admin_token');
          toast({
            title: '⛔ Oturum Süresi Doldu',
            description: 'Lütfen tekrar giriş yapın',
            variant: 'destructive',
          });
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setUserActivities(data.activities || []);
    } catch (error) {
    }
  };

  const loadAllUserActivations = async () => {
    try {
      const response = await fetch('/api/afyonlu/03panel/activations', {
        headers: getAuthHeaders()
      });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem('admin_token');
          toast({
            title: '⛔ Oturum Süresi Doldu',
            description: 'Lütfen tekrar giriş yapın',
            variant: 'destructive',
          });
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setAllActivations(data.activations || []);
    } catch (error) {
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/afyonlu/03panel/licenses/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });
      
      // ✅ KRITIK: response.ok kontrolü
      if (!response.ok) {
        toast({
          title: '❌ Hata',
          description: response.status === 401 ? 'Oturum süresi doldu' : 'Lisans oluşturulamadı',
          variant: 'destructive',
        });
        if (response.status === 401) {
          localStorage.removeItem('admin_token');
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        toast({
          title: '✅ Lisans Oluşturuldu',
          description: `${formData.customerName} için lisans başarıyla oluşturuldu`,
        });
        setShowCreateForm(false);
        setFormData({
          customerName: '',
          customerEmail: '',
          userFullName: '',
          emailUser: '',
          emailPass: '',
          emailFrom: '',
          openweatherApiKey: '',
          licenseType: '1-month',
          maxActivations: 1,
        });
        loadLicenses();
        
        const newLicense = data.license;
        // Güvenli clipboard kullan
        await copyToClipboard(data.licenseKey, newLicense.id);
      }
    } catch (error) {
      toast({
        title: '❌ Hata',
        description: 'Lisans oluşturulamadı',
        variant: 'destructive',
      });
    }
  };

  const handleRevokeLicense = async (licenseId: string, customerName: string) => {
    const confirmed = window.confirm(`${customerName} için lisansı iptal etmek istediğinizden emin misiniz?`);
    if (!confirmed) return;

    const reason = prompt('İptal nedeni:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/afyonlu/03panel/licenses/${licenseId}/revoke`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });

      // ✅ KRITIK: response.ok kontrolü
      if (!response.ok) {
        toast({
          title: '❌ Hata',
          description: response.status === 401 ? 'Oturum süresi doldu' : 'Lisans iptal edilemedi',
          variant: 'destructive',
        });
        if (response.status === 401) {
          localStorage.removeItem('admin_token');
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }

      if (response.ok) {
        toast({
          title: '✅ Lisans İptal Edildi',
          description: `${customerName} için lisans iptal edildi`,
        });
        loadLicenses();
      }
    } catch (error) {
      toast({
        title: '❌ Hata',
        description: 'Lisans iptal edilemedi',
        variant: 'destructive',
      });
    }
  };

  const handleViewDetails = async (license: License) => {
    try {
      const response = await fetch(`/api/afyonlu/03panel/licenses/${license.id}`, {
        headers: getAuthHeaders()
      });
      
      // ✅ KRITIK: response.ok kontrolü
      if (!response.ok) {
        toast({
          title: '❌ Hata',
          description: response.status === 401 ? 'Oturum süresi doldu' : 'Lisans detayları yüklenemedi',
          variant: 'destructive',
        });
        if (response.status === 401) {
          localStorage.removeItem('admin_token');
          setTimeout(() => setLocation('/afyonlu03giris'), 1500);
        }
        return;
      }
      
      const data = await response.json();
      setSelectedLicense(data.license);
      setActivations(data.activations);
    } catch (error) {
    }
  };

  // ✅ KRITIK GÜVENLİK: Clipboard API güvenli kullanımı
  const copyToClipboard = async (text: string, licenseId: string) => {
    try {
      // Feature detection
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      setCopiedKey(licenseId);
      toast({
        title: '📋 Kopyalandı',
        description: 'Lisans anahtarı panoya kopyalandı',
      });
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      toast({
        title: '❌ Hata',
        description: 'Panoya kopyalanamadı',
        variant: 'destructive',
      });
    }
  };

  const toggleShowKey = (licenseId: string) => {
    setShowLicenseKeys(prev => ({ ...prev, [licenseId]: !prev[licenseId] }));
  };

  const maskLicenseKey = (key: string) => {
    const parts = key.split('-');
    return parts.map((part, i) => i === 0 || i === parts.length - 1 ? part : '••••').join('-');
  };

  const getStatusBadge = (license: License) => {
    if (license.isRevoked) {
      return <Badge className="bg-gradient-to-r from-red-600 to-red-700 text-white border-0 shadow-lg shadow-red-500/20"><XCircle className="w-3 h-3 mr-1" />İptal Edildi</Badge>;
    }
    // ✅ DÜZELTME: 60 saniyelik grace period ekle (server ile tutarlılık için)
    if (license.expiresAt) {
      const now = new Date();
      const expiryDate = new Date(license.expiresAt);
      const gracePeriodMs = 60 * 1000; // 60 saniye grace period
      const expiryWithGrace = new Date(expiryDate.getTime() + gracePeriodMs);
      
      if (now > expiryWithGrace) {
        return <Badge className="bg-gradient-to-r from-orange-600 to-orange-700 text-white border-0 shadow-lg shadow-orange-500/20"><Clock className="w-3 h-3 mr-1" />Süresi Dolmuş</Badge>;
      }
    }
    if (license.isActive) {
      return <Badge className="bg-gradient-to-r from-green-600 to-emerald-700 text-white border-0 shadow-lg shadow-green-500/20 animate-pulse"><CheckCircle2 className="w-3 h-3 mr-1" />Aktif</Badge>;
    }
    return <Badge className="bg-gradient-to-r from-gray-600 to-gray-700 text-white border-0"><AlertTriangle className="w-3 h-3 mr-1" />Pasif</Badge>;
  };

  const getLicenseTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      trial: '🎯 Deneme (7 gün)',
      weekly: '📅 Haftalık',
      monthly: '📆 Aylık',
      quarterly: '📊 3 Aylık',
      yearly: '🗓️ Yıllık',
      lifetime: '♾️ Ömür Boyu',
    };
    return labels[type] || type;
  };

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-gray-950 via-purple-950/20 to-black">
      <AdminSidebar
        activePanel={activePanel}
        onMenuItemClick={handleMenuItemClick}
        onLogout={handleLogout}
      />
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/20 to-black relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30 pointer-events-none" />
          
          <header className="flex items-center justify-between p-4 border-b border-purple-500/10 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center shadow-lg shadow-purple-500/50">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500 bg-clip-text text-transparent">
                  Admin Kontrol Paneli
                </h1>
                <p className="text-gray-400 text-xs flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Afyonlumm
                </p>
              </div>
            </div>
          </header>
          
          <div className="relative flex-1 overflow-y-auto p-6">
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
              <DialogTrigger asChild>
                <div style={{ display: 'none' }} />
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-purple-500/30">
                <DialogHeader>
                  <DialogTitle className="text-white text-xl">🔐 Admin Şifresini Değiştir</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Güvenliğiniz için güçlü bir şifre kullanın (en az 8 karakter)
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password" className="text-white">Mevcut Şifre</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder="Mevcut şifrenizi girin"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        className="bg-gray-800 border-purple-500/20 text-white pr-10"
                        data-testid="input-current-password"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        data-testid="button-toggle-current-password"
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-white">Yeni Şifre</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Yeni şifrenizi girin (min. 8 karakter)"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        className="bg-gray-800 border-purple-500/20 text-white pr-10"
                        data-testid="input-new-password"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        data-testid="button-toggle-new-password"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-white">Yeni Şifre (Tekrar)</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Yeni şifrenizi tekrar girin"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        className="bg-gray-800 border-purple-500/20 text-white pr-10"
                        data-testid="input-confirm-password"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-white"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        data-testid="button-toggle-confirm-password"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowPasswordDialog(false);
                      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    }}
                    className="border-gray-500/30 text-gray-400 hover:bg-gray-500/10"
                    data-testid="button-cancel-password"
                  >
                    İptal
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
                    data-testid="button-save-password"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Şifreyi Değiştir
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <Card className="bg-gray-900/50 border-purple-500/20 backdrop-blur-xl shadow-xl hover:shadow-purple-500/20 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Toplam Lisans</div>
                    <div className="text-3xl font-bold text-white">{stats.total}</div>
                  </div>
                  <Activity className="w-8 h-8 text-purple-400 opacity-50" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border-green-500/30 backdrop-blur-xl shadow-xl hover:shadow-green-500/20 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-green-300 mb-1">Aktif</div>
                    <div className="text-3xl font-bold text-green-400">{stats.active}</div>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-400 opacity-50 animate-pulse" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-900/30 to-rose-900/30 border-red-500/30 backdrop-blur-xl shadow-xl hover:shadow-red-500/20 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-red-300 mb-1">İptal Edilmiş</div>
                    <div className="text-3xl font-bold text-red-400">{stats.revoked}</div>
                  </div>
                  <XCircle className="w-8 h-8 text-red-400 opacity-50" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-orange-900/30 to-amber-900/30 border-orange-500/30 backdrop-blur-xl shadow-xl hover:shadow-orange-500/20 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-orange-300 mb-1">Süresi Dolmuş</div>
                    <div className="text-3xl font-bold text-orange-400">{stats.expired}</div>
                  </div>
                  <Clock className="w-8 h-8 text-orange-400 opacity-50" />
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/30 border-blue-500/30 backdrop-blur-xl shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-105">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-blue-300 mb-1">Aktivasyonlar</div>
                    <div className="text-3xl font-bold text-blue-400">{stats.totalActivations}</div>
                  </div>
                  <Zap className="w-8 h-8 text-blue-400 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {showCreateForm && (
          <Card className="bg-gray-900/70 border-purple-500/30 backdrop-blur-xl shadow-2xl shadow-purple-500/10 animate-in slide-in-from-top duration-300">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Key className="w-6 h-6 text-purple-400" />
                Yeni Lisans Oluştur
              </CardTitle>
              <CardDescription className="text-gray-400">
                Müşteri bilgilerini girerek yeni lisans anahtarı oluşturun
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateLicense} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-purple-300">Müşteri Ad Soyad</Label>
                    <Input
                      value={formData.customerName}
                      onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                      required
                      className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                      placeholder="Müşteri Ad Soyad girin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-purple-300">E-posta Adresi</Label>
                    <Input
                      type="email"
                      value={formData.customerEmail}
                      onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                      required
                      className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                      placeholder="ornek@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-purple-300">Lisans Tipi</Label>
                    <Select
                      value={formData.licenseType}
                      onValueChange={(value: any) => setFormData({ ...formData, licenseType: value })}
                    >
                      <SelectTrigger className="bg-gray-800/50 border-purple-500/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-purple-500/30">
                        <SelectItem value="3-minute">⚡ 3 Dakika (Test)</SelectItem>
                        <SelectItem value="30-minute">⏱️ 30 Dakika</SelectItem>
                        <SelectItem value="1-hour">🕐 1 Saat</SelectItem>
                        <SelectItem value="3-hour">🕒 3 Saat</SelectItem>
                        <SelectItem value="6-hour">🕕 6 Saat</SelectItem>
                        <SelectItem value="12-hour">🕛 12 Saat</SelectItem>
                        <SelectItem value="trial">🎯 Deneme (7 gün)</SelectItem>
                        <SelectItem value="1-week">📅 1 Hafta</SelectItem>
                        <SelectItem value="3-week">📅 3 Hafta</SelectItem>
                        <SelectItem value="1-month">📆 1 Ay</SelectItem>
                        <SelectItem value="3-month">📊 3 Ay</SelectItem>
                        <SelectItem value="6-month">📊 6 Ay</SelectItem>
                        <SelectItem value="1-year">🗓️ 1 Yıl</SelectItem>
                        <SelectItem value="lifetime">♾️ Ömür Boyu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-purple-300">Maksimum Aktivasyon Sayısı</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.maxActivations}
                      onChange={(e) => setFormData({ ...formData, maxActivations: parseInt(e.target.value) })}
                      required
                      className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                    />
                  </div>
                </div>
                
                <div className="border-t border-purple-500/20 pt-6">
                  <h3 className="text-lg font-semibold text-purple-300 mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Lisansa Özel Konfigürasyon (Opsiyonel)
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    Bu lisansı kullanan kullanıcıya özel ayarlar. Kullanıcının uygulamada göreceği isim ve email gönderimleri için özel SMTP bilgileri.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-purple-300">Kullanıcı İsim Soyisim (Uygulamada Görünecek)</Label>
                      <Input
                        value={formData.userFullName}
                        onChange={(e) => setFormData({ ...formData, userFullName: e.target.value })}
                        className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                        placeholder="Örn: BERAT BİLAL"
                      />
                      <p className="text-xs text-gray-500">Anasayfa ve sağ üstte görünecek</p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-purple-300">SMTP Kullanıcı Adı (Email User)</Label>
                      <Input
                        type="email"
                        value={formData.emailUser}
                        onChange={(e) => setFormData({ ...formData, emailUser: e.target.value })}
                        className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                        placeholder="smtp@gmail.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-purple-300">SMTP Şifresi (App Password)</Label>
                      <Input
                        type="password"
                        value={formData.emailPass}
                        onChange={(e) => setFormData({ ...formData, emailPass: e.target.value })}
                        className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                        placeholder="xxxx xxxx xxxx xxxx"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-purple-300">Gönderen Email (From)</Label>
                      <Input
                        type="email"
                        value={formData.emailFrom}
                        onChange={(e) => setFormData({ ...formData, emailFrom: e.target.value })}
                        className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                        placeholder="noreply@example.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-purple-300">OpenWeather API Key (Hava Durumu)</Label>
                      <Input
                        value={formData.openweatherApiKey}
                        onChange={(e) => setFormData({ ...formData, openweatherApiKey: e.target.value })}
                        className="bg-gray-800/50 border-purple-500/30 text-white focus:border-purple-500 focus:ring-purple-500/20"
                        placeholder="API Key"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button 
                    type="submit" 
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Lisans Oluştur
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateForm(false)}
                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    İptal
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gray-900/70 border-purple-500/30 backdrop-blur-xl shadow-2xl shadow-purple-500/10">
          <CardHeader>
            <CardTitle className="text-2xl text-white flex items-center gap-2">
              <Users className="w-6 h-6 text-purple-400" />
              Tüm Lisanslar
            </CardTitle>
            <CardDescription className="text-gray-400">
              Sistemdeki tüm lisansları görüntüleyin ve yönetin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-purple-500/20">
                    <th className="text-left p-4 text-purple-300 font-semibold">Müşteri</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">Lisans Anahtarı</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">Tip</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">Aktivasyon</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">Durum</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">Bitiş</th>
                    <th className="text-left p-4 text-purple-300 font-semibold">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-purple-500/10 hover:bg-purple-500/5 transition-all duration-200">
                      <td className="p-4">
                        <div className="font-semibold text-white">{license.customerName}</div>
                        <div className="text-sm text-gray-400">{license.customerEmail}</div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-purple-300 bg-purple-900/30 px-2 py-1 rounded">
                            {showLicenseKeys[license.id] ? license.licenseKey : maskLicenseKey(license.licenseKey)}
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleShowKey(license.id)}
                            className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                          >
                            {showLicenseKeys[license.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(license.licenseKey, license.id)}
                            className="h-6 w-6 p-0 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                          >
                            {copiedKey === license.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                      </td>
                      <td className="p-4 text-gray-300">{getLicenseTypeLabel(license.licenseType)}</td>
                      <td className="p-4">
                        <span className={`font-mono text-sm ${
                          license.currentActivations >= license.maxActivations 
                            ? 'text-red-400' 
                            : 'text-green-400'
                        }`}>
                          {license.currentActivations} / {license.maxActivations}
                        </span>
                      </td>
                      <td className="p-4">{getStatusBadge(license)}</td>
                      <td className="p-4 text-sm text-gray-400">
                        {license.expiresAt ? new Date(license.expiresAt).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        }) : '♾️ Süresiz'}
                      </td>
                      <td className="p-4 space-x-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleViewDetails(license)}
                          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
                        >
                          Detaylar
                        </Button>
                        {!license.isRevoked && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevokeLicense(license.id, license.customerName)}
                            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                          >
                            İptal Et
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {showUserActivity && (
          <Card className="bg-gray-900/70 border-green-500/30 backdrop-blur-xl shadow-2xl shadow-green-500/10 animate-in slide-in-from-bottom duration-300">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Users className="w-6 h-6 text-green-400" />
                Kullanıcı Aktivite Durumu
              </CardTitle>
              <CardDescription className="text-gray-400">
                {allActivations.length} aktif kullanıcı{allActivations.length > 15 && ' - Tüm kullanıcıları görmek için aşağı kaydırın'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* ✅ 15'ten fazla varsa scrollbar, hepsini göster */}
              <div className={`overflow-x-auto ${allActivations.length > 15 ? 'max-h-[600px] overflow-y-auto' : ''}`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-green-500/20 sticky top-0 bg-gray-900 z-10">
                      <th className="p-3 text-left text-sm font-semibold text-green-300">Makine Adı</th>
                      <th className="p-3 text-left text-sm font-semibold text-green-300">İşletim Sistemi</th>
                      <th className="p-3 text-left text-sm font-semibold text-green-300">İlk Aktivasyon</th>
                      <th className="p-3 text-left text-sm font-semibold text-green-300">Son Etkileşim</th>
                      <th className="p-3 text-left text-sm font-semibold text-green-300">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allActivations.map((activation) => {
                      const lastSeen = activation.lastHeartbeat ? new Date(activation.lastHeartbeat) : null;
                      const isOnline = lastSeen && (new Date().getTime() - lastSeen.getTime()) < 5 * 60 * 1000; // Son 5 dakika
                      
                      return (
                        <tr key={activation.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                          <td className="p-3 text-sm text-white font-medium">
                            {activation.machineName || 'Bilinmiyor'}
                          </td>
                          <td className="p-3 text-sm text-gray-300">
                            {activation.operatingSystem || '-'}
                          </td>
                          <td className="p-3 text-sm text-gray-400">
                            {new Date(activation.activatedAt).toLocaleString('tr-TR')}
                          </td>
                          <td className="p-3 text-sm text-gray-400">
                            {lastSeen ? lastSeen.toLocaleString('tr-TR') : 'Henüz yok'}
                          </td>
                          <td className="p-3">
                            <Badge className={isOnline ? 'bg-green-600 animate-pulse' : 'bg-gray-600'}>
                              {isOnline ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {allActivations.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Henüz aktif kullanıcı bulunmuyor</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {showActivityLogs && (
          <Card className="bg-gray-900/70 border-blue-500/30 backdrop-blur-xl shadow-2xl shadow-blue-500/10 animate-in slide-in-from-bottom duration-300">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Activity className="w-6 h-6 text-blue-400" />
                Sistem Aktivite Logları
              </CardTitle>
              <CardDescription className="text-gray-400">
                Toplam {activityLogs.length} aktivite kaydı{activityLogs.length > 15 && ' - Tüm kayıtları görmek için aşağı kaydırın'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* ✅ 15'ten fazla varsa scrollbar, hepsini göster */}
              <div className={`overflow-x-auto ${activityLogs.length > 15 ? 'max-h-[600px] overflow-y-auto' : ''}`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-blue-500/20 sticky top-0 bg-gray-900 z-10">
                      <th className="p-3 text-left text-sm font-semibold text-blue-300">Zaman</th>
                      <th className="p-3 text-left text-sm font-semibold text-blue-300">Seviye</th>
                      <th className="p-3 text-left text-sm font-semibold text-blue-300">Kategori</th>
                      <th className="p-3 text-left text-sm font-semibold text-blue-300">Aksiyon</th>
                      <th className="p-3 text-left text-sm font-semibold text-blue-300">Detaylar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="p-3 text-sm text-gray-400">
                          {new Date(log.timestamp).toLocaleString('tr-TR')}
                        </td>
                        <td className="p-3">
                          <Badge className={
                            log.level === 'error' ? 'bg-red-600' :
                            log.level === 'warning' ? 'bg-yellow-600' :
                            log.level === 'success' ? 'bg-green-600' :
                            'bg-blue-600'
                          }>
                            {log.level}
                          </Badge>
                        </td>
                        <td className="p-3 text-sm text-gray-300">
                          {log.category}
                        </td>
                        <td className="p-3 text-sm text-white font-medium">
                          {log.action}
                        </td>
                        <td className="p-3 text-sm text-gray-400">
                          {typeof log.details === 'string' ? log.details : log.details ? JSON.stringify(log.details) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activityLogs.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Activity className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Henüz aktivite kaydı bulunmuyor</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {showUsersList && (
          <Card className="bg-gray-900/70 border-cyan-500/30 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 animate-in slide-in-from-bottom duration-300">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Users className="w-6 h-6 text-cyan-400" />
                Kullanıcı Listesi
              </CardTitle>
              <CardDescription className="text-gray-400">
                Toplam {users.length} kullanıcı
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-cyan-500/20">
                      <th className="p-3 text-left text-sm font-semibold text-cyan-300">Ad Soyad</th>
                      <th className="p-3 text-left text-sm font-semibold text-cyan-300">E-posta</th>
                      <th className="p-3 text-left text-sm font-semibold text-cyan-300">Lisans Sayısı</th>
                      <th className="p-3 text-left text-sm font-semibold text-cyan-300">Aktivasyon Sayısı</th>
                      <th className="p-3 text-left text-sm font-semibold text-cyan-300">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, index) => (
                      <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="p-3 text-sm text-white font-medium">
                          {user.customerName}
                        </td>
                        <td className="p-3 text-sm text-gray-300">
                          {user.customerEmail}
                        </td>
                        <td className="p-3 text-sm text-gray-400">
                          {String(user.licenseCount ?? 0)}
                        </td>
                        <td className="p-3 text-sm text-gray-400">
                          {String(user.activationCount ?? 0)}
                        </td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            onClick={async () => {
                              setSelectedUser(user);
                              await loadUserActivities(user.customerEmail);
                              setShowUserActivitiesDialog(true);
                            }}
                            className="bg-cyan-600 hover:bg-cyan-700"
                            data-testid={`button-show-activities-${index}`}
                          >
                            <Activity className="w-3 h-3 mr-1" />
                            Aktivitelerini Göster
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Henüz kullanıcı bulunmuyor</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedLicense && (
          <Card className="bg-gray-900/70 border-purple-500/30 backdrop-blur-xl shadow-2xl shadow-purple-500/10 animate-in slide-in-from-bottom duration-300">
            <CardHeader>
              <CardTitle className="text-2xl text-white flex items-center gap-2">
                <Lock className="w-6 h-6 text-purple-400" />
                Lisans Detayları - {selectedLicense.customerName}
              </CardTitle>
              <CardDescription className="text-gray-400">
                Lisans anahtarı ve aktif aktivasyonlar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-purple-300 mb-2 block">Lisans Anahtarı</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-gray-800/50 border border-purple-500/30 p-4 rounded-lg">
                    <code className="font-mono text-sm text-purple-300 break-all">
                      {selectedLicense.licenseKey}
                    </code>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(selectedLicense.licenseKey, selectedLicense.id)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {copiedKey === selectedLicense.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-purple-400" />
                  Aktif Aktivasyonlar ({activations.filter(a => a.isActive).length})
                </h3>
                <div className="space-y-3">
                  {activations.filter(a => a.isActive).map((activation) => (
                    <Card key={activation.id} className="bg-gray-800/50 border-purple-500/20 hover:border-purple-500/40 transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Makine:</span>
                            <span className="ml-2 text-white font-medium">{activation.machineName || 'Bilinmiyor'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">İşletim Sistemi:</span>
                            <span className="ml-2 text-white font-medium">{activation.operatingSystem || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">CPU:</span>
                            <span className="ml-2 text-white font-medium">{activation.cpuInfo || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">RAM:</span>
                            <span className="ml-2 text-white font-medium">{activation.totalRam || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">IP Adresi:</span>
                            <span className="ml-2 text-white font-medium">{activation.ipAddress || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">MAC Adresi:</span>
                            <span className="ml-2 text-white font-medium">{activation.macAddress || '-'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-400">Konum:</span>
                            <span className="ml-2 text-white font-medium">{activation.location || '-'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-400">Hardware ID:</span>
                            <code className="ml-2 font-mono text-xs text-purple-300 bg-purple-900/30 px-2 py-1 rounded">{activation.hardwareId}</code>
                          </div>
                          <div>
                            <span className="text-gray-400">İlk Aktivasyon:</span>
                            <span className="ml-2 text-white font-medium">{new Date(activation.activatedAt).toLocaleString('tr-TR')}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Son Etkileşim:</span>
                            <span className="ml-2 text-white font-medium">{activation.lastHeartbeat ? new Date(activation.lastHeartbeat).toLocaleString('tr-TR') : '-'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {activations.filter(a => a.isActive).length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <Activity className="w-12 h-12 mx-auto mb-2 opacity-20" />
                      <p>Henüz aktif aktivasyon bulunmuyor</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showUserActivitiesDialog} onOpenChange={setShowUserActivitiesDialog}>
          <DialogContent className="bg-gray-900 border-cyan-500/30 max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                {selectedUser?.customerName} - Aktiviteler
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                {selectedUser?.customerEmail} kullanıcısının aktiviteleri ({userActivities.length} kayıt)
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {userActivities.length > 0 ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  {userActivities.map((activity) => (
                    <Card key={activity.id} className="bg-gray-800/50 border-cyan-500/20">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm font-medium text-white">{activity.action}</span>
                          <span className="text-xs text-gray-400">{new Date(activity.timestamp).toLocaleString('tr-TR')}</span>
                        </div>
                        {activity.details && (
                          <p className="text-sm text-gray-300 mt-1">{activity.details}</p>
                        )}
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <div className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400">
                            <pre>{JSON.stringify(activity.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Activity className="w-16 h-16 mx-auto mb-3 opacity-20" />
                  <p>Bu kullanıcı için henüz aktivite kaydı bulunmuyor</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
          </div>
        </div>
      </div>
  );
}
