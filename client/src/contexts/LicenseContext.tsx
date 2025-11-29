import { createContext, useContext, useState, ReactNode } from 'react';

interface LicenseContextType {
  isValid: boolean;
  expiresAt: string | null;
  userName: string | null;
  checkLicense: () => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

// ✅ AFYONLUM: Lisans kontrolü artık App.tsx'teki LicenseModal ile yapılıyor
// Bu context sadece lisans durumunu tutmak için kullanılıyor, toast mesajı göstermiyor
export function LicenseProvider({ children }: { children: ReactNode }) {
  const [isValid, setIsValid] = useState(true);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>('Afyonlum');

  const checkLicense = async () => {
    // Lisans kontrolü App.tsx'teki LicenseModal tarafından yapılıyor
    // Bu fonksiyon sadece uyumluluk için tutuluyor
    setIsValid(true);
    setUserName('Afyonlum');
  };

  return (
    <LicenseContext.Provider value={{ isValid, expiresAt, userName, checkLicense }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}
