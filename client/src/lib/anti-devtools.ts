export class AntiDevTools {
  private static devToolsOpen = false;
  private static checkInterval: NodeJS.Timeout | null = null;
  private static decoyVariables: Record<string, any> = {};
  private static isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  static initialize() {
    if (this.isDev) {
      return;
    }

    this.setupDevToolsDetection();
    this.setupContextMenuBlock();
    this.setupKeyboardShortcutBlock();
    this.setupConsoleOverride();
    this.setupDecoyVariables();
    this.setupNetworkMonitoring();
  }

  private static setupDevToolsDetection() {
    const threshold = 160;
    
    const detectDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if (
        navigator.userAgent.toLowerCase().indexOf('chrome') !== -1 &&
        (window as any).chrome &&
        (widthThreshold || heightThreshold)
      ) {
        if (!this.devToolsOpen) {
          this.devToolsOpen = true;
          this.handleDevToolsOpened();
        }
      } else {
        this.devToolsOpen = false;
      }
    };

    this.checkInterval = setInterval(detectDevTools, 1000);
    detectDevTools();
  }

  private static handleDevToolsOpened() {
    if (!this.isDev) {
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    }
  }

  private static setupContextMenuBlock() {
    if (this.isDev) return;

    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showWarningToast();
      return false;
    }, false);
  }

  private static setupKeyboardShortcutBlock() {
    if (this.isDev) return;

    document.addEventListener('keydown', (e) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.shiftKey && e.key === 'C') ||
        (e.ctrlKey && e.key === 'U')
      ) {
        e.preventDefault();
        this.showWarningToast();
        return false;
      }
    });
  }

  private static setupConsoleOverride() {
    if (this.isDev) return;

    const noop = () => {};
    const originalConsole = { ...console };

    (window as any)._console = originalConsole;

    Object.keys(console).forEach((key) => {
      if (typeof (console as any)[key] === 'function') {
        (console as any)[key] = noop;
      }
    });

    (window as any).__allowConsole = (password: string) => {
      if (password === '__dev_console_access__') {
        Object.assign(console, originalConsole);
        return 'Console enabled';
      }
      return 'Access denied';
    };
  }

  private static setupDecoyVariables() {
    this.decoyVariables = {
      isAdmin: false,
      hasAccess: false,
      isPremium: false,
      apiKey: 'fake-api-key-12345',
      secretToken: 'decoy-token-abcdef',
      databasePassword: 'not-real-password',
      encryptionKey: 'fake-encryption-key',
      licenseKey: 'DECOY-XXXX-YYYY-ZZZZ',
    };

    (window as any).__config = this.decoyVariables;
  }

  private static setupNetworkMonitoring() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);
        return response;
      } catch (error) {
        throw error;
      }
    };
  }

  private static showWarningToast() {
    const existingToast = document.querySelector('#anti-devtools-toast');
    if (existingToast) return;

    const toast = document.createElement('div');
    toast.id = 'anti-devtools-toast';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;

    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>Bu islem devre disi</span>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  static disable() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const antiDevTools = AntiDevTools;
