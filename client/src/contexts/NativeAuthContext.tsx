import { createContext, useContext, useMemo, ReactNode, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { clearAuthTokens } from "@/lib/authStorage";
import { auth as firebaseAuth } from "@/lib/firebase";

interface NativeUser {
  id: string;
  username?: string;
  email: string;
  isAdmin: boolean;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  phone?: string;
}

interface NativeAuthContextType {
  user: NativeUser | null;
  setUser: (user: NativeUser | null) => void;
  updateUser: (user: Partial<NativeUser>) => void;
  logout: () => Promise<void>;
}

const NativeUserContext = createContext<NativeAuthContextType | null>(null);

const noopAsync = async () => {};
const noopUpdate = () => {};
const FALLBACK_NATIVE_AUTH: NativeAuthContextType = {
  user: null,
  setUser: noopUpdate,
  updateUser: noopUpdate,
  logout: noopAsync,
};

export const useNativeUser = () => {
  const context = useContext(NativeUserContext);
  const platform = Capacitor.getPlatform();
  const isNative = platform !== 'web';
  
  // Only return native user if actually on native platform
  if (!isNative) return null;
  
  return context?.user || null;
};

export const useNativeAuth = () => {
  const context = useContext(NativeUserContext);
  return context || FALLBACK_NATIVE_AUTH;
};

interface NativeAuthProviderProps {
  children: ReactNode;
}

export function NativeAuthProvider({ children }: NativeAuthProviderProps) {
  const platform = useMemo(() => Capacitor.getPlatform(), []);
  const isNative = platform !== 'web';
  
  const [user, setUserState] = useState<NativeUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const AUTH_KEYS_TO_CLEAR = [
    "auth_token",
    "phone_session",
    "phone_user_id",
    "phone_number",
    "firebase_token",
    "guest_mode",
    "guest_token",
    "google_auth_user",
    "nativeAuthUser",
    "push_backend_registered",
    "push_device_role",
    "push_pending_token",
    "push_pending_token_type",
  ] as const;

  useEffect(() => {
    console.info('[Bootstrap] Native auth init start', { isNative });
    // Initialize native auth
    if (!isNative) {
      setIsInitialized(true);
      console.info('[Bootstrap] Native auth init done', { mode: 'web' });
      return;
    }

    // Check if user is logging out (flag set by logout function)
    const isLogoutFlag = sessionStorage.getItem('nativeAuthLogout') === 'true';
    if (isLogoutFlag) {
      console.log('[NativeAuthProvider] 🔄 Logging out - showing login page');
      sessionStorage.removeItem('nativeAuthLogout');
      sessionStorage.setItem('wantRealAuth', 'true');
      localStorage.removeItem('nativeAuthUser');
      setUserState(null);
      setIsInitialized(true);
      console.info('[Bootstrap] Native auth init done', { mode: 'native', source: 'logout-flag' });
      return;
    }

    // Check if user is stored in localStorage (real user logged in)
    try {
      const storedUser = localStorage.getItem('nativeAuthUser');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        console.log('[NativeAuthProvider] ✅ User logged in from localStorage:', parsedUser.email);
        setUserState(parsedUser);
        setIsInitialized(true);
        console.info('[Bootstrap] Native auth init done', { mode: 'native', source: 'stored-user' });
        return;
      }
    } catch (error) {
      console.error('[NativeAuthProvider] Error loading user from localStorage:', error);
    }

    // No user found - show login screen (don't use mock user)
    console.log('[NativeAuthProvider] ✅ No user found - will show login page');
    setUserState(null);
    setIsInitialized(true);
    console.info('[Bootstrap] Native auth init done', { mode: 'native', source: 'no-user' });
  }, [isNative]);

  const setUser = (newUser: NativeUser | null) => {
    if (!isNative) return;
    
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem('nativeAuthUser', JSON.stringify(newUser));
      console.log('[NativeAuthProvider] ✅ User saved to localStorage:', newUser.email);
    } else {
      localStorage.removeItem('nativeAuthUser');
      console.log('[NativeAuthProvider] ✅ User cleared from localStorage');
    }
  };

  const updateUser = (updates: Partial<NativeUser>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    setUserState(updatedUser);
    localStorage.setItem('nativeAuthUser', JSON.stringify(updatedUser));
    console.log('[NativeAuthProvider] ✅ User updated:', updatedUser);
  };

  const logout = async () => {
    // Clear auth state only (do not wipe app/user preferences like remember-me fields).
    try {
      sessionStorage.setItem('nativeAuthLogout', 'true');
    } catch {
      // Ignore session storage failures.
    }
    if (firebaseAuth.currentUser) {
      await firebaseAuth.signOut().catch(() => undefined);
    }
    await clearAuthTokens();

    AUTH_KEYS_TO_CLEAR.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore storage errors
      }
      try {
        if (String(key) !== "nativeAuthLogout") {
          sessionStorage.removeItem(key);
        }
      } catch {
        // Ignore storage errors
      }
    });

    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
    });
    
    // Clear user state for all platforms
    setUserState(null);
    console.log('[NativeAuthProvider] ✅ Logged out successfully');
  };

  if (!isInitialized) {
    return (
      <NativeUserContext.Provider value={FALLBACK_NATIVE_AUTH}>
        {children}
      </NativeUserContext.Provider>
    );
  }

  return (
    <NativeUserContext.Provider value={{ user, setUser, updateUser, logout }}>
      {children}
    </NativeUserContext.Provider>
  );
}
