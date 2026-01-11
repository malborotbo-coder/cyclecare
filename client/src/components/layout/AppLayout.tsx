import AppHeader from "./AppHeader";
import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useNativeAuth } from "@/contexts/NativeAuthContext";
import { queryClient } from "@/lib/queryClient";
import { clearAuthTokens } from "@/lib/authStorage";
import { buildApiUrl } from "@/lib/apiConfig";
import SafeAreaLayout from "./SafeAreaLayout";
import GlobalBackground from "./GlobalBackground";
import { loadMockOrders } from "@/lib/mockOrders";

interface AppLayoutProps {
  children: React.ReactNode;
  transparentHeader?: boolean;
}

export default function AppLayout({ children, transparentHeader = false }: AppLayoutProps) {
  const isNative = Capacitor.isNativePlatform();
  const nativeAuth = useNativeAuth();
  const [location] = useLocation();

  useEffect(() => {
    if (location.startsWith("/admin")) return;
    loadMockOrders();
  }, [location]);

  const handleLogout = async () => {
    console.log('[Logout] ===== LOGOUT STARTED =====');
    
    if (isNative) {
      console.log('[Logout] iOS - clearing native auth state...');
      await nativeAuth.logout();
      await clearAuthTokens();
      console.log('[Logout] iOS - reloading app');
      window.location.reload();
      return;
    }
    
    console.log('[Logout] Step 1: Calling logout API...');
    try {
      await fetch(buildApiUrl("/api/logout"), { 
        method: "POST", 
        credentials: "include",
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.error('[Logout] API call failed:', e);
    }
    
    console.log('[Logout] Step 2: Clearing all local data...');
    queryClient.clear();
    queryClient.removeQueries();
    await nativeAuth.logout();
    await clearAuthTokens();
    sessionStorage.clear();
    localStorage.clear();
    
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
    });
    
    console.log('[Logout] Step 3: Unregistering service workers...');
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    
    console.log('[Logout] Step 4: Clearing caches...');
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log('[Logout] Step 5: Redirecting to login page...');
    const timestamp = Date.now();
    window.location.href = "/?logout=" + timestamp;
  };

  return (
    <SafeAreaLayout className="flex flex-col bg-transparent">
      <GlobalBackground />
      <AppHeader onLogout={handleLogout} transparent={transparentHeader} />
      <main
        className="flex-1 relative z-10"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)",
        }}
      >
        {children}
      </main>
    </SafeAreaLayout>
  );
}
