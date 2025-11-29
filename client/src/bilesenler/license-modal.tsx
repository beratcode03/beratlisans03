import { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, AlertTriangle, Sparkles, Heart } from 'lucide-react';

interface LicenseModalProps {
  isOpen: boolean;
  onLicenseValidated: () => void;
}

const LICENSE_KEY = 'B3SN-QRB6-0BC3-306B';
const MAX_ATTEMPTS = 3;
const COUNTDOWN_SECONDS = 210; // 3:30

export function LicenseModal({ isOpen, onLicenseValidated }: LicenseModalProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pulseRed, setPulseRed] = useState(false);

  // Kirmizi yanip sonme efekti (her saniye)
  useEffect(() => {
    if (!isOpen || countdown <= 0) return;
    
    const pulseInterval = setInterval(() => {
      setPulseRed(prev => !prev);
    }, 500);

    return () => clearInterval(pulseInterval);
  }, [isOpen, countdown]);

  // Geri sayim
  useEffect(() => {
    if (!isOpen || countdown <= 0 || showSuccess) return;
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setTimeout(() => {
            triggerSelfDestruct();
          }, 1000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, showSuccess]);

  // ✅ DÜZELTME: Electron modunda yönlendirme yapma - veda modalı Electron tarafından gösterilecek
  const isElectron = () => {
    if (typeof window !== 'undefined') {
      return !!(window as any).electronAPI || !!(window as any).process?.versions?.electron;
    }
    return false;
  };

  const triggerSelfDestruct = useCallback(async () => {
    try {
      if ((window as any).electronAPI?.selfDestruct) {
        await (window as any).electronAPI.selfDestruct('license_timeout');
        // ✅ Electron'da yönlendirme yapma - modal Electron tarafından gösterilecek
        if (isElectron()) return;
      }
      fetch('/api/self-destruct/trigger', { method: 'POST' }).catch(() => {});
      // ✅ Sadece web modunda /veda'ya yönlendir
      if (!isElectron()) {
        window.location.href = '/veda';
      }
    } catch {
      if (!isElectron()) {
        window.location.href = '/veda';
      }
    }
  }, []);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setError(null);

    await new Promise(resolve => setTimeout(resolve, 800));

    if (licenseKey.trim().toUpperCase() === LICENSE_KEY) {
      localStorage.setItem('license_validated', 'true');
      localStorage.setItem('license_validated_at', new Date().toISOString());
      setShowSuccess(true);
      
      setTimeout(() => {
        onLicenseValidated();
      }, 2000);
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        setError('3 hatali deneme! Self-destruct aktif...');
        setTimeout(() => {
          triggerSelfDestruct();
        }, 2000);
      } else {
        setError('Gecersiz lisans anahtari! (' + (MAX_ATTEMPTS - newAttempts) + ' deneme hakki kaldi)');
      }
    }
    
    setIsValidating(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && licenseKey.trim() && !isValidating) {
      handleValidate();
    }
  };

  if (!isOpen) return null;

  // Basarili giris ekrani
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center" style={{
        background: 'linear-gradient(180deg, #0a0a0a 0%, #12081f 50%, #0a0a0a 100%)',
      }}>
        <style>{`
          @keyframes successPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
          @keyframes successGlow {
            0%, 100% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.4), 0 0 60px rgba(34, 197, 94, 0.2); }
            50% { box-shadow: 0 0 50px rgba(34, 197, 94, 0.6), 0 0 100px rgba(34, 197, 94, 0.4); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        
        <div className="text-center" style={{ animation: 'fadeInUp 0.6s ease-out' }}>
          <div className="mb-6" style={{ animation: 'successPulse 1.5s ease-in-out infinite' }}>
            <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(21, 128, 61, 0.2))',
              border: '2px solid rgba(34, 197, 94, 0.5)',
              animation: 'successGlow 2s ease-in-out infinite',
            }}>
              <Shield className="w-12 h-12 text-green-400" />
            </div>
          </div>
          
          <h1 className="text-3xl font-bold mb-3" style={{
            background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Hosgeldin Afyonlum!
          </h1>
          
          <p className="text-gray-400 text-lg">Uygulamaya yonlendiriliyorsun...</p>
          
          <div className="flex justify-center gap-2 mt-6">
            <Heart className="w-5 h-5 text-purple-400" style={{ animation: 'successPulse 1s ease-in-out infinite' }} />
            <Heart className="w-4 h-4 text-purple-500" style={{ animation: 'successPulse 1s ease-in-out infinite 0.2s' }} />
            <Heart className="w-3 h-3 text-purple-600" style={{ animation: 'successPulse 1s ease-in-out infinite 0.4s' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{
      background: 'linear-gradient(180deg, #0a0a0a 0%, #12081f 30%, #1a0a2e 60%, #0a0a0a 100%)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap');
        
        @keyframes glowPulse {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(147, 51, 234, 0.4), 
                        0 0 40px rgba(147, 51, 234, 0.2),
                        0 0 60px rgba(147, 51, 234, 0.1),
                        inset 0 0 20px rgba(147, 51, 234, 0.1);
          }
          50% { 
            box-shadow: 0 0 30px rgba(147, 51, 234, 0.6), 
                        0 0 60px rgba(147, 51, 234, 0.4),
                        0 0 90px rgba(147, 51, 234, 0.2),
                        inset 0 0 30px rgba(147, 51, 234, 0.15);
          }
        }
        
        @keyframes timerPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @keyframes redBlink {
          0%, 100% { 
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(185, 28, 28, 0.2));
            border-color: rgba(239, 68, 68, 0.6);
            box-shadow: 0 0 30px rgba(239, 68, 68, 0.5), 0 0 60px rgba(239, 68, 68, 0.3);
          }
          50% { 
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.5), rgba(185, 28, 28, 0.4));
            border-color: rgba(239, 68, 68, 0.9);
            box-shadow: 0 0 50px rgba(239, 68, 68, 0.7), 0 0 100px rgba(239, 68, 68, 0.5);
          }
        }
        
        @keyframes sparkle {
          0%, 100% { opacity: 0.3; transform: scale(0.8) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        
        @keyframes shieldGlow {
          0%, 100% { filter: drop-shadow(0 0 10px rgba(147, 51, 234, 0.5)); }
          50% { filter: drop-shadow(0 0 20px rgba(147, 51, 234, 0.8)); }
        }
        
        @keyframes inputGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(147, 51, 234, 0.3), inset 0 0 5px rgba(147, 51, 234, 0.1); }
          50% { box-shadow: 0 0 20px rgba(147, 51, 234, 0.5), inset 0 0 10px rgba(147, 51, 234, 0.2); }
        }
        
        @keyframes buttonGlow {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(147, 51, 234, 0.5), 
                        0 4px 20px rgba(147, 51, 234, 0.3);
          }
          50% { 
            box-shadow: 0 0 40px rgba(147, 51, 234, 0.7), 
                        0 4px 40px rgba(147, 51, 234, 0.5);
          }
        }
        
        .timer-container {
          font-family: 'Orbitron', 'Rajdhani', monospace;
        }
        
        .license-input {
          font-family: 'Orbitron', monospace;
          letter-spacing: 0.2em;
        }
      `}</style>

      {/* Arka plan partiküller */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <Sparkles
            key={i}
            className="absolute text-purple-500/20"
            style={{
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              width: 8 + Math.random() * 16,
              height: 8 + Math.random() * 16,
              animation: 'sparkle ' + (2 + Math.random() * 3) + 's ease-in-out infinite ' + (Math.random() * 2) + 's',
            }}
          />
        ))}
      </div>

      {/* Ana modal */}
      <div 
        className="relative w-full max-w-lg rounded-2xl border-2 p-8"
        style={{
          background: 'linear-gradient(145deg, rgba(20, 10, 35, 0.95), rgba(10, 5, 20, 0.98))',
          borderColor: 'rgba(147, 51, 234, 0.4)',
          animation: 'glowPulse 3s ease-in-out infinite',
        }}
      >
        {/* Dekoratif köşeler */}
        <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-purple-500/60 rounded-tl-xl" />
        <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-purple-500/60 rounded-tr-xl" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-purple-500/60 rounded-bl-xl" />
        <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-purple-500/60 rounded-br-xl" />

        {/* Sayaç */}
        <div className="flex justify-center mb-6">
          <div 
            className="timer-container px-6 py-3 rounded-xl border-2"
            style={{
              background: countdown <= 60 
                ? (pulseRed ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(185, 28, 28, 0.3))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.1))')
                : 'linear-gradient(135deg, rgba(147, 51, 234, 0.3), rgba(88, 28, 135, 0.2))',
              borderColor: countdown <= 60 
                ? (pulseRed ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.4)')
                : 'rgba(147, 51, 234, 0.5)',
              boxShadow: countdown <= 60
                ? (pulseRed ? '0 0 40px rgba(239, 68, 68, 0.6), 0 0 80px rgba(239, 68, 68, 0.3)' : '0 0 20px rgba(239, 68, 68, 0.3)')
                : '0 0 20px rgba(147, 51, 234, 0.3)',
              animation: countdown <= 60 ? 'timerPulse 0.5s ease-in-out infinite' : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{
                  background: countdown <= 60 ? '#ef4444' : '#a855f7',
                  boxShadow: countdown <= 60 
                    ? (pulseRed ? '0 0 15px #ef4444' : '0 0 5px #ef4444')
                    : '0 0 10px #a855f7',
                  transition: 'all 0.3s ease',
                }}
              />
              <span 
                className="text-3xl font-bold tracking-wider"
                style={{
                  color: countdown <= 60 ? '#f87171' : '#c4b5fd',
                  textShadow: countdown <= 60 
                    ? '0 0 10px rgba(248, 113, 113, 0.8)'
                    : '0 0 10px rgba(196, 181, 253, 0.5)',
                }}
              >
                {formatCountdown(countdown)}
              </span>
            </div>
          </div>
        </div>

        {/* Shield icon */}
        <div className="flex justify-center mb-6" style={{ animation: 'float 3s ease-in-out infinite' }}>
          <div 
            className="w-20 h-20 rounded-full flex items-center justify-center border-2"
            style={{
              background: 'linear-gradient(145deg, rgba(147, 51, 234, 0.2), rgba(88, 28, 135, 0.1))',
              borderColor: 'rgba(147, 51, 234, 0.5)',
              boxShadow: '0 0 30px rgba(147, 51, 234, 0.4), inset 0 0 20px rgba(147, 51, 234, 0.1)',
            }}
          >
            <Shield 
              className="w-10 h-10 text-purple-400" 
              style={{ animation: 'shieldGlow 2s ease-in-out infinite' }}
            />
          </div>
        </div>

        {/* Başlık */}
        <h1 
          className="text-3xl font-bold text-center mb-2"
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            background: 'linear-gradient(135deg, #e9d5ff 0%, #c084fc 30%, #a855f7 50%, #9333ea 70%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 0 30px rgba(168, 85, 247, 0.3)',
          }}
        >
          LISANS DOGRULAMA
        </h1>

        <p className="text-center text-gray-400 mb-6 text-sm">
          AFYONLUM YKS Analiz Sistemi'ne erisim icin lisans anahtarini gir
        </p>

        {/* Input */}
        <div className="relative mb-4">
          <div 
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(147, 51, 234, 0.3), rgba(88, 28, 135, 0.2))',
            }}
          >
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <input
            type="password"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
            disabled={isValidating || failedAttempts >= MAX_ATTEMPTS}
            autoFocus
            className="license-input w-full pl-14 pr-4 py-4 rounded-xl border-2 text-lg text-center text-white placeholder:text-gray-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(10, 5, 20, 0.8)',
              borderColor: error ? 'rgba(239, 68, 68, 0.5)' : 'rgba(147, 51, 234, 0.4)',
              animation: !error ? 'inputGlow 3s ease-in-out infinite' : 'none',
            }}
            data-testid="input-license-key"
          />
        </div>

        {/* Hata mesajı */}
        {error && (
          <div 
            className="flex items-center gap-3 p-4 rounded-xl mb-4 border"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              animation: 'redBlink 1s ease-in-out infinite',
            }}
          >
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-sm">{error}</span>
          </div>
        )}

        {/* Doğrula butonu */}
        <button
          onClick={handleValidate}
          disabled={!licenseKey.trim() || isValidating || failedAttempts >= MAX_ATTEMPTS}
          className="w-full py-4 rounded-xl font-bold text-lg text-white transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            fontFamily: 'Rajdhani, sans-serif',
            background: 'linear-gradient(135deg, #9333ea 0%, #7c3aed 50%, #6d28d9 100%)',
            animation: !isValidating && licenseKey.trim() ? 'buttonGlow 2s ease-in-out infinite' : 'none',
          }}
          data-testid="button-validate-license"
        >
          {isValidating ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              DOGRULANIYOR...
            </span>
          ) : failedAttempts >= MAX_ATTEMPTS ? (
            'ERISIM ENGELLENDI'
          ) : (
            'DOGRULA'
          )}
        </button>

        {/* Uyarı */}
        {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && (
          <p className="text-center text-xs text-gray-500 mt-4">
            Dikkat: {MAX_ATTEMPTS} hatali denemeden sonra uygulama kilitlenir
          </p>
        )}

        {/* Alt dekorasyon */}
        <div className="flex justify-center gap-2 mt-6">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-purple-500/40"
              style={{
                animation: 'sparkle ' + (1.5 + i * 0.2) + 's ease-in-out infinite ' + (i * 0.1) + 's',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
