import { createContext, useContext, useMemo, ReactNode, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

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
  logout: () => void;
}

const NativeUserContext = createContext<NativeAuthContextType | null>(null);

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
  if (!context) {
    throw new Error("useNativeAuth must be used within NativeAuthProvider");
  }
  return context;
};

interface NativeAuthProviderProps {
  children: ReactNode;
}

export function NativeAuthProvider({ children }: NativeAuthProviderProps) {
  const platform = useMemo(() => Capacitor.getPlatform(), []);
  const isNative = platform !== 'web';
  
  const [user, setUserState] = useState<NativeUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize native auth
    if (!isNative) {
      setIsInitialized(true);
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
        return;
      }
    } catch (error) {
      console.error('[NativeAuthProvider] Error loading user from localStorage:', error);
    }

    // No user found - show login screen (don't use mock user)
    console.log('[NativeAuthProvider] ✅ No user found - will show login page');
    setUserState(null);
    setIsInitialized(true);
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

  const logout = () => {
    // Clear all auth data (works for both web and native)
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
    });
    
    // Clear user state for all platforms
    setUserState(null);
    console.log('[NativeAuthProvider] ✅ Logged out successfully');
  };

  if (!isInitialized) {
    return (
      <NativeUserContext.Provider value={null}>
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
