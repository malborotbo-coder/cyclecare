import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { buildApiUrl } from "@/lib/apiConfig";
import { clearAuthTokens, syncAuthTokensFromPreferences } from "@/lib/authStorage";
import { getFirebaseIdToken, waitForFirebaseAuthReady } from "@/lib/firebaseAuth";

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
  serverAuthenticated: boolean;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
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
  const [serverAuthenticated, setServerAuthenticated] = useState(false);

  const checkSession = useCallback(async () => {
    setAuthReady(false);
    setIsLoading(true);
    setServerAuthenticated(false);
    try {
      // Ensure native-stored tokens are available in localStorage for API calls
      await syncAuthTokensFromPreferences();
      await waitForFirebaseAuthReady();
      const firebaseToken = await getFirebaseIdToken(false);

      // Build headers with Authorization - Firebase ID token only
      const headers = new Headers();
      const authMethod = firebaseToken ? "firebase" : "none";
      if (firebaseToken) {
        headers.set("Authorization", `Bearer ${firebaseToken}`);
        console.log("[Auth] Using Firebase token for session check");
      } else {
        console.log("[Auth] No token found for session check");
      }
      console.log("[Auth] Session check - tokens present:", {
        firebaseToken: !!firebaseToken,
        method: authMethod,
      });
      
      const response = await fetch(buildApiUrl("/api/auth/session"), { headers });
      
      let sessionResolved = false;

      if (!response.ok) {
        console.warn("[Auth] Session check returned non-200:", response.status);
        setServerAuthenticated(false);
      } else {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          const userData = data.user || data;
          if (userData && userData.id) {
            console.log("[Auth] Session found:", userData.email || userData.phone || userData.id, "isAdmin:", userData.isAdmin);
            setUser(userData);
            setServerAuthenticated(true);
            sessionResolved = true;
          }
        } else {
          const body = await response.text().catch(() => "");
          console.warn("[Auth] Session response was not JSON, treating as unauthenticated. Body snippet:", body.slice(0, 200));
          setServerAuthenticated(false);
        }
      }

      if (sessionResolved) {
        return;
      }

      // If we have a Firebase token but the session endpoint didn’t return, trust the token to keep user authenticated
      if (authMethod === "firebase") {
        console.warn("[Auth] Token present but session not resolved; treating as authenticated");
        setUser({
          id: firebaseToken || "firebase_user",
          email: null,
          firstName: null,
          lastName: null,
          phone: null,
          isAdmin: false,
          source: "firebase_auth",
        });
        setServerAuthenticated(false);
        return;
      }

      console.log("[Auth] No active session (method:", authMethod, ")");
      setUser(null);
      setServerAuthenticated(false);
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      setServerAuthenticated(false);
      
      setUser(null);
    } finally {
      setIsLoading(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    checkSession();
    
    // Listen for token updates from AuthCallback
    const handleTokenUpdate = () => {
      console.log("[Auth] Token updated, rechecking session");
      checkSession();
    };
    
    window.addEventListener("auth-token-updated", handleTokenUpdate);
    return () => window.removeEventListener("auth-token-updated", handleTokenUpdate);
  }, [checkSession]);

  const logout = async () => {
    try {
      // Call logout endpoint
      await fetch(buildApiUrl("/api/logout"), { method: "POST" });

      // Clear tokens (native + web) and local state
      await clearAuthTokens();
      localStorage.removeItem("onboarding_completed");
      setUser(null);
      window.location.href = "/";
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      // Still redirect on error
      await clearAuthTokens();
      window.location.href = "/";
    }
  };

  const getIdToken = async () => {
    if (!user) return null;
    return getFirebaseIdToken(false);
  };

  return (
    <FirebaseAuthContext.Provider value={{ user, isLoading, authReady, serverAuthenticated, logout, getIdToken }}>
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
