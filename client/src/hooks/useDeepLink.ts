import { useEffect } from 'react';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

interface DeepLinkHandler {
  onAuthCallback?: (params: URLSearchParams) => void;
}

export function useDeepLink({ onAuthCallback }: DeepLinkHandler) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleAppUrlOpen = (event: URLOpenListenerEvent) => {
      console.log('[DeepLink] URL opened:', event.url);
      
      try {
        const url = new URL(event.url);
        const path = url.pathname || url.host;
        
        if (path.includes('auth') || path.includes('callback') || path.includes('login')) {
          const params = new URLSearchParams(url.search);
          onAuthCallback?.(params);
        }
      } catch (error) {
        console.error('[DeepLink] Error parsing URL:', error);
      }
    };

    App.addListener('appUrlOpen', handleAppUrlOpen);

    return () => {
      App.removeAllListeners();
    };
  }, [onAuthCallback]);
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}
