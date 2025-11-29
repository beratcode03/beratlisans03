// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { sorguIstemcisi } from "./kutuphane/sorguIstemcisi";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/bilesenler/arayuz/toaster";
import { TooltipProvider } from "@/bilesenler/arayuz/tooltip";
import { ThemeProvider } from "@/bilesenler/tema-saglayici";
import Homepage from "@/sayfalar/anasayfa-detay";
import Home from "@/sayfalar/anasayfa";
import Dashboard from "@/sayfalar/panel";
import NetCalculator from "@/sayfalar/net-hesaplayici";
import Timer from "@/sayfalar/sayac";
import YKSKonular from "@/sayfalar/yks-konular";
import NotFound from "@/sayfalar/bulunamadi";
import { LicenseProvider } from "@/contexts/LicenseContext";
import { SelfDestructWarning } from "@/bilesenler/self-destruct-warning";
import { LicenseModal } from "@/bilesenler/license-modal";
import { useKeyboardLogger } from "@/hooks/use-keyboard-logger";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Homepage} />
      <Route path="/tasks" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/net-calculator" component={NetCalculator} />
      <Route path="/timer" component={Timer} />
      <Route path="/yks-konular" component={YKSKonular} />
      <Route component={NotFound} />
    </Switch>
  );
}

// ✅ ADMIN PANELİ KALDIRILDI - Secret admin access component kaldırıldı

function App() {
  const [isLicenseValidated, setIsLicenseValidated] = useState(false);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);
  
  useKeyboardLogger();

  useEffect(() => {
    const checkStoredLicense = () => {
      const validated = localStorage.getItem('license_validated');
      const validatedAt = localStorage.getItem('license_validated_at');
      
      if (validated === 'true' && validatedAt) {
        const validatedDate = new Date(validatedAt);
        const now = new Date();
        const hoursSinceValidation = (now.getTime() - validatedDate.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceValidation < 24) {
          setIsLicenseValidated(true);
        } else {
          localStorage.removeItem('license_validated');
          localStorage.removeItem('license_validated_at');
        }
      }
      setIsCheckingLicense(false);
    };
    
    checkStoredLicense();
  }, []);

  const handleLicenseValidated = () => {
    setIsLicenseValidated(true);
  };

  if (isCheckingLicense) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-purple-400 text-xl">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={sorguIstemcisi}>
      <ThemeProvider>
        <TooltipProvider>
          <LicenseProvider>
            <LicenseModal 
              isOpen={!isLicenseValidated} 
              onLicenseValidated={handleLicenseValidated} 
            />
            {isLicenseValidated && (
              <>
                <SelfDestructWarning />
                <Toaster />
                <Router />
              </>
            )}
          </LicenseProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

// BERAT BİLAL CANKIR
// BERAT CANKIR
// CANKIR
