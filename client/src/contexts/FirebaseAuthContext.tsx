import { createContext, useContext, useEffect, useState, useCallback } from "react";

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

  const checkSession = useCallback(async () => {
    try {
      // Check for JWT token first (Google Auth)
      const authToken = getAuthToken();
      
      // Also check for Firebase token stored separately
      const firebaseToken = localStorage.getItem("firebase_token");
      
      // Check for phone session
      const phoneSession = localStorage.getItem("phone_session");
      const phoneUserId = localStorage.getItem("phone_user_id");
      const phoneNumber = localStorage.getItem("phone_number");
      
      // Build headers with Authorization - prefer app JWT, then Firebase, then phone
      const headers = new Headers();
      if (authToken) {
        headers.set("Authorization", `Bearer ${authToken}`);
        console.log("[Auth] Using JWT token for session check");
      } else if (firebaseToken) {
        headers.set("Authorization", `Bearer ${firebaseToken}`);
        console.log("[Auth] Using Firebase token for session check");
      } else if (phoneSession) {
        headers.set("Authorization", `Bearer ${phoneSession}`);
        console.log("[Auth] Using phone session for session check");
      } else {
        console.log("[Auth] No token found for session check");
      }
      
      const response = await fetch("/api/auth/session", { headers });
      
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
            return;
          }
        } else {
          console.warn("[Auth] Session response was not JSON, skipping parse");
        }
      }
      
      // Fallback to localStorage phone session
      if (phoneSession && phoneUserId) {
        console.log("[Auth] Using local phone session:", phoneNumber);
        setUser({
          id: phoneUserId,
          email: null,
          firstName: null,
          lastName: null,
          phone: phoneNumber,
          isAdmin: false,
          source: "firebase_auth"
        });
        return;
      }
      
      console.log("[Auth] No active session");
      setUser(null);
    } catch (error) {
      console.error("[Auth] Error checking session:", error);
      
      // Try to use local phone session as fallback
      const phoneSession = localStorage.getItem("phone_session");
      const phoneUserId = localStorage.getItem("phone_user_id");
      const phoneNumber = localStorage.getItem("phone_number");
      
      if (phoneSession && phoneUserId) {
        console.log("[Auth] Using fallback phone session");
        setUser({
          id: phoneUserId,
          email: null,
          firstName: null,
          lastName: null,
          phone: phoneNumber,
          isAdmin: false,
          source: "firebase_auth"
        });
      } else {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
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
      await fetch("/api/logout", { method: "POST" });
      
      // Clear JWT token (Google Auth)
      clearAuthToken();
      
      // Clear phone session
      localStorage.removeItem("phone_session");
      localStorage.removeItem("phone_user_id");
      localStorage.removeItem("phone_number");
      
      // Clear all other storage
      localStorage.removeItem("onboarding_completed");
      
      // Reset user state
      setUser(null);
      
      // Redirect to login
      window.location.href = "/";
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      // Still redirect on error
      clearAuthToken();
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
    <FirebaseAuthContext.Provider value={{ user, isLoading, logout, getIdToken }}>
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
