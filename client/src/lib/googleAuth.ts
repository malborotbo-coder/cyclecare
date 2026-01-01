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
  // Always come back to the root after callback to avoid loops on /auth/callback
  const redirectTo = "/";

  // Web: keep existing redirect-based OAuth inside the WebView/browser
  if (!isNative) {
    window.location.href = `/api/auth/google?redirectTo=${encodeURIComponent(redirectTo)}`;
    return null;
  }

  // Native: open the pure web flow in Capacitor Browser and capture the callback URL
  let handled = false;
  const targetUrl = `${buildApiUrl("/api/auth/google")}?redirectTo=${encodeURIComponent(redirectTo)}`;

  const pageLoaded = await Browser.addListener("browserPageLoaded", async ({ url }) => {
    if (handled) return;
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (parsed.pathname.includes("/auth/callback")) {
        const token = parsed.searchParams.get("token");
        if (token) {
          handled = true;
          await persistAuthTokens({ authToken: token });
          await Browser.close();
          pageLoaded.remove();
          finished.remove();
          window.location.href = "/";
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  const finished = await Browser.addListener("browserFinished", () => {
    pageLoaded.remove();
    finished.remove();
  });

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
