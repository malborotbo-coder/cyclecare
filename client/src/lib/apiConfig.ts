import { Capacitor } from '@capacitor/core';

const DEFAULT_PROD_API_BASE = 'https://cyclecaretec.com/api';
const platform = Capacitor.getPlatform();
const isNative = platform === 'android' || platform === 'ios';
const rawProdBase =
  import.meta.env.VITE_PROD_API_BASE ||
  import.meta.env.VITE_API_BASE ||
  DEFAULT_PROD_API_BASE;

const debugApi =
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || localStorage.getItem('debug_api') === 'true');

function normalizeBase(base: string | undefined) {
  if (!base) return DEFAULT_PROD_API_BASE;
  const trimmed = base.trim();
  if (!trimmed) return DEFAULT_PROD_API_BASE;
  return trimmed.replace(/\/+$/, '');
}

export const getApiBaseUrl = () => {
  let resolvedBase = normalizeBase(rawProdBase);

  // Native builds must hit the deployed API, not capacitor://localhost or localhost
  if (
    isNative &&
    (!resolvedBase.startsWith('http') ||
      resolvedBase.includes('localhost') ||
      resolvedBase.includes('127.0.0.1'))
  ) {
    resolvedBase = DEFAULT_PROD_API_BASE;
  }

  if (debugApi) {
    console.log('[API BASE]', {
      platform,
      rawProdBase,
      resolvedBase,
      origin: typeof window !== 'undefined' ? window.location.origin : 'ssr',
    });
  }

  return isNative ? resolvedBase : '/api';
};

export const buildApiUrl = (path: string) => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/api')) {
    return `${getApiBaseUrl()}${path.replace(/^\/api/, '')}`;
  }
  return path;
};

export const resolveApiUrl = (url: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (url.startsWith('/api/')) {
    return `${getApiBaseUrl()}${url.replace(/^\/api/, '')}`;
  }
  if (origin && url.startsWith(`${origin}/api/`)) {
    return `${getApiBaseUrl()}${url.slice(origin.length + 4)}`;
  }
  return url;
};
