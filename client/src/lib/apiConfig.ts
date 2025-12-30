import { Capacitor } from '@capacitor/core';

const platform = Capacitor.getPlatform();
const isNative = platform === 'android' || platform === 'ios';
const PROD_API_BASE =
  import.meta.env.VITE_PROD_API_BASE ||
  import.meta.env.VITE_API_BASE ||
  'https://cyclecaretec.com/api'; // Render production URL (WebView must hit remote backend)

export const getApiBaseUrl = () => {
  const returnedBaseUrl = isNative ? PROD_API_BASE : '/api';
  if (typeof console !== 'undefined') {
    console.log('[API BASE]', platform, returnedBaseUrl);
  }
  return returnedBaseUrl;
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
