import { useEffect } from 'react';

export function useAntiDevTools() {
  useEffect(() => {
    const blockDevTools = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'U')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const detectDevTools = () => {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      
      if (widthThreshold || heightThreshold) {
        document.body.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1a1a1a;color:white;font-family:system-ui;flex-direction:column">
            <h1 style="font-size:3rem;margin-bottom:1rem">Gelistirici Araclari Engellendi</h1>
            <p style="font-size:1.2rem;color:#888">Bu uygulama gelistirici araclarinin kullanimini engellemektedir.</p>
            <p style="font-size:1rem;color:#666;margin-top:2rem">Lutfen sayfayi yenileyip tekrar deneyin.</p>
          </div>
        `;
      }
    };

    const checkInterval = setInterval(detectDevTools, 1000);

    document.addEventListener('keydown', blockDevTools, true);
    document.addEventListener('contextmenu', blockContextMenu);

    return () => {
      clearInterval(checkInterval);
      document.removeEventListener('keydown', blockDevTools, true);
      document.removeEventListener('contextmenu', blockContextMenu);
    };
  }, []);
}
