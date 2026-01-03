import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { apiRequest } from "./queryClient";
import { buildApiUrl } from "./apiConfig";
import { clearAuthTokens, persistAuthTokens } from "./authStorage";

export interface GoogleAuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  accessToken: string;
}

const isNative = Capacitor.isNativePlatform();

export async function signInWithGoogle(): Promise<GoogleAuthUser | null> {
  // Web: normal SPA redirect
  const redirectTo = isNative ? "cyclecare://auth/callback" : "/auth/callback";
  const targetUrl = `${buildApiUrl("/api/auth/google")}?redirectTo=${encodeURIComponent(redirectTo)}`;

  if (!isNative) {
    console.log("[GoogleAuth] Web OAuth redirect ->", targetUrl);
    window.location.href = targetUrl;
    return null;
  }

  console.log("[GoogleAuth] Native OAuth via Browser ->", targetUrl);
  // Native: open in Safari View/Custom Tabs; deep link will return to the app via appUrlOpen listener
  await Browser.open({ url: targetUrl, windowName: "google-login" });
  return null;
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
