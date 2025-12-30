import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase';
import { apiRequest } from './queryClient';
import { buildApiUrl } from './apiConfig';

export interface GoogleAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  accessToken: string;
}

const WEB_CLIENT_ID =
  '129179738500-h7dsfkh9jal9degc081su6m9veikm73l.apps.googleusercontent.com';

const isAndroidNative = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

let googleAuthInitPromise: Promise<void> | null = null;

async function ensureGoogleAuthInitialized() {
  if (!isAndroidNative()) return;
  if (!googleAuthInitPromise) {
    googleAuthInitPromise = GoogleAuth.initialize({
      clientId: WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
      grantOfflineAccess: true,
    });
  }

  try {
    await googleAuthInitPromise;
  } catch (error) {
    googleAuthInitPromise = null;
    throw error;
  }
}

async function exchangeFirebaseTokenForSession(firebaseIdToken: string) {
  const finalUrl = buildApiUrl('/api/auth/firebase');
  console.log('[AUTH] Calling API:', finalUrl);

  const response = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken: firebaseIdToken }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await response.text().catch(() => '');
    console.warn('[GoogleAuth] Session exchange returned non-JSON:', body?.slice(0, 200));
    throw new Error('Session exchange failed (non-JSON response)');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Session exchange failed');
  }

  const authToken = data?.authToken || data?.token;
  if (!authToken) {
    throw new Error('No auth token returned from backend');
  }

  return {
    authToken,
    user: data?.user,
  };
}

export async function signInWithGoogle(): Promise<GoogleAuthUser | null> {
  try {
    if (isAndroidNative()) {
      console.log('[GoogleAuth] Signing in via Google Auth plugin (Android)');

      await ensureGoogleAuthInitialized();
      const googleUser = await GoogleAuth.signIn();

      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) {
        throw new Error('No idToken returned from Google Sign-In');
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const firebaseIdToken = await result.user.getIdToken(true);

      const { authToken } = await exchangeFirebaseTokenForSession(firebaseIdToken);

      // Persist both the app auth token and Firebase token for compatibility
      localStorage.setItem('auth_token', authToken);
      localStorage.setItem('firebase_token', firebaseIdToken);
      window.dispatchEvent(new CustomEvent('auth-token-updated'));

      return {
        id: result.user.uid,
        email: result.user.email || '',
        name: result.user.displayName || '',
        image: result.user.photoURL || undefined,
        accessToken: authToken,
      };
    }

    if (Capacitor.isNativePlatform()) {
      console.log('[GoogleAuth] Native platform detected, redirecting to OAuth');
      
      // Use direct Google OAuth endpoint with native callback for non-Android
      const redirectUrl = encodeURIComponent('cyclecare://auth/callback');
      window.location.href = `/api/auth/google?redirectTo=/&nativeCallback=${redirectUrl}`;
      return null;
    }

    console.log('[GoogleAuth] Web platform detected, using Google OAuth');
    window.location.href = `/api/auth/google?redirectTo=/`;
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
    localStorage.removeItem('phone_session');
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
