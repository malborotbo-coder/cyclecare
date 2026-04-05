import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { buildApiUrl } from "@/lib/apiConfig";
import { clearAuthTokens, persistAuthTokens, syncAuthTokensFromPreferences } from "@/lib/authStorage";
import { unregisterPushToken } from "@/lib/pushManager";
import { AUTH_INVALIDATED_EVENT, invalidateAuthState } from "@/lib/authSession";
import { auth as firebaseAuth } from "@/lib/firebase";

// Token storage key
const AUTH_TOKEN_KEY = "auth_token";
const PHONE_SESSION_KEY = "phone_session";

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
  const safeGet = (storage: Storage | undefined, key: string) => {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  if (typeof sessionStorage !== "undefined") {
    const sessionToken = safeGet(sessionStorage, AUTH_TOKEN_KEY);
    if (sessionToken) return sessionToken;
  }
  return typeof localStorage !== "undefined" ? safeGet(localStorage, AUTH_TOKEN_KEY) : null;
}

// Set auth token in localStorage
export function setAuthToken(token: string): void {
  const safeSet = (storage: Storage | undefined, key: string, value: string) => {
    if (!storage) return;
    try {
      storage.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  };
  if (typeof sessionStorage !== "undefined") {
    safeSet(sessionStorage, AUTH_TOKEN_KEY, token);
  }
  if (typeof localStorage !== "undefined") {
    safeSet(localStorage, AUTH_TOKEN_KEY, token);
  }
}

// Clear auth token from localStorage
export function clearAuthToken(): void {
  const safeRemove = (storage: Storage | undefined, key: string) => {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  };
  if (typeof sessionStorage !== "undefined") {
    safeRemove(sessionStorage, AUTH_TOKEN_KEY);
  }
  if (typeof localStorage !== "undefined") {
    safeRemove(localStorage, AUTH_TOKEN_KEY);
  }
}

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const sessionCheckIdRef = useRef(0);
  const bootstrapDebugLoggedRef = useRef(false);
  const debugAuth =
    typeof window !== "undefined" &&
    (import.meta.env.DEV || localStorage.getItem("debug_auth") === "true");
  const GUEST_MODE_KEY = "guest_mode";
  const GUEST_TOKEN_KEY = "guest_token";

  const readGuestFlag = () =>
    typeof localStorage !== "undefined" &&
    (() => {
      try {
        return localStorage.getItem(GUEST_MODE_KEY) === "true";
      } catch {
        return false;
      }
    })();
  const readStoredToken = useCallback((key: string) => {
    if (typeof sessionStorage !== "undefined") {
      let sessionValue: string | null = null;
      try {
        sessionValue = sessionStorage.getItem(key);
      } catch {
        sessionValue = null;
      }
      if (sessionValue) return sessionValue;
    }
    if (typeof localStorage !== "undefined") {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const enterGuestMode = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(GUEST_MODE_KEY, "true");
        if (!localStorage.getItem(GUEST_TOKEN_KEY)) {
          const token =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          localStorage.setItem(GUEST_TOKEN_KEY, token);
        }
      } catch {
        // Ignore storage errors in guest mode
      }
    }
    setUser(null);
    setIsGuest(true);
  }, []);

  const exitGuestMode = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(GUEST_MODE_KEY);
        localStorage.removeItem(GUEST_TOKEN_KEY);
      } catch {
        // Ignore storage errors in guest mode
      }
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

  const checkSession = useCallback(async (source: "startup" | "token_update" | "manual" = "manual") => {
    const checkId = ++sessionCheckIdRef.current;
    const isLatestCheck = () => sessionCheckIdRef.current === checkId;

    console.info("[Bootstrap] Auth session check start", { source, checkId });
    setAuthReady(false);
    setIsLoading(true);
    try {
      // Ensure native-stored tokens are available in localStorage for API calls
      await syncAuthTokensFromPreferences();
      if (!isLatestCheck()) return;
      // Check for JWT token first (Google Auth)
      const authToken = getAuthToken();
      
      // Also check for Firebase token stored separately
      const firebaseToken = readStoredToken("firebase_token");
      
      // Check for phone session
      const phoneSession = readStoredToken("phone_session");

      if (!bootstrapDebugLoggedRef.current) {
        bootstrapDebugLoggedRef.current = true;
        console.info("[Auth][CycleDebug] Bootstrap token snapshot", {
          source,
          checkId,
          hasAuthToken: Boolean(authToken),
          hasFirebaseToken: Boolean(firebaseToken),
          hasPhoneSession: Boolean(phoneSession),
        });
      }
      
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
      if (!isLatestCheck()) return;
      
      let sessionResolved = false;

      if (!response.ok) {
        console.warn("[Auth] Session check returned non-200:", response.status);
      } else {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (!isLatestCheck()) return;
          const isAuthenticated = data?.authenticated === true || Boolean(data?.user?.id || data?.id);
          const userData = data.user || data;
          if (isAuthenticated && userData && userData.id) {
            const responseAuthToken =
              typeof data?.authToken === "string" && data.authToken.trim().length > 0
                ? data.authToken.trim()
                : null;
            if (responseAuthToken && !readStoredToken("auth_token")) {
              await persistAuthTokens({ authToken: responseAuthToken });
            }
            console.info("[Bootstrap] Auth session check resolved", { authenticated: true, source, checkId });
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
        // Only clear if there are still no tokens at resolution time.
        if (!readStoredToken("auth_token") && !readStoredToken("firebase_token") && !readStoredToken("phone_session")) {
          await clearAuthTokens({ emitEvent: false }).catch(() => undefined);
        }
      }

      if (!isLatestCheck()) return;
      if (authMethod !== "none" || debugAuth) {
        console.warn("[Auth] No active session", { method: authMethod });
      }
      applyLoggedOutState(true);
    } catch (error) {
      if (!isLatestCheck()) return;
      console.error("[Auth] Error checking session:", error);
      await clearAuthTokens({ emitEvent: false }).catch(() => undefined);
      applyLoggedOutState(true);
    } finally {
      if (!isLatestCheck()) return;
      setIsLoading(false);
      setAuthReady(true);
      console.info("[Bootstrap] Auth session check end", { source, checkId });
    }
  }, [applyLoggedOutState, exitGuestMode, debugAuth, readStoredToken]);

  useEffect(() => {
    checkSession("startup");
    
    // Listen for token updates from AuthCallback
    const handleTokenUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (detail?.action === "cleared") {
        return;
      }
      checkSession("token_update");
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

      // Ensure stale Firebase currentUser does not override restored app JWT flows.
      if (firebaseAuth.currentUser) {
        await firebaseAuth.signOut().catch(() => undefined);
      }

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
      if (firebaseAuth.currentUser) {
        await firebaseAuth.signOut().catch(() => undefined);
      }
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
    const phoneSession = readStoredToken(PHONE_SESSION_KEY);
    if (phoneSession) {
      return phoneSession;
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
