import { useState, useEffect } from 'react';

interface LocationInfo {
  city: string;
  district: string;
  displayText: string;
  isLoading: boolean;
  error: string | null;
}

const CACHE_KEY = 'user_location_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 saat

interface CachedLocation {
  city: string;
  district: string;
  timestamp: number;
}

async function reverseGeocode(lat: number, lon: number): Promise<{ city: string; district: string } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      {
        headers: {
          'Accept-Language': 'tr',
          'User-Agent': 'AfyonlumYKS/1.0'
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const address = data.address || {};
    
    const city = address.province || address.state || address.city || '';
    const district = address.town || address.suburb || address.district || address.county || '';
    
    return { city, district };
  } catch {
    return null;
  }
}

async function getLocationByIP(): Promise<{ city: string; district: string } | null> {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    return {
      city: data.region || data.city || '',
      district: data.city || ''
    };
  } catch {
    return null;
  }
}

export function useLocationInfo(): LocationInfo {
  const [locationInfo, setLocationInfo] = useState<LocationInfo>({
    city: '',
    district: '',
    displayText: '',
    isLoading: true,
    error: null
  });

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsedCache: CachedLocation = JSON.parse(cached);
          const now = Date.now();
          
          if (now - parsedCache.timestamp < CACHE_TTL) {
            const displayText = parsedCache.district 
              ? `${parsedCache.city}, ${parsedCache.district}`
              : parsedCache.city;
            
            setLocationInfo({
              city: parsedCache.city,
              district: parsedCache.district,
              displayText,
              isLoading: false,
              error: null
            });
            return;
          }
        }
      } catch {
        // Cache okuma hatasi - devam et
      }

      if ('geolocation' in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 10000,
              maximumAge: 300000,
              enableHighAccuracy: false
            });
          });
          
          const result = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          
          if (result && result.city) {
            const displayText = result.district 
              ? `${result.city}, ${result.district}`
              : result.city;
            
            const cacheData: CachedLocation = {
              city: result.city,
              district: result.district,
              timestamp: Date.now()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            
            setLocationInfo({
              city: result.city,
              district: result.district,
              displayText,
              isLoading: false,
              error: null
            });
            return;
          }
        } catch {
          // Geolocation hatasi - IP fallback'e devam et
        }
      }

      try {
        const ipResult = await getLocationByIP();
        
        if (ipResult && ipResult.city) {
          const displayText = ipResult.district && ipResult.district !== ipResult.city
            ? `${ipResult.city}, ${ipResult.district}`
            : ipResult.city;
          
          const cacheData: CachedLocation = {
            city: ipResult.city,
            district: ipResult.district,
            timestamp: Date.now()
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
          
          setLocationInfo({
            city: ipResult.city,
            district: ipResult.district,
            displayText,
            isLoading: false,
            error: null
          });
          return;
        }
      } catch {
        // IP lokasyon hatasi
      }

      setLocationInfo({
        city: 'Turkiye',
        district: '',
        displayText: 'Turkiye',
        isLoading: false,
        error: null
      });
    };

    fetchLocation();
  }, []);

  return locationInfo;
}
