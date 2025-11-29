const missingEnvVars: string[] = [];
const warningEnvVars: string[] = [];

export function validateEnvironmentVariables() {
  if (!process.env.OPENWEATHER_API_KEY) {
    warningEnvVars.push('OPENWEATHER_API_KEY');
  }

  if (!process.env.EMAIL_USER) {
    warningEnvVars.push('EMAIL_USER');
  }

  if (!process.env.EMAIL_PASS) {
    warningEnvVars.push('EMAIL_PASS');
  }
  
  if (!process.env.EMAIL_FROM) {
    warningEnvVars.push('EMAIL_FROM');
  }

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing critical environment variables: ${missingEnvVars.join(', ')}`);
  }
}

export function safeGetEnv(key: string, fallback: string = ''): string {
  const value = process.env[key];
  return value || fallback;
}

export function isEnvConfigured(key: string): boolean {
  return !warningEnvVars.includes(key) && !!process.env[key];
}

export function getMissingOptionalEnvVars(): string[] {
  return [...warningEnvVars];
}
