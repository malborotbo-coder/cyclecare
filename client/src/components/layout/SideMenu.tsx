import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Menu, 
  Home, 
  Wrench, 
  Package, 
  Briefcase, 
  Shield,
  LogOut,
  User,
  X
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLocation } from "wouter";
import { useState } from "react";
import Logo from "@/components/Logo";

interface SideMenuProps {
  onLogout?: () => void;
}

export default function SideMenu({ onLogout }: SideMenuProps) {
  const { lang } = useLanguage();
  const { user } = useFirebaseAuth();
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
      profile: "الملف الشخصي",
      logout: "تسجيل الخروج",
    },
    en: {
      menu: "Menu",
      home: "Home",
      services: "Services",
      parts: "Parts",
      technician: "Technician",
      admin: "Admin",
      profile: "Profile",
      logout: "Logout",
    },
  };

  const menuItems = [
    { id: "home", path: "/", icon: Home, label: t[lang].home },
    { id: "services", path: "/booking", icon: Wrench, label: t[lang].services },
    { id: "parts", path: "/parts", icon: Package, label: t[lang].parts },
    { id: "technician", path: "/technician", icon: Briefcase, label: t[lang].technician },
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
          className="text-white hover:bg-white/20 h-11 w-11"
          data-testid="button-menu-toggle"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        side={lang === "ar" ? "right" : "left"} 
        className="w-[280px] bg-background border-border"
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
          <Button
            variant="ghost"
            className="justify-start gap-3 min-h-[52px] py-3 text-lg"
            onClick={() => handleNavigate("/profile")}
            data-testid="menu-profile"
          >
            <User className="h-5 w-5" />
            {t[lang].profile}
          </Button>

          <Button
            variant="ghost"
            className="justify-start gap-3 min-h-[52px] py-3 text-lg text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            data-testid="menu-logout"
          >
            <LogOut className="h-5 w-5" />
            {t[lang].logout}
          </Button>
        </div>

        {user && (
          <div className="absolute bottom-6 left-4 right-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium truncate">
                {user.email || user.phone || "User"}
              </p>
              {user.isAdmin === true && (
                <p className="text-xs text-primary mt-1">
                  {lang === "ar" ? "مسؤول" : "Admin"}
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
