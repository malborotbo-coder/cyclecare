import { Home, Wrench, Package, User, Briefcase, Shield, ShoppingCart } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/contexts/CartContext";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
  isAdmin: boolean;
  source: "replit_auth" | "firebase_auth";
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  testId: string;
}

function NavItem({ icon, label, active, onClick, testId }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 flex-1 py-3 px-2 transition-all duration-300 rounded-xl relative group ${
        active 
          ? 'bg-gradient-to-br from-primary/40 to-secondary/30 backdrop-blur-md text-primary' 
          : 'text-muted-foreground/70 hover:text-muted-foreground'
      }`}
      data-testid={testId}
    >
      {/* Active indicator dot */}
      {active && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full"></div>
      )}
      
      <div className={`transition-all duration-300 ${active ? 'scale-125 drop-shadow-lg' : 'scale-100 group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className={`text-xs font-semibold transition-all duration-300 ${active ? 'opacity-100 text-primary' : 'opacity-70 text-muted-foreground/60 group-hover:opacity-100'}`}>
        {label}
      </span>
    </button>
  );
}

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { lang: language } = useLanguage();
  const { itemCount } = useCart();
  const [, setLocation] = useLocation();

  const { data: sessionData } = useQuery<{ user: SessionUser | null }>({
    queryKey: ["/api/auth/session"],
  });
  const user = sessionData?.user;

  const t = {
    ar: {
      home: "الرئيسية",
      services: "الخدمات",
      parts: "القطع",
      profile: "الملف",
      technician: "فني",
      admin: "مسؤول",
    },
    en: {
      home: "Home",
      services: "Services",
      parts: "Parts",
      profile: "Profile",
      technician: "Technician",
      admin: "Admin",
    },
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg bg-gradient-to-t from-black/60 via-black/40 to-black/30 border-t border-white/10">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-around gap-1 py-2">
          <NavItem
            icon={<Home className="w-6 h-6" />}
            label={t[language].home}
            active={activeTab === 'home'}
            onClick={() => onTabChange('home')}
            testId="nav-home"
          />
          <NavItem
            icon={<Wrench className="w-6 h-6" />}
            label={t[language].services}
            active={activeTab === 'services'}
            onClick={() => onTabChange('services')}
            testId="nav-services"
          />
          <button
            onClick={() => {
              if (activeTab === 'parts') setLocation('/cart');
              else onTabChange('parts');
            }}
            className="flex flex-col items-center gap-2 flex-1 py-3 px-2 transition-all duration-300 rounded-xl relative group"
            data-testid="nav-cart"
          >
            <div className="relative">
              <ShoppingCart className="w-6 h-6" />
              {itemCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {itemCount}
                </Badge>
              )}
            </div>
            <span className="text-xs font-semibold opacity-70">{t[language].parts}</span>
          </button>
          <NavItem
            icon={<User className="w-6 h-6" />}
            label={t[language].profile}
            active={activeTab === 'profile'}
            onClick={() => onTabChange('profile')}
            testId="nav-profile"
          />
          <NavItem
            icon={<Briefcase className="w-6 h-6" />}
            label={t[language].technician}
            active={activeTab === 'technician'}
            onClick={() => onTabChange('technician')}
            testId="nav-technician"
          />
          {user?.isAdmin === true && (
            <NavItem
              icon={<Shield className="w-6 h-6" />}
              label={t[language].admin}
              active={activeTab === 'admin'}
              onClick={() => onTabChange('admin')}
              testId="nav-admin"
            />
          )}
        </div>
      </div>
    </nav>
  );
}
