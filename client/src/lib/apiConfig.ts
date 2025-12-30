import { Capacitor } from '@capacitor/core';

export const getApiBaseUrl = () => {
  const returnedBaseUrl =
    Capacitor.getPlatform() === 'android'
      ? 'http://10.0.2.2:5000/api' // Android emulator maps host loopback to 10.0.2.2
      : '/api';

  console.log('[API BASE]', Capacitor.getPlatform(), returnedBaseUrl);
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
