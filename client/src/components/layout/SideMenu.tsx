import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Menu, 
  Home, 
  Wrench, 
  Package, 
  Briefcase, 
  ClipboardList,
  Headset,
  Shield,
  LogOut,
  User,
  Bike,
  X
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLocation } from "wouter";
import { useState } from "react";
import Logo from "@/components/Logo";
import { setPostLoginRedirect } from "@/lib/authRedirect";

interface SideMenuProps {
  onLogout?: () => void;
}

export default function SideMenu({ onLogout }: SideMenuProps) {
  const { lang } = useLanguage();
  const { user, isGuest, exitGuestMode } = useFirebaseAuth();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const t = {
    ar: {
      menu: "القائمة",
      home: "الرئيسية",
      services: "الخدمات",
      parts: "القطع",
      technician: "الفني",
      admin: "المسؤول",
      profile: "بياناتي",
      bikes: "دراجتي",
      logout: "تسجيل الخروج",
      login: "تسجيل الدخول",
      orders: "طلباتي",
      support: "الدعم الفني",
    },
    en: {
      menu: "Menu",
      home: "Home",
      services: "Services",
      parts: "Parts",
      technician: "Technician",
      admin: "Admin",
      profile: "My Profile",
      bikes: "My Bike",
      logout: "Logout",
      login: "Sign In",
      orders: "My Orders",
      support: "Support",
    },
  };

  const menuItems = [
    { id: "home", path: "/", icon: Home, label: t[lang].home },
    { id: "services", path: "/booking", icon: Wrench, label: t[lang].services },
    { id: "parts", path: "/parts", icon: Package, label: t[lang].parts },
    ...(isGuest
      ? []
      : [
          { id: "technician", path: "/technician", icon: Briefcase, label: t[lang].technician },
          { id: "orders", path: "/orders", icon: ClipboardList, label: t[lang].orders },
          { id: "profile", path: "/my-profile", icon: User, label: t[lang].profile },
          { id: "bike", path: "/bikes", icon: Bike, label: t[lang].bikes },
        ]),
  ];

  const handleNavigate = (path: string) => {
    setLocation(path);
    setOpen(false);
  };

  const handleLogout = () => {
    setOpen(false);
    if (onLogout) {
      onLogout();
    }
  };

  const handleLogin = () => {
    setOpen(false);
    setPostLoginRedirect(location || "/");
    exitGuestMode();
  };

  const isActive = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white hover:bg-white/20 h-12 w-12"
          data-testid="button-menu-toggle"
        >
          <Menu className="h-7 w-7" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        side={lang === "ar" ? "right" : "left"} 
        className="w-[280px] bg-background/25 dark:bg-background/25 border-border/30 backdrop-blur-2xl pt-[calc(env(safe-area-inset-top,0px)+12px)]"
      >
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <Logo size="sm" onClick={() => handleNavigate("/")} />
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setOpen(false)}
              data-testid="button-close-menu"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <SheetTitle className="sr-only">{t[lang].menu}</SheetTitle>
        </SheetHeader>

        <nav className="flex flex-col gap-1 mt-4">
          {menuItems.map((item) => (
            <Button
              key={item.id}
              variant={isActive(item.path) ? "default" : "ghost"}
              className={`justify-start gap-3 min-h-[52px] py-3 text-lg ${
                isActive(item.path) ? "bg-primary text-white" : ""
              }`}
              onClick={() => handleNavigate(item.path)}
              data-testid={`menu-${item.id}`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Button>
          ))}

          {user?.isAdmin === true && (
            <Button
              variant={isActive("/admin") ? "default" : "ghost"}
              className={`justify-start gap-3 min-h-[52px] py-3 text-lg ${
                isActive("/admin") ? "bg-primary text-white" : ""
              }`}
              onClick={() => handleNavigate("/admin")}
              data-testid="menu-admin"
            >
              <Shield className="h-5 w-5" />
              {t[lang].admin}
            </Button>
          )}
        </nav>

        <Separator className="my-4" />

        <div className="flex flex-col gap-1">
          {user ? (
            <Button
              variant="ghost"
              className="justify-start gap-3 min-h-[52px] py-3 text-lg text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
              data-testid="menu-logout"
            >
              <LogOut className="h-5 w-5" />
              {t[lang].logout}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="justify-start gap-3 min-h-[52px] py-3 text-lg"
              onClick={handleLogin}
              data-testid="menu-login"
            >
              <User className="h-5 w-5" />
              {t[lang].login}
            </Button>
          )}
        </div>

        {user && (
          <div className="absolute bottom-6 left-4 right-4 space-y-2">
            <Button
              variant={isActive("/support") ? "default" : "ghost"}
              className={`w-full justify-start gap-3 min-h-[52px] py-3 text-lg ${
                isActive("/support") ? "bg-primary text-white" : ""
              }`}
              onClick={() => handleNavigate("/support")}
              data-testid="menu-support"
            >
              <Headset className="h-5 w-5" />
              {t[lang].support}
            </Button>
            <Button
              variant={isActive("/my-profile") ? "default" : "ghost"}
              className={`w-full justify-start gap-3 min-h-[52px] py-3 text-lg ${
                isActive("/my-profile") ? "bg-primary text-white" : ""
              }`}
              onClick={() => handleNavigate("/my-profile")}
              data-testid="menu-user-profile"
            >
              <User className="h-5 w-5" />
              {user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : (user.email || user.phone || "بياناتي")}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
