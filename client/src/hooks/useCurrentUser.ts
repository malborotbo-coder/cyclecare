import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import { useAuth } from "./useAuth";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export function useCurrentUser() {
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
  const { user: webUser, ...authRest } = useAuth();
  const platform = Capacitor.getPlatform();
  const isNative = platform !== 'web';

  // Sync Replit Auth user to NativeAuthProvider on iOS
  useEffect(() => {
    if (isNative && webUser && !nativeUser?.id?.startsWith('mock')) {
      // Real Replit Auth user is logged in, save to native context
      const realUser = {
        id: (webUser as any)?.id || (webUser as any)?.sub || '',
        email: (webUser as any)?.email || '',
        firstName: (webUser as any)?.firstName || '',
        lastName: (webUser as any)?.lastName || '',
        profileImageUrl: (webUser as any)?.profileImageUrl || '',
        username: (webUser as any)?.firstName || (webUser as any)?.email || '',
        isAdmin: (webUser as any)?.isAdmin || false,
      };
      nativeAuth.setUser(realUser);
      console.log('[useCurrentUser] ✅ Synced Replit Auth user to native context:', realUser.email);
    }
  }, [webUser, isNative, nativeUser, nativeAuth]);
  
  // If there's a native user (either real or mock), use it
  if (nativeUser) {
    return {
      user: nativeUser,
      isLoading: false,
      isAuthenticated: true,
    };
  }
  
  return {
    user: webUser,
    ...authRest
  };
}
