import AppHeader from "./AppHeader";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
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
  const [pullOffset, setPullOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const pullOffsetRef = useRef(0);
  const refreshThreshold = 70;

  const refreshData = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setPullOffset(60);
    pullOffsetRef.current = 60;
    try {
      await queryClient.invalidateQueries();
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setIsRefreshing(false);
      setPullOffset(0);
      pullOffsetRef.current = 0;
    }
  };

  useEffect(() => {
    console.info("[Bootstrap] AppLayout mounted", { location });
  }, []);

  useEffect(() => {
    if (location.startsWith("/admin")) return;
    loadMockOrders();
  }, [location]);

  useEffect(() => {
    if (!isNative) return;

    const getScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const handleTouchStart = (event: TouchEvent) => {
      if (isRefreshing || getScrollTop() > 0) return;
      pullStartRef.current = event.touches[0]?.clientY ?? null;
      isPullingRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isPullingRef.current || pullStartRef.current === null || isRefreshing) return;
      if (getScrollTop() > 0) return;
      const currentY = event.touches[0]?.clientY ?? pullStartRef.current;
      const delta = Math.max(0, currentY - pullStartRef.current);
      const nextOffset = Math.min(delta, 120);
      pullOffsetRef.current = nextOffset;
      setPullOffset(nextOffset);
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current || isRefreshing) {
        setPullOffset(0);
        pullOffsetRef.current = 0;
        pullStartRef.current = null;
        isPullingRef.current = false;
        return;
      }
      if (pullOffsetRef.current >= refreshThreshold) {
        void refreshData();
      } else {
        setPullOffset(0);
        pullOffsetRef.current = 0;
      }
      pullStartRef.current = null;
      isPullingRef.current = false;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isNative, isRefreshing]);

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
        {isNative && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center"
            style={{
              transform: `translateY(${Math.min(pullOffset, 80)}px)`,
              opacity: Math.min(pullOffset / 60, 1),
              transition: isRefreshing ? "opacity 120ms ease" : "transform 120ms ease",
            }}
          >
            <div className="rounded-full border border-border/40 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
              {isRefreshing ? "Refreshing..." : "Pull to refresh"}
            </div>
          </div>
        )}
        {children}
      </main>
    </SafeAreaLayout>
  );
}
