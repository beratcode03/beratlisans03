const DEBUG = process.env.DEBUG_MONITORING === 'true';

class SilentLogger {
  debug(...args) {
    if (DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  info(...args) {
    if (DEBUG) {
      console.log('[INFO]', ...args);
    }
  }

  warn(...args) {
    if (DEBUG) {
      console.warn('[WARN]', ...args);
    }
  }

  error(...args) {
    if (DEBUG) {
      console.error('[ERROR]', ...args);
    }
  }

  log(...args) {
    if (DEBUG) {
      console.log(...args);
    }
  }
}

module.exports = new SilentLogger();
