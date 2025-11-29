// BERAT BİLAL CANKIR
// BERAT CANKIR
import { useQuery } from '@tanstack/react-query';

interface UserInfo {
  success: boolean;
  fullname: string;
  hasFullname: boolean;
}

/**
 * Kullanıcı adını ve soyadını çeker
 * Electron ortamında ConfigManager'dan yüklenir
 * Web ortamında boş string döner
 */
export function useUserInfo() {
  const { data, isLoading, error } = useQuery<UserInfo>({
    queryKey: ['/api/user/info'],
    queryFn: async () => {
      const response = await fetch('/api/user/info');
      if (!response.ok) {
        throw new Error('Kullanıcı bilgisi alınamadı');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 dakika cache
    refetchOnWindowFocus: false, // Pencere odaklandığında yeniden fetch yapma
  });

  return {
    fullname: data?.fullname || '',
    hasFullname: data?.hasFullname || false,
    isLoading,
    error
  };
}
