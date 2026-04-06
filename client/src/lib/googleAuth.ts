import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
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
  token?: string;
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
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Apple Sign-In متاح عبر التطبيق فقط");
    }

    const { response } = await SignInWithApple.authorize({
      scopes: ["FULL_NAME", "EMAIL"] as any,
    } as any);

    const identityToken = (response as any)?.identityToken;
    if (!identityToken) {
      throw new Error("تعذّر الحصول على رمز التحقق من أبل");
    }
    console.log("[AppleAuth] Native response", {
      hasIdentityToken: Boolean(identityToken),
      email: (response as any)?.email || null,
      user: (response as any)?.user || null,
    });

    const fullName = {
      firstName: (response as any)?.givenName || (response as any)?.fullName?.givenName || undefined,
      lastName: (response as any)?.familyName || (response as any)?.fullName?.familyName || undefined,
    };

    const result = await apiRequest("/api/auth/apple-native", "POST", {
      identityToken,
      email: (response as any)?.email || undefined,
      fullName,
    });

    if (result?.token) {
      await persistAuthTokens({ authToken: result.token, phoneSession: result.token });
      return {
        id: result.user?.id || "",
        email: result.user?.email || "",
        name: result.user?.name || "",
        accessToken: result.token,
        token: result.token,
      };
    }

    throw new Error("Apple Sign-In failed");
  } catch (error: any) {
    console.error("[AppleAuth] Sign-in error:", {
      message: error?.message,
      code: error?.code,
      details: error,
    });
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
