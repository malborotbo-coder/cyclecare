import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { buildApiUrl } from "@/lib/apiConfig";
import { clearAuthTokens, syncAuthTokensFromPreferences } from "@/lib/authStorage";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";

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
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
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

  const checkSession = useCallback(async () => {
    setAuthReady(false);
    setIsLoading(true);
    try {
      // Ensure native-stored tokens are available in localStorage for API calls
      await syncAuthTokensFromPreferences();
      console.log("[Auth] Session check - firebase user:", !!auth.currentUser);

      const response = await fetchWithFirebaseAuth(buildApiUrl("/api/auth/session"), {
        cache: "no-store",
      });
      
      let sessionResolved = false;

      if (!response.ok) {
        console.warn("[Auth] Session check returned non-200:", response.status);
      } else {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          const userData = data.user || data;
          if (userData && userData.id) {
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

      console.log("[Auth] No active session");
      setUser(null);
      setIsGuest(readGuestFlag());
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      setUser(null);
      setIsGuest(readGuestFlag());
    } finally {
      setIsLoading(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setFirebaseReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseReady) return;
    checkSession();
    
    // Listen for token updates from AuthCallback
    const handleTokenUpdate = () => {
      console.log("[Auth] Token updated, rechecking session");
      checkSession();
    };
    
    window.addEventListener("auth-token-updated", handleTokenUpdate);
    return () => window.removeEventListener("auth-token-updated", handleTokenUpdate);
  }, [checkSession, firebaseUser, firebaseReady]);

  const logout = async () => {
    try {
      // Call logout endpoint
      await fetch(buildApiUrl("/api/logout"), { method: "POST" });

      // Clear tokens (native + web) and local state
      await signOut(auth).catch((error) => {
        console.error("[Auth] Firebase signOut failed:", error);
      });
      await clearAuthTokens();
      localStorage.removeItem("onboarding_completed");
      exitGuestMode();
      setUser(null);
      window.location.href = "/";
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      // Still redirect on error
      await signOut(auth).catch((signOutError) => {
        console.error("[Auth] Firebase signOut failed:", signOutError);
      });
      await clearAuthTokens();
      exitGuestMode();
      window.location.href = "/";
    }
  };

  const getIdToken = async () => {
    if (!user) return null;
    
    // For Firebase auth, return the current ID token
    if (auth.currentUser) {
      try {
        return await auth.currentUser.getIdToken(true);
      } catch (error) {
        console.error("[Auth] Failed to get Firebase ID token from context:", error);
      }
    }

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
