import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Bell, Wrench, Package, History, UserCircle, MapPin, Star, UserPlus, CheckCircle2, LogOut, Plus, User, Edit } from "lucide-react";
// خلفية موحدة (لون فقط) بدلاً من الصورة لضبط التناسق على الجوال
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import type { Technician, User as UserType } from "@shared/schema";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { clearAuthTokens } from "@/lib/authStorage";
import { buildApiUrl } from "@/lib/apiConfig";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState, useRef } from "react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "@/hooks/useAuth";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

type TechnicianCardCompat = Technician & {
  is_available?: boolean | null;
  is_active?: boolean | null;
  review_count?: number | null;
  status?: string | null;
  name?: string | null;
  distanceKm?: number | string | null;
  etaMinutes?: number | string | null;
  years_of_experience?: number | null;
  yearsOfExperience?: number | null;
  profileImageUrl?: string | null;
  profile_image_url?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  user?: {
    first_name?: string | null;
    last_name?: string | null;
    profile_image_url?: string | null;
    avatar_url?: string | null;
  } | null;
};

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
  imageUrl?: string | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  yearsOfExperience?: number | null;
}

function TechnicianCard({
  name,
  rating,
  reviewCount,
  available,
  imageUrl,
  distanceKm,
  etaMinutes,
  yearsOfExperience,
}: TechnicianCardProps) {
  const { t, lang } = useLanguage();
  const distanceValue = typeof distanceKm === "number" && Number.isFinite(distanceKm) ? distanceKm : null;
  const etaValue = typeof etaMinutes === "number" && Number.isFinite(etaMinutes) ? etaMinutes : null;
  const experienceValue =
    typeof yearsOfExperience === "number" && Number.isFinite(yearsOfExperience)
      ? yearsOfExperience
      : null;

  return (
    <Card className="w-72 flex-shrink-0 hover-elevate cursor-pointer border border-white/50 bg-white/85 backdrop-blur-md dark:border-white/15 dark:bg-black/25" data-testid={`card-technician-${name}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="w-8 h-8 text-primary" />
            )}
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
        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
          <div className="rounded-lg bg-white/70 px-2 py-1 text-center dark:bg-white/10">
            {distanceValue !== null ? `${distanceValue.toFixed(1)} ${lang === 'ar' ? 'كم' : 'km'}` : "--"}
          </div>
          <div className="rounded-lg bg-white/70 px-2 py-1 text-center dark:bg-white/10">
            {etaValue !== null ? `${Math.max(1, Math.round(etaValue))} ${lang === 'ar' ? 'د' : 'min'}` : "--"}
          </div>
          <div className="rounded-lg bg-white/70 px-2 py-1 text-center dark:bg-white/10">
            {experienceValue !== null
              ? `${experienceValue} ${lang === 'ar' ? 'سنوات' : 'yrs'}`
              : "--"}
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
  const heroRef = useRef<HTMLDivElement>(null);

  // Skip API calls on iOS - just show mock data
  const shouldSkipAPI = !!nativeUser;
  const { data: technicians } = useQuery<TechnicianCardCompat[]>({
    queryKey: ["/api/technicians"],
    enabled: !shouldSkipAPI,
  });
  const safeTechnicians: TechnicianCardCompat[] = Array.isArray(technicians) ? technicians : [];
  const visibleTechnicians = safeTechnicians.filter(
    (tech) => tech.is_available === true && tech.status === "approved" && tech.is_active === true,
  );

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
      await nativeAuth.logout();
      console.log('[Logout] iOS - reloading app');
      window.location.reload();
      return;
    }
    
    // الخطوة 1: استدعاء API لتدمير الجلسة على السيرفر
    console.log('[Logout] Step 1: Calling logout API...');
    try {
      const response = await fetch(buildApiUrl("/api/logout"), { 
        method: "POST", 
        credentials: "include",
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('[Logout] API response status:', response.status);
    } catch (e) {
      console.error('[Logout] API call failed:', e);
    }
    
    // الخطوة 2: مسح بيانات المصادقة فقط
    console.log('[Logout] Step 2: Clearing auth state...');
    queryClient.clear();
    queryClient.removeQueries();
    await nativeAuth.logout();
    await clearAuthTokens();

    // الخطوة 3: إعادة التوجيه
    console.log('[Logout] Step 3: Redirecting to login page...');
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
    <div className="min-h-screen">
      <main 
        ref={heroRef}
        className="pb-20 relative min-h-screen"
        style={{ 
          paddingTop: "12px",
          minHeight: "max(100vh, 100dvh)",
          backgroundImage: `url(${workshopBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "scroll",
        }}
      >
        <div className="absolute inset-0 bg-black/35 transition-all duration-500"></div>
        
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

              {visibleTechnicians.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{t('nearbyTechnicians')}</h2>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
                    {visibleTechnicians.map((tech, idx) => {
                      const user = (tech as any)?.user;
                      const nameFromUser = user
                        ? [user.first_name, user.last_name].filter(Boolean).join(" ")
                        : "";
                      const displayName =
                        (tech as any)?.name ||
                        nameFromUser ||
                        `${lang === 'ar' ? 'فني' : 'Technician'} #${idx + 1}`;
                      const imageUrl =
                        (tech as any)?.avatarUrl ??
                        (tech as any)?.avatar_url ??
                        (tech as any)?.profileImageUrl ??
                        (tech as any)?.profile_image_url ??
                        user?.avatar_url ??
                        user?.profile_image_url ??
                        null;
                      const distanceRaw = Number((tech as any)?.distanceKm);
                      const etaRaw = Number((tech as any)?.etaMinutes);
                      const experienceRaw = Number((tech as any)?.yearsOfExperience ?? (tech as any)?.years_of_experience);
                      return (
                        <TechnicianCard
                          key={tech.id}
                          name={displayName}
                          rating={(tech.rating as any) || "0.0"}
                          reviewCount={tech.review_count || tech.reviewCount || 0}
                          available={tech.is_available || tech.isAvailable || false}
                          imageUrl={imageUrl}
                          distanceKm={Number.isFinite(distanceRaw) ? distanceRaw : null}
                          etaMinutes={Number.isFinite(etaRaw) ? etaRaw : null}
                          yearsOfExperience={Number.isFinite(experienceRaw) ? experienceRaw : null}
                        />
                      );
                    })}
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
