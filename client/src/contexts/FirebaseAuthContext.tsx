import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { buildApiUrl } from "@/lib/apiConfig";
import { clearAuthTokens, syncAuthTokensFromPreferences } from "@/lib/authStorage";
import { unregisterPushToken } from "@/lib/pushManager";
import { AUTH_INVALIDATED_EVENT, invalidateAuthState } from "@/lib/authSession";

// Token storage key
const AUTH_TOKEN_KEY = "auth_token";

// Simple user type for session-based auth
interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  profileImageUrl?: string | null;
  isAdmin: boolean;
  source: "replit_auth" | "firebase_auth" | "google_auth";
}

type AuthUser = SessionUser | null;

interface FirebaseAuthContextType {
  user: AuthUser;
  isLoading: boolean;
  authReady: boolean;
  isGuest: boolean;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextType | undefined>(undefined);

// Get auth token from localStorage
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// Set auth token in localStorage
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

// Clear auth token from localStorage
export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const GUEST_MODE_KEY = "guest_mode";
  const GUEST_TOKEN_KEY = "guest_token";

  const readGuestFlag = () =>
    typeof localStorage !== "undefined" && localStorage.getItem(GUEST_MODE_KEY) === "true";

  const enterGuestMode = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(GUEST_MODE_KEY, "true");
      if (!localStorage.getItem(GUEST_TOKEN_KEY)) {
        const token =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        localStorage.setItem(GUEST_TOKEN_KEY, token);
      }
    }
    setUser(null);
    setIsGuest(true);
  }, []);

  const exitGuestMode = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(GUEST_MODE_KEY);
      localStorage.removeItem(GUEST_TOKEN_KEY);
    }
    setIsGuest(false);
  }, []);

  const applyLoggedOutState = useCallback((preserveGuest = false) => {
    setUser(null);
    setIsLoading(false);
    setAuthReady(true);
    if (preserveGuest) {
      setIsGuest(readGuestFlag());
    } else {
      exitGuestMode();
      setIsGuest(false);
    }
  }, [exitGuestMode]);

  const checkSession = useCallback(async () => {
    setAuthReady(false);
    setIsLoading(true);
    try {
      // Ensure native-stored tokens are available in localStorage for API calls
      await syncAuthTokensFromPreferences();
      // Check for JWT token first (Google Auth)
      const authToken = getAuthToken();
      
      // Also check for Firebase token stored separately
      const firebaseToken = localStorage.getItem("firebase_token");
      
      // Check for phone session
      const phoneSession = localStorage.getItem("phone_session");
      
      // Build headers with Authorization - prefer app JWT, then Firebase, then phone
      const headers = new Headers();
      const authMethod = authToken
        ? "jwt"
        : firebaseToken
        ? "firebase"
        : phoneSession
        ? "phone"
        : "none";
      if (authToken) {
        headers.set("Authorization", `Bearer ${authToken}`);
      } else if (firebaseToken) {
        headers.set("Authorization", `Bearer ${firebaseToken}`);
      } else if (phoneSession) {
        headers.set("Authorization", `Bearer ${phoneSession}`);
      }
      
      const response = await fetch(buildApiUrl("/api/auth/session"), { headers });
      
      let sessionResolved = false;

      if (!response.ok) {
        console.warn("[Auth] Session check returned non-200:", response.status);
      } else {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          const isAuthenticated = data?.authenticated === true || Boolean(data?.user?.id || data?.id);
          const userData = data.user || data;
          if (isAuthenticated && userData && userData.id) {
            console.log("[Auth] Session found:", userData.email || userData.phone || userData.id, "isAdmin:", userData.isAdmin);
            setUser(userData);
            exitGuestMode();
            sessionResolved = true;
          }
        } else {
          const body = await response.text().catch(() => "");
          console.warn("[Auth] Session response was not JSON, treating as unauthenticated. Body snippet:", body.slice(0, 200));
        }
      }

      if (sessionResolved) {
        return;
      }

      if (authMethod !== "none") {
        await invalidateAuthState({
          reason: "unauthenticated",
          status: 401,
          source: "session_check",
          url: "/api/auth/session",
        });
      } else {
        await clearAuthTokens({ emitEvent: false }).catch(() => undefined);
      }

      console.warn("[Auth] No active session", { method: authMethod });
      applyLoggedOutState(true);
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      await clearAuthTokens({ emitEvent: false }).catch(() => undefined);
      applyLoggedOutState(true);
    } finally {
      setIsLoading(false);
      setAuthReady(true);
    }
  }, [applyLoggedOutState, exitGuestMode]);

  useEffect(() => {
    checkSession();
    
    // Listen for token updates from AuthCallback
    const handleTokenUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (detail?.action === "cleared") {
        return;
      }
      checkSession();
    };
    
    window.addEventListener("auth-token-updated", handleTokenUpdate);
    return () => window.removeEventListener("auth-token-updated", handleTokenUpdate);
  }, [checkSession]);

  useEffect(() => {
    const handleAuthInvalidated = () => {
      applyLoggedOutState(false);
    };
    window.addEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
    return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, handleAuthInvalidated);
  }, [applyLoggedOutState]);

  const logout = async () => {
    try {
      // Call logout endpoint
      await fetch(buildApiUrl("/api/logout"), { method: "POST" });

      // Disable push tokens for this device before clearing auth
      await unregisterPushToken(user?.id);

      // Clear tokens (native + web) and local state
      await clearAuthTokens();
      localStorage.removeItem("onboarding_completed");
      exitGuestMode();
      setUser(null);
      window.location.href = "/";
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      // Still redirect on error
      await unregisterPushToken(user?.id);
      await clearAuthTokens();
      exitGuestMode();
      window.location.href = "/";
    }
  };

  const getIdToken = async () => {
    if (!user) return null;

    // For JWT auth (Google), return the JWT token
    const authToken = getAuthToken();
    if (authToken) {
      return authToken;
    }

    // For phone auth, return the session token
    if (localStorage.getItem("phone_session")) {
      return localStorage.getItem("phone_session");
    }
    
    // For Replit auth, the session is cookie-based
    return "session";
  };

  return (
    <FirebaseAuthContext.Provider value={{ user, isLoading, authReady, isGuest, logout, getIdToken, enterGuestMode, exitGuestMode }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const context = useContext(FirebaseAuthContext);
  if (!context) {
    throw new Error("useFirebaseAuth must be used within FirebaseAuthProvider");
  }
  return context;
}
