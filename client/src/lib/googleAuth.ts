import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';
import { buildApiUrl } from './apiConfig';
import { clearAuthTokens } from './authStorage';

export interface GoogleAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  accessToken: string;
}

export async function signInWithGoogle(): Promise<GoogleAuthUser | null> {
  try {
    // Single web-based flow for Web + Android/iOS WebView
    console.log('[GoogleAuth] Redirecting to OAuth (in-app WebView)');
    const redirectTo = encodeURIComponent('/');
    window.location.href = `/api/auth/google?redirectTo=${redirectTo}`;
    return null;
  } catch (error: any) {
    console.error('[GoogleAuth] Sign-in error:', error);
    throw new Error(error.message || 'Google Sign-In failed');
  }
}

export async function signInWithApple(): Promise<GoogleAuthUser | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      console.log('[AppleAuth] Signing in via Apple');
      
      // Note: Apple Sign-In needs a separate plugin @capacitor-community/apple-sign-in
      // For now, redirect to OAuth endpoint
      window.location.href = `/api/login?provider=apple&redirectTo=/`;
      return null;
    } else {
      window.location.href = `/api/login?provider=apple&redirectTo=/`;
      return null;
    }
  } catch (error: any) {
    console.error('[AppleAuth] Sign-in error:', error);
    throw new Error(error.message || 'Apple Sign-In failed');
  }
}

export async function signOut(): Promise<void> {
  try {
    localStorage.removeItem('google_auth_user');
    await clearAuthTokens();
    await apiRequest('POST', '/api/logout', {});
  } catch (error) {
    console.error('[GoogleAuth] Sign-out error:', error);
  }
}

export function getStoredGoogleUser(): GoogleAuthUser | null {
  const stored = localStorage.getItem('google_auth_user');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('[GoogleAuth] Failed to parse stored user:', e);
      localStorage.removeItem('google_auth_user');
      return null;
    }
  }
  return null;
}
