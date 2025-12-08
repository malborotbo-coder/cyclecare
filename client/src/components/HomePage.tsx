import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Wrench, Package, History, UserCircle, MapPin, Star, UserPlus, CheckCircle2, LogOut, Plus, User, Edit } from "lucide-react";
import heroImage from "@assets/generated_images/Professional_cyclist_rear_view_landscape_bad0f0cd.png";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import type { Technician, User as UserType } from "@shared/schema";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";

interface ServiceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  variant?: 'default' | 'highlight';
}

function ServiceCard({ icon, title, description, onClick, variant = 'default' }: ServiceCardProps) {
  return (
    <Card 
      className={`hover-elevate active-elevate-2 cursor-pointer transition-all ${
        variant === 'highlight' ? 'border-primary border-2' : ''
      }`}
      onClick={onClick}
      data-testid={`card-service-${title.toLowerCase()}`}
    >
      <CardContent className="p-6 flex flex-col items-center text-center gap-3">
        <div className={`w-12 h-12 rounded-full ${
          variant === 'highlight' ? 'bg-primary text-white' : 'bg-primary/10 text-primary'
        } flex items-center justify-center`}>
          {icon}
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

interface TechnicianCardProps {
  name: string;
  rating: string;
  reviewCount: number;
  available: boolean;
}

function TechnicianCard({ name, rating, reviewCount, available }: TechnicianCardProps) {
  const { t, lang } = useLanguage();

  return (
    <Card className="w-64 flex-shrink-0 hover-elevate cursor-pointer" data-testid={`card-technician-${name}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold truncate">{name}</h4>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-primary text-primary" />
                <span className="text-sm font-medium">{rating}</span>
              </div>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{reviewCount} {lang === 'ar' ? 'تقييم' : 'reviews'}</span>
            </div>
            <Badge variant={available ? "default" : "secondary"} className="mt-2 text-xs">
              {available ? t('availableNow') : t('busy')}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomePage() {
  const { t, lang, toggleLanguage } = useLanguage();
  const { user } = useCurrentUser();
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
  const platform = Capacitor.getPlatform();
  const isNative = platform !== 'web';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [heroLoaded, setHeroLoaded] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Fix for safe area on native apps
  useEffect(() => {
    if (isNative) {
      const style = document.documentElement.style;
      style.setProperty('background-color', 'hsl(var(--background))');
    }
  }, [isNative]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setHeroLoaded(true);
    img.src = heroImage;
  }, []);

  // Skip API calls on iOS - just show mock data
  const shouldSkipAPI = !!nativeUser;
  const { data: technicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    enabled: !shouldSkipAPI,
  });

  // Show success toast after successful login
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
      // Note: user.firstName and user.email come from Replit Auth (trusted source)
      // React automatically escapes HTML in template literals, preventing XSS
      const userName = (user as any)?.firstName || (user as any)?.email || '';

      toast({
        title: lang === 'ar' ? "تم تسجيل الدخول بنجاح" : "Successfully logged in",
        description: lang === 'ar' 
          ? `مرحباً ${userName}! يمكنك الآن استخدام جميع الخدمات.`
          : `Welcome ${userName}! You can now access all services.`,
        duration: 5000,
      });
      // Clean URL by removing the query parameter
      window.history.replaceState({}, '', '/');
    }
  }, [user, lang, toast]);

  const handleLogoutClick = async () => {
    console.log('[Logout] ===== LOGOUT STARTED =====');
    console.log('[Logout] Current user:', user);
    
    if (isNative) {
      console.log('[Logout] iOS - clearing native auth state...');
      nativeAuth.logout();
      console.log('[Logout] iOS - reloading app');
      window.location.reload();
      return;
    }
    
    // الخطوة 1: استدعاء API لتدمير الجلسة على السيرفر
    console.log('[Logout] Step 1: Calling logout API...');
    try {
      const response = await fetch("/api/logout", { 
        method: "POST", 
        credentials: "include",
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('[Logout] API response status:', response.status);
    } catch (e) {
      console.error('[Logout] API call failed:', e);
    }
    
    // الخطوة 2: مسح كل البيانات المخزنة محلياً
    console.log('[Logout] Step 2: Clearing all local data...');
    
    // مسح React Query cache بالكامل
    queryClient.clear();
    queryClient.removeQueries();
    
    // مسح NativeAuth state
    nativeAuth.logout();
    
    // مسح التخزين المحلي
    sessionStorage.clear();
    localStorage.clear();
    
    // مسح جميع الكوكيز
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0].trim();
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
    });
    
    // الخطوة 3: إلغاء تسجيل Service Worker لمنع التخزين المؤقت
    console.log('[Logout] Step 3: Unregistering service workers...');
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[Logout] Service worker unregistered');
      }
    }
    
    // الخطوة 4: مسح الـ caches
    console.log('[Logout] Step 4: Clearing caches...');
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('[Logout] All caches cleared');
    }
    
    // الخطوة 5: انتظار قصير للتأكد من مسح كل شيء
    console.log('[Logout] Step 5: Waiting for cleanup...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // الخطوة 6: إعادة التوجيه مع timestamp لتجاوز أي cache متبقي
    console.log('[Logout] Step 6: Redirecting to login page...');
    const timestamp = Date.now();
    window.location.href = "/?logout=" + timestamp;
  };

  const navigateToBooking = () => {
    setLocation('/booking');
  };

  const navigateToParts = () => {
    setLocation('/parts');
  };

  const navigateToHistory = () => {
    setLocation('/history');
  };

  const navigateToTechnicianRegistration = () => {
    setLocation('/technician/register');
  };

  const navigateToBikes = () => {
    setLocation('/bikes');
  };

  const handleSwitchToRealAccount = () => {
    // Set flag to allow real auth on iOS
    sessionStorage.setItem('wantRealAuth', 'true');
    // Redirect to login
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen bg-background">
      <main 
        ref={heroRef}
        className="pb-20 relative min-h-screen bg-cover bg-center bg-fixed" 
        style={{ backgroundImage: heroLoaded ? `url(${heroImage})` : undefined }}
      >
        <div className={`absolute inset-0 transition-all duration-500 ${heroLoaded ? 'bg-black/30' : 'bg-gradient-to-b from-primary/40 to-secondary/40'}`}></div>
        
        <div className="relative">
          <div className="container mx-auto px-4 flex flex-col justify-center items-start min-h-screen">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl font-bold text-white drop-shadow-lg">
                {t('welcome')} {(user as any)?.firstName || (user as any)?.email || ''}
              </h1>
              <p className="text-white/95 text-2xl drop-shadow-md max-w-2xl leading-relaxed">{t('howCanHelp')}</p>
              <Button 
                onClick={navigateToBooking}
                size="lg"
                className="w-fit bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg text-lg px-8 py-6"
                data-testid="button-quick-booking"
              >
                <Wrench className="w-6 h-6 mr-2" />
                {lang === 'ar' ? 'احجز خدمة الآن' : 'Book Service Now'}
              </Button>
            </div>
          </div>

          <div className="relative z-10 bg-white/40 dark:bg-black/40 backdrop-blur-sm">
            <div className="container mx-auto px-4 py-8">
              <div className="mb-6">
            <Button 
              onClick={navigateToBikes}
              className="w-full bg-secondary hover:bg-secondary/90 text-white font-semibold"
              data-testid="button-add-my-bike"
            >
              <Plus className="w-5 h-5 mr-2" />
              {lang === 'ar' ? '+ إضافة دراجتي' : '+ Add My Bike'}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <ServiceCard
              icon={<Wrench className="w-6 h-6" />}
              title={t('maintenanceService')}
              description={t('maintenanceDesc')}
              onClick={navigateToBooking}
            />
            <ServiceCard
              icon={<Wrench className="w-6 h-6" />}
              title={t('repairService')}
              description={t('repairDesc')}
              onClick={navigateToBooking}
            />
            <ServiceCard
              icon={<Package className="w-6 h-6" />}
              title={t('partsService')}
              description={t('partsDesc')}
              onClick={navigateToParts}
            />
            <ServiceCard
              icon={<History className="w-6 h-6" />}
              title={t('historyService')}
              description={t('historyDesc')}
              onClick={navigateToHistory}
            />
          </div>

          <Card className="mb-6 bg-primary/5 border-primary/20 hover-elevate cursor-pointer" data-testid="card-register-technician" onClick={navigateToTechnicianRegistration}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{t('registerTechnician')}</h3>
                <p className="text-sm text-muted-foreground">{t('registerTechnicianDesc')}</p>
              </div>
            </CardContent>
          </Card>

          {technicians && technicians.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">{t('nearbyTechnicians')}</h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
                {technicians.map((tech, idx) => (
                  <TechnicianCard
                    key={tech.id}
                    name={`${lang === 'ar' ? 'فني' : 'Technician'} #${idx + 1}`}
                    rating={tech.rating || "0.0"}
                    reviewCount={tech.reviewCount || 0}
                    available={tech.isAvailable || false}
                  />
                ))}
              </div>
            </div>
          )}

          <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                {t('nextMaintenance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">{t('bikeNeedsMaintenance')}</p>
              <Button data-testid="button-book-now" onClick={navigateToBooking}>{t('bookNow')}</Button>
            </CardContent>
          </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}