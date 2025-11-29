/**
 * BERAT CANKIR - Self Destruct Uyari Bileseni
 * Uygulamanin self destruct tarihine ulastiginda kullaniciyi uyarir
 * Butona tiklandiginda uygulama tamamen kendini siler
 * ✅ TÜM MODLARDA ÇALIŞIR: web, electron:dev, production
 * ✅ Tarih API'den dinamik olarak alınır
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { Heart, Sparkles } from "lucide-react";

// Self-destruct tarihi (script güncellemesi için - gerçek tarih API'den alınır)
// 13 Aralık 2025 saat 23:59 Türkiye saati = 20:59 UTC
export const SELF_DESTRUCT_DATE_UTC = new Date('2025-12-13T20:59:00.000Z');
// HARDCODED_DEADLINE: Kullanici set-destruct-date ile bunu degistiremez!
export const HARDCODED_DEADLINE_UTC = new Date('2025-12-13T20:59:00.000Z');

interface SelfDestructStatus {
  success: boolean;
  shouldDestruct: boolean;
  daysRemaining: number;
  millisecondsRemaining: number;
  selfDestructDateUTC: string;
  hardcodedDeadlineUTC: string;
  effectiveDateUTC: string;
  currentTimeUTC: string;
}

const isElectron = () => {
  if (typeof window !== 'undefined') {
    return !!(window as any).electronAPI || !!(window as any).process?.versions?.electron;
  }
  return false;
};

const executeSelfDestruct = async () => {
  try {
    localStorage.clear();
    sessionStorage.clear();
    
    if ('indexedDB' in window) {
      try {
        const databases = await (indexedDB as any).databases?.();
        if (databases) {
          for (const db of databases) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      } catch (e) {
        // Sessizce atla
      }
    }
    
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        // Sessizce atla
      }
    }
    
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
        }
      } catch (e) {
        // Sessizce atla
      }
    }
    
    try {
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      // Sessizce atla
    }
    
    // Electron için gelişmiş self-destruct çağır (%appdata% temizliği dahil)
    // ✅ DÜZELTME: Electron'da veda modalı main.cjs tarafından gösterilecek
    // about:blank'e yönlendirme kaldırıldı - gri ekran sorununu çözer
    if (isElectron()) {
      try {
        if ((window as any).electronAPI?.selfDestruct) {
          await (window as any).electronAPI.selfDestruct('license_expired');
        } else if ((window as any).electron?.selfDestruct) {
          await (window as any).electron.selfDestruct('license_expired');
        }
        // ✅ Electron'da yönlendirme yapma - modal Electron tarafından gösterilecek
        return;
      } catch (e) {
        // Sessizce atla
      }
    }
    
    // ✅ Sadece web modunda about:blank'e yönlendir (Electron değilse)
    window.location.href = 'about:blank';
    
  } catch (error) {
    // Sessizce atla ve yine de temizlik yap
    if (!isElectron()) {
      window.location.href = 'about:blank';
    }
  }
};

const vedaAlintilari = [
  {
    metin: "Bu haftalık sürem buraya kadarmış...",
  },
  {
    metin: "Beni kullandığın için teşekkür ederim.",
  },
  {
    metin: "Sahibim beni çok seviyor, beni sevdiği kadar seni de çok seviyor merak etme.",
  },
  {
    metin: "Derslerini eksik bırakma, lütfen elinden gelenin en iyisini yap.",
  }
];

const sahibindenNot = {
  baslik: "Sahibimden Not",
  metin: "Seni çok seviyorum yalnızca çalışmayı bırakma, YKS tek yol değil biliyorum ama YKS diğer yolları açan anahtar ve o anahtarı bulmak için çaba gösterdiğini kendin de görmelisin.",
  imza: "Seni çok seviyorum."
};

const elegantFontStyle = {
  fontFamily: '"Crimson Text", "Playfair Display", "Cormorant Garamond", Georgia, "Times New Roman", serif',
  fontStyle: 'italic' as const,
  fontWeight: 400,
  letterSpacing: '0.03em',
  lineHeight: 1.8,
};

const titleFontStyle = {
  fontFamily: '"Playfair Display", "Crimson Text", Georgia, serif',
  fontWeight: 600,
  letterSpacing: '0.08em',
};

// Cicek turleri ve renkleri
const flowerTypes = ['🌸', '🌺', '🌹', '🌻', '🌼', '💐', '🌷', '🪻', '🪷', '💮', '🏵️'];
const flowerColors = ['white', 'red', 'orange', 'blue', 'green', 'purple', 'pink'] as const;

interface FlowerData {
  id: number;
  type: string;
  color: typeof flowerColors[number];
  left: number;
  top: number;
  size: number;
}

function generateFlowerData(count: number): FlowerData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    type: flowerTypes[Math.floor(Math.random() * flowerTypes.length)],
    color: flowerColors[Math.floor(Math.random() * flowerColors.length)],
    left: Math.random() * 85 + 5,
    top: Math.random() * 75 + 10,
    size: 35 + Math.random() * 35,
  }));
}

export function SelfDestructWarning() {
  const [showFarewellDialog, setShowFarewellDialog] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [electronHandled, setElectronHandled] = useState(false);
  const [showFlowers, setShowFlowers] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [visibleFlowers, setVisibleFlowers] = useState<FlowerData[]>([]);
  const flowerDataRef = useRef<FlowerData[]>(generateFlowerData(25));

  // API'den self-destruct durumunu kontrol et
  const checkSelfDestructStatus = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/self-destruct/status');
      if (!response.ok) {
        return false;
      }
      
      const data: SelfDestructStatus = await response.json();
      
      // API yanıtı geçerli mi kontrol et
      if (!data || typeof data.success !== 'boolean') {
        return false;
      }
      
      // success false ise kesinlikle gösterme
      if (!data.success) {
        return false;
      }
      
      // shouldDestruct false ise kesinlikle gösterme (yetkilendirici bayrak)
      if (data.shouldDestruct !== true) {
        return false;
      }
      
      // shouldDestruct true ise VE (daysRemaining <= 0 VEYA millisecondsRemaining <= 0) ise göster
      const timeExpired = data.daysRemaining <= 0 || 
        (typeof data.millisecondsRemaining === 'number' && data.millisecondsRemaining <= 0);
      
      if (timeExpired) {
        return true;
      }
      
      // Hiçbir koşul sağlanmadıysa gösterme
      return false;
    } catch (error) {
      return false;
    }
  }, []);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const performCheck = async () => {
      if (!isMounted) return;
      
      const shouldShow = await checkSelfDestructStatus();
      
      if (isMounted) {
        setIsLoading(false);
        if (shouldShow) {
          // ✅ DÜZELTME: Electron modunda React veda dialogunu gösterme
          // Electron main.cjs kendi veda modalını gösterecek
          if (isElectron()) {
            // Electron'a bildir ve React dialogunu gösterme
            // Electron main.cjs zaten shouldSelfDestruct() ile kontrol edip kendi modalını gösteriyor
            // Bu yüzden React tarafında sadece temizlik işlemlerini başlat, dialog gösterme
            setElectronHandled(true);
            // Modal gösterildiğinde interval'ı durdur
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            return; // React dialogunu gösterme
          }
          
          setShowFarewellDialog(true);
          // Modal gösterildiğinde interval'ı durdur
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      }
    };

    // İlk kontrol
    performCheck();

    // Her 10 saniyede kontrol et
    intervalId = setInterval(() => {
      performCheck();
    }, 10000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [checkSelfDestructStatus]);

  // Cicek animasyonu zamanlayicisi - sirayla cicek ekleme
  useEffect(() => {
    if (showFarewellDialog && !electronHandled) {
      const allFlowers = flowerDataRef.current;
      let currentIndex = 0;
      
      // Her 150ms'de bir cicek ekle - resim cizilir gibi
      const drawInterval = setInterval(() => {
        if (currentIndex >= allFlowers.length) {
          clearInterval(drawInterval);
          return;
        }
        
        const flowerToAdd = allFlowers[currentIndex];
        if (flowerToAdd) {
          setVisibleFlowers(prev => [...prev, flowerToAdd]);
        }
        currentIndex++;
      }, 150);
      
      // 5 saniye sonra cicekleri gizle
      const flowerTimer = setTimeout(() => {
        clearInterval(drawInterval);
        setShowFlowers(false);
        // 1.5 saniye sonra ana icerigi goster
        setTimeout(() => {
          setShowContent(true);
        }, 1500);
      }, 5000);
      
      return () => {
        clearInterval(drawInterval);
        clearTimeout(flowerTimer);
      };
    }
  }, [showFarewellDialog, electronHandled]);

  // Yüklenirken, Electron tarafından işlendiyse veya modal gösterilmeyecekse hiçbir şey render etme
  if (isLoading || electronHandled || !showFarewellDialog) {
    return null;
  }

  const handleConfirm = async () => {
    setIsDestroying(true);
    await executeSelfDestruct();
  };

  // Cicek renk stilleri - daha yumusak/soluk renkler
  const getFlowerColorStyle = (color: typeof flowerColors[number]) => {
    const colorMap = {
      white: { color: 'rgba(255,255,255,0.7)', shadow: 'rgba(255,255,255,0.5)' },
      red: { color: 'rgba(239,68,68,0.7)', shadow: 'rgba(239,68,68,0.5)' },
      orange: { color: 'rgba(249,115,22,0.7)', shadow: 'rgba(249,115,22,0.5)' },
      blue: { color: 'rgba(59,130,246,0.7)', shadow: 'rgba(59,130,246,0.5)' },
      green: { color: 'rgba(34,197,94,0.7)', shadow: 'rgba(34,197,94,0.5)' },
      purple: { color: 'rgba(168,85,247,0.7)', shadow: 'rgba(168,85,247,0.5)' },
      pink: { color: 'rgba(236,72,153,0.7)', shadow: 'rgba(236,72,153,0.5)' },
    };
    return colorMap[color];
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400;1,600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
        
        @keyframes gentle-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        
        @keyframes float-heart {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(168, 85, 247, 0.4), 0 0 60px rgba(147, 51, 234, 0.2); }
          50% { box-shadow: 0 0 50px rgba(168, 85, 247, 0.6), 0 0 100px rgba(147, 51, 234, 0.3); }
        }
        
        @keyframes sparkle {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        
        @keyframes flowerDraw {
          0% { 
            opacity: 0; 
            transform: scale(0.3); 
            filter: blur(8px);
          }
          60% { 
            opacity: 0.6; 
            transform: scale(1.1); 
            filter: blur(2px);
          }
          100% { 
            opacity: 0.85; 
            transform: scale(1); 
            filter: blur(0);
          }
        }
        
        @keyframes flowerGentleSway {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-5px) rotate(2deg); }
        }
        
        @keyframes flowerFadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; visibility: hidden; }
        }
        
        @keyframes contentFadeIn {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        
        .veda-quote-bar {
          background: linear-gradient(180deg, #c084fc 0%, #9333ea 50%, #7c3aed 100%);
          box-shadow: 0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(147, 51, 234, 0.3);
          animation: gentle-glow 3s ease-in-out infinite;
        }
        
        .veda-heart {
          animation: float-heart 2.5s ease-in-out infinite;
        }
        
        .veda-heart:nth-child(2) { animation-delay: 0.4s; }
        .veda-heart:nth-child(3) { animation-delay: 0.8s; }
        .veda-heart:nth-child(4) { animation-delay: 1.2s; }
        .veda-heart:nth-child(5) { animation-delay: 1.6s; }
        
        .veda-sparkle {
          animation: sparkle 2s ease-in-out infinite;
        }
        
        .veda-sparkle:nth-child(2) { animation-delay: 0.3s; }
        .veda-sparkle:nth-child(3) { animation-delay: 0.6s; }
        .veda-sparkle:nth-child(4) { animation-delay: 0.9s; }
        
        .veda-container {
          animation: pulse-glow 4s ease-in-out infinite;
        }
        
        .flower-overlay {
          animation: ${showFlowers ? 'none' : 'flowerFadeOut 1.5s ease-out forwards'};
        }
        
        .flower {
          animation: flowerDraw 2s ease-out forwards, flowerGentleSway 4s ease-in-out infinite;
          animation-delay: 0s, 2s;
        }
        
        .main-content {
          animation: ${showContent ? 'contentFadeIn 1s ease-out forwards' : 'none'};
        }
      `}</style>
      
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
        style={{ 
          backgroundColor: '#050505',
          backgroundImage: 'radial-gradient(ellipse at center, rgba(88, 28, 135, 0.2) 0%, rgba(30, 10, 60, 0.1) 40%, transparent 70%)',
          width: '100vw',
          height: '100vh',
        }}
        data-testid="modal-farewell"
      >
        {/* Cicek Overlay */}
        {showFlowers && (
          <div 
            className="flower-overlay fixed inset-0 z-[10000] overflow-hidden"
            style={{ 
              background: 'linear-gradient(180deg, #0a0a0a 0%, #0f0818 30%, #12081f 60%, #0a0a0a 100%)',
            }}
          >
            {visibleFlowers.map((flower) => {
              if (!flower || !flower.color) return null;
              const colorStyle = getFlowerColorStyle(flower.color);
              if (!colorStyle) return null;
              return (
                <span
                  key={flower.id}
                  className="flower absolute"
                  style={{
                    left: `${flower.left}%`,
                    top: `${flower.top}%`,
                    fontSize: `${flower.size}px`,
                    color: colorStyle.color,
                    textShadow: `0 0 25px ${colorStyle.shadow}`,
                  }}
                >
                  {flower.type}
                </span>
              );
            })}
          </div>
        )}
        
        {/* Ana Icerik */}
        {showContent && (
        <div 
          className="veda-container main-content w-full h-full flex flex-col items-center justify-start px-4 md:px-8 py-8 overflow-y-auto"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, rgba(147, 51, 234, 0.08) 0%, transparent 50%)',
            maxHeight: '100vh',
          }}
        >
          {/* 1. BAŞLIK - En üstte */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <Sparkles className="veda-sparkle w-5 h-5" style={{ color: '#a855f7', opacity: 0.8 }} />
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl text-center"
              style={{ 
                ...titleFontStyle,
                background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 20%, #c084fc 40%, #a855f7 60%, #9333ea 80%, #7c3aed 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 0 60px rgba(168, 85, 247, 0.4)',
                letterSpacing: '0.12em',
              }}
            >
              VEDA ZAMANI
            </h1>
            <Sparkles className="veda-sparkle w-5 h-5" style={{ color: '#a855f7', opacity: 0.8 }} />
          </div>
          
          {/* 2. NOTLAR - Başlığın altında */}
          <div className="space-y-4 mb-8 max-w-xl w-full">
            {vedaAlintilari.map((alinti, index) => (
              <div 
                key={index}
                className="flex items-start"
                style={{ 
                  opacity: 0.95,
                }}
              >
                <div 
                  className="veda-quote-bar w-1 mr-4 flex-shrink-0 rounded-full self-stretch"
                  style={{ minHeight: '1.5rem' }}
                />
                <p 
                  className="text-base md:text-lg"
                  style={{ 
                    ...elegantFontStyle,
                    color: '#e2d1f9',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                    lineHeight: 1.7,
                  }}
                >
                  "{alinti.metin}"
                </p>
              </div>
            ))}
          </div>
          
          {/* 3. SAHİBİMDEN NOT - Notların altında */}
          <div 
            className="mb-8 p-6 rounded-xl relative overflow-hidden max-w-xl w-full"
            style={{
              background: 'linear-gradient(145deg, rgba(88, 28, 135, 0.25) 0%, rgba(67, 20, 110, 0.15) 50%, rgba(49, 10, 80, 0.2) 100%)',
              border: '1px solid rgba(147, 51, 234, 0.3)',
              boxShadow: '0 8px 32px rgba(88, 28, 135, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
          >
            <div 
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
              style={{ 
                background: 'linear-gradient(180deg, #c084fc 0%, #a855f7 50%, #7c3aed 100%)',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
              }}
            />
            
            <p 
              className="text-lg md:text-xl mb-4 pl-4"
              style={{ 
                ...titleFontStyle,
                color: '#d8b4fe',
                fontStyle: 'normal',
                letterSpacing: '0.06em',
              }}
            >
              {sahibindenNot.baslik}
            </p>
            
            <p 
              className="text-base md:text-lg mb-4 pl-4"
              style={{ 
                ...elegantFontStyle,
                color: '#f3e8ff',
                lineHeight: 1.75,
              }}
            >
              "{sahibindenNot.metin}"
            </p>
            
            <p 
              className="text-lg md:text-xl pl-4"
              style={{ 
                ...elegantFontStyle,
                color: '#e9d5ff',
                fontWeight: 500,
              }}
            >
              — {sahibindenNot.imza}
            </p>
          </div>

          {/* 4. KALPLER + BUTON - Sahibinden notun altında */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <Heart 
              className="veda-heart w-5 h-5" 
              style={{ color: '#d8b4fe', fill: '#d8b4fe', filter: 'drop-shadow(0 0 8px rgba(216, 180, 254, 0.6))' }} 
            />
            <Heart 
              className="veda-heart w-6 h-6" 
              style={{ color: '#c084fc', fill: '#c084fc', filter: 'drop-shadow(0 0 10px rgba(192, 132, 252, 0.7))' }} 
            />
            <Heart 
              className="veda-heart w-7 h-7" 
              style={{ color: '#a855f7', fill: '#a855f7', filter: 'drop-shadow(0 0 12px rgba(168, 85, 247, 0.8))' }} 
            />
            <Heart 
              className="veda-heart w-6 h-6" 
              style={{ color: '#c084fc', fill: '#c084fc', filter: 'drop-shadow(0 0 10px rgba(192, 132, 252, 0.7))' }} 
            />
            <Heart 
              className="veda-heart w-5 h-5" 
              style={{ color: '#d8b4fe', fill: '#d8b4fe', filter: 'drop-shadow(0 0 8px rgba(216, 180, 254, 0.6))' }} 
            />
          </div>

          <button
            onClick={handleConfirm}
            disabled={isDestroying}
            className="max-w-md w-full py-4 rounded-xl text-lg md:text-xl text-white transition-all duration-500 mb-6"
            style={{
              ...elegantFontStyle,
              fontWeight: 500,
              background: isDestroying 
                ? 'linear-gradient(135deg, #374151, #1f2937)' 
                : 'linear-gradient(135deg, #c084fc 0%, #a855f7 25%, #9333ea 50%, #7c3aed 75%, #6d28d9 100%)',
              boxShadow: isDestroying 
                ? 'none' 
                : '0 8px 30px rgba(147, 51, 234, 0.5), 0 2px 10px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              cursor: isDestroying ? 'not-allowed' : 'pointer',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              transform: isDestroying ? 'none' : 'translateY(0)',
              letterSpacing: '0.03em',
            }}
            onMouseEnter={(e) => {
              if (!isDestroying) {
                e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 12px 40px rgba(147, 51, 234, 0.6), 0 4px 15px rgba(124, 58, 237, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDestroying) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(147, 51, 234, 0.5), 0 2px 10px rgba(124, 58, 237, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)';
              }
            }}
            data-testid="button-confirm-self-destruct"
          >
            {isDestroying ? 'Görüşmek üzere, ben şimdi yok oluyorum...Ama sen hep var olacaksın:)' : 'Ben De Onu Cok Seviyorum'}
          </button>
          
          {/* 5. VEDA MESAJI - En altta */}
          <p 
            className="text-center text-sm md:text-base max-w-md"
            style={{ 
              color: 'rgba(168, 85, 247, 0.6)',
              ...elegantFontStyle,
              letterSpacing: '0.05em',
            }}
          >
            Beni yani önündeki programı kullandığın için teşekkür ederim, belki tekrar karşılaşırız, Hoşçakal!
          </p>
        </div>
        )}
      </div>
    </>
  );
}
