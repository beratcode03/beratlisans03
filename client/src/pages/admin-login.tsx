import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@arayuz/button';
import { Input } from '@arayuz/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@arayuz/card';
import { Shield, Lock, AlertTriangle, Eye, EyeOff, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (password: string) => {
      const response = await fetch('/api/afyonlu03giris', {
        method: 'POST',
        body: JSON.stringify({ password }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Geçersiz şifre');
      }

      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem('admin_token', data.token);
      toast({
        title: '✅ Giriş Başarılı',
        description: 'Admin paneline yönlendiriliyorsunuz...',
      });
      setTimeout(() => {
        setLocation('/afyonlu/03panel');
      }, 500);
    },
    onError: () => {
      toast({
        title: '❌ Giriş Başarısız',
        description: 'Geçersiz admin şifresi',
        variant: 'destructive',
      });
      setPassword('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast({
        title: '⚠️ Uyarı',
        description: 'Lütfen şifrenizi girin',
        variant: 'destructive',
      });
      return;
    }
    loginMutation.mutate(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-gray-900 to-black p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
      
      <Card className="w-full max-w-md bg-gray-900/90 border-purple-500/30 shadow-2xl shadow-purple-500/20 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent" />
        
        <CardHeader className="space-y-4 relative">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/50">
            <Shield className="w-8 h-8 text-white" />
          </div>
          
          <div className="text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Admin Paneli
            </CardTitle>
            <CardDescription className="text-gray-400 mt-2">
              Güvenli giriş alanı - Sadece yetkili erişim
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs">Yetkisiz erişim girişimleri kaydedilir</span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-purple-300">Admin Şifresi</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-gray-800/50 border-purple-500/30 focus:border-purple-500 text-white placeholder:text-gray-500"
                  data-testid="input-admin-password"
                  disabled={loginMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 hover:text-purple-300 transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold shadow-lg shadow-purple-500/30"
              disabled={loginMutation.isPending}
              data-testid="button-admin-login"
            >
              {loginMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Doğrulanıyor...</span>
                </div>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Giriş Yap
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation('/')}
              className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              data-testid="button-go-home"
            >
              <Home className="w-4 h-4 mr-2" />
              Anasayfaya Dön
            </Button>
          </form>

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-center text-gray-500">
              🔒 Şifreli bağlantı | 🛡️ Güvenli giriş
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
