import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import SideMenu from "./SideMenu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";

interface AppHeaderProps {
  onLogout?: () => void;
  transparent?: boolean;
}

export default function AppHeader({ onLogout, transparent = false }: AppHeaderProps) {
  const { lang, toggleLanguage } = useLanguage();
  const [, setLocation] = useLocation();
  const isNative = Capacitor.isNativePlatform();

  const handleLogoClick = () => {
    setLocation("/");
  };

  return (
    <header 
      className={`sticky top-0 z-50 border-b ${
        transparent 
          ? "bg-gradient-to-b from-black/60 via-black/40 to-transparent border-white/10" 
          : "bg-primary border-primary/20"
      }`}
      style={{
        paddingTop: isNative ? 'env(safe-area-inset-top, 0px)' : '0px',
      }}
    >
      <div className="container mx-auto px-4 py-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SideMenu onLogout={onLogout} />
          <div onClick={handleLogoClick} className="cursor-pointer">
            <Logo size="sm" clickable={false} />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
        </div>
      </div>
    </header>
  );
}
