import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import SideMenu from "./SideMenu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Bell, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { hasStoredAuthTokenSync } from "@/lib/authSession";
import { useAppMode } from "@/hooks/useAppMode";
import { NOT_TECHNICIAN_ROUTE } from "@/lib/authRole";

type NotificationItem = {
  id: string;
  readAt?: string | null;
};

interface AppHeaderProps {
  onLogout?: () => void;
  transparent?: boolean;
}

export default function AppHeader({ onLogout, transparent = false }: AppHeaderProps) {
  const { lang, toggleLanguage } = useLanguage();
  const [, setLocation] = useLocation();
  const isNative = Capacitor.isNativePlatform();
  const { itemCount } = useCart();
  const { user, isGuest, authReady } = useFirebaseAuth();
  const { appMode, isModeLoading } = useAppMode();
  const canLoadNotifications =
    authReady && Boolean(user) && !isGuest && hasStoredAuthTokenSync();
  const isTechnicianMode = appMode === "technician";
  const isRiderMode = appMode === "rider";
  const isBlockedMode = appMode === "blocked";
  const notificationScope = isTechnicianMode ? "technician" : "customer";
  const showNotifications = user && !isGuest && !isBlockedMode;

  const { data: notifications } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications", notificationScope],
    queryFn: () => apiRequest(`/api/notifications?scope=${notificationScope}`, "GET"),
    enabled: canLoadNotifications && !isModeLoading && !isBlockedMode,
    refetchOnWindowFocus: true,
  });

  const unreadCount = useMemo(
    () => (Array.isArray(notifications) ? notifications.filter((n) => !n.readAt).length : 0),
    [notifications],
  );
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  const handleLogoClick = () => {
    if (isBlockedMode) {
      setLocation(NOT_TECHNICIAN_ROUTE);
      return;
    }
    setLocation(isTechnicianMode ? "/technician/dashboard" : "/");
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-[110] border-b backdrop-blur-xl ${
        transparent 
          ? "bg-black/15 dark:bg-black/25 border-white/10"
          : "bg-primary/50 dark:bg-primary/45 border-primary/25"
      }`}
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top, 0px)' : '0px',
        paddingLeft: isNative ? "env(safe-area-inset-left, 0px)" : "0px",
        paddingRight: isNative ? "env(safe-area-inset-right, 0px)" : "0px",
        minHeight: "calc(env(safe-area-inset-top, 0px) + 64px)",
        height: "calc(env(safe-area-inset-top, 0px) + 64px)",
      }}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SideMenu onLogout={onLogout} />
          <div onClick={handleLogoClick} className="cursor-pointer">
            <Logo size="sm" clickable={false} />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {showNotifications && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/notifications")}
              className="relative"
              data-testid="button-notifications"
              aria-label={lang === "ar" ? "الإشعارات" : "Notifications"}
            >
              <Bell className={`h-5 w-5 ${unreadCount > 0 ? "text-amber-300" : ""}`} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[11px] font-bold flex items-center justify-center">
                  {unreadLabel}
                </span>
              )}
            </Button>
          )}
          {isRiderMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/cart")}
              className="relative"
              data-testid="button-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-black text-[11px] font-bold flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Button>
          )}
          <ThemeToggle />
          <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
        </div>
      </div>
    </header>
  );
}
