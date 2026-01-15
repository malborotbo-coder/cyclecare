import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { MapPin, Clock, Phone, CheckCircle, XCircle, Home, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ServiceRequest, Technician } from "@shared/schema";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

type TechnicianOrder = ServiceRequest & {
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: number | string | null;
};

interface ServiceRequestCardProps extends ServiceRequest {
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  onComplete?: (id: string, file: File) => void;
  isBusy?: boolean;
  lang: 'ar' | 'en';
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  invoiceTotal?: number | string | null;
  technicianCoords?: { lat: number; lng: number } | null;
}

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseCoordsFromLocation = (location?: string | null) => {
  if (!location) return null;
  const parts = location.split(",").map((part) => part.trim());
  if (parts.length !== 2) return null;
  const lat = toNumber(parts[0]);
  const lng = toNumber(parts[1]);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const haversineKm = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
};

function ServiceRequestCard(props: ServiceRequestCardProps) {
  const {
    id,
    userId,
    serviceType,
    location,
    latitude,
    longitude,
    notes,
    status,
    createdAt,
    onAccept,
    onDecline,
    onStatusChange,
    onComplete,
    isBusy,
    lang,
    invoiceNumber,
    invoiceStatus,
    invoiceTotal,
    technicianCoords,
  } = props;
  const [completionFile, setCompletionFile] = useState<File | null>(null);
  const isNewStatus = ['pending', 'assigned', 'created'].includes(status || '');
  const isActiveStatus = ['accepted', 'on_the_way', 'working', 'in_progress'].includes(status || '');
  const formatCurrency = (value?: number | string | null) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return null;
    return `${numeric.toFixed(2)} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;
  };
  const invoiceTotalLabel = formatCurrency(invoiceTotal);
  const providedDistance = toNumber((props as any)?.distanceKm ?? (props as any)?.technicianDistanceKm ?? (props as any)?.distance_km);
  const providedEta = toNumber((props as any)?.etaMinutes ?? (props as any)?.eta_minutes ?? (props as any)?.technicianEtaMinutes);
  const numericLat = toNumber(latitude);
  const numericLng = toNumber(longitude);
  const locationCoords = numericLat !== null && numericLng !== null
    ? { lat: numericLat, lng: numericLng }
    : parseCoordsFromLocation(location);
  const computedDistance = technicianCoords && locationCoords
    ? haversineKm(technicianCoords, locationCoords)
    : null;
  const distanceKm = providedDistance ?? computedDistance;
  const etaMinutes = providedEta;
  const distanceLabel = distanceKm !== null
    ? `${distanceKm.toFixed(1)} ${lang === 'ar' ? 'كم' : 'km'}`
    : null;
  const etaLabel = etaMinutes !== null
    ? `${Math.round(etaMinutes)} ${lang === 'ar' ? 'دقيقة' : 'min'}`
    : null;
  const navigationUrl = locationCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${locationCoords.lat},${locationCoords.lng}`
    : location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
      : null;

  const formatTime = (date: Date | null) => {
    if (!date) return lang === 'ar' ? 'غير محدد' : 'Not specified';
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (lang === 'ar') {
      if (minutes < 1) return 'منذ لحظات';
      if (minutes < 60) return `منذ ${minutes} دقيقة`;
      if (hours < 24) return `منذ ${hours} ساعة`;
      return `منذ ${days} يوم`;
    } else {
      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes} min ago`;
      if (hours < 24) return `${hours} hours ago`;
      return `${days} days ago`;
    }
  };

  const getStatusLabel = () => {
    const labels = {
      pending: lang === 'ar' ? 'جديد' : 'New',
      accepted: lang === 'ar' ? 'تم استلام الطلب' : 'Accepted',
      assigned: lang === 'ar' ? 'تم الإسناد' : 'Assigned',
      created: lang === 'ar' ? 'جديد' : 'New',
      on_the_way: lang === 'ar' ? 'الفني في الطريق' : 'On the way',
      working: lang === 'ar' ? 'جاري تنفيذ الصيانة' : 'Working',
      in_progress: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress',
      completed: lang === 'ar' ? 'مكتمل' : 'Completed',
      rejected_by_technician: lang === 'ar' ? 'مرفوض من الفني' : 'Rejected',
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <Card className={`border-r-4 ${status === 'pending' ? 'border-r-primary' : status === 'accepted' || status === 'on_the_way' || status === 'working' || status === 'in_progress' ? 'border-r-blue-500' : 'border-r-green-500'}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {lang === 'ar' ? 'العميل' : 'Customer'} #{userId?.substring(0, 8)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{serviceType}</p>
          </div>
          <Badge variant={status === 'pending' ? 'default' : status === 'accepted' ? 'secondary' : 'outline'}>
            {getStatusLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span>{location || (lang === 'ar' ? 'الرياض' : 'Riyadh')}</span>
        </div>
        {isNewStatus && (distanceLabel || etaLabel) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {distanceLabel && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {distanceLabel}
              </span>
            )}
            {etaLabel && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {etaLabel}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{formatTime(createdAt)}</span>
        </div>
        {notes && (
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
            {notes}
          </div>
        )}

        {(invoiceNumber || invoiceStatus || invoiceTotalLabel) && (
          <div className="text-sm text-muted-foreground bg-muted/70 p-2 rounded-md space-y-1">
            {invoiceNumber && (
              <div>
                {lang === 'ar' ? 'رقم الفاتورة' : 'Invoice'}: {invoiceNumber}
              </div>
            )}
            {invoiceStatus && (
              <div>
                {lang === 'ar' ? 'حالة الفاتورة' : 'Status'}: {invoiceStatus}
              </div>
            )}
            {invoiceTotalLabel && (
              <div>
                {lang === 'ar' ? 'الإجمالي' : 'Total'}: {invoiceTotalLabel}
              </div>
            )}
          </div>
        )}

        {isActiveStatus && (
          <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="w-4 h-4 text-primary" />
              <span>{lang === 'ar' ? 'الوجهة الحالية' : 'Current destination'}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {location || (lang === 'ar' ? 'موقع العميل' : 'Client location')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!navigationUrl}
              asChild={Boolean(navigationUrl)}
            >
              {navigationUrl ? (
                <a href={navigationUrl} target="_blank" rel="noreferrer">
                  {lang === 'ar' ? 'الانتقال إلى العميل' : 'Navigate to client'}
                </a>
              ) : (
                <span>{lang === 'ar' ? 'تعذر تحديد الموقع' : 'Location unavailable'}</span>
              )}
            </Button>
          </div>
        )}
        
        {status === 'pending' && (
          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={() => onAccept?.(id)}
              disabled={isBusy}
              data-testid={`button-accept-${id}`}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              {lang === 'ar' ? 'قبول' : 'Accept'}
            </Button>
            <Button 
              variant="outline"
              onClick={() => onDecline?.(id)}
              disabled={isBusy}
              data-testid={`button-decline-${id}`}
            >
              <XCircle className="w-4 h-4 ml-2" />
              {lang === 'ar' ? 'رفض' : 'Decline'}
            </Button>
          </div>
        )}

        {status === 'accepted' && (
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onStatusChange?.(id, 'on_the_way')}
              disabled={isBusy}
              data-testid={`button-on-the-way-${id}`}
            >
              {lang === 'ar' ? 'الفني في الطريق' : 'On the way'}
            </Button>
          </div>
        )}

        {status === 'on_the_way' && (
          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => onStatusChange?.(id, 'working')}
              disabled={isBusy}
              data-testid={`button-working-${id}`}
            >
              {lang === 'ar' ? 'جاري تنفيذ الصيانة' : 'Working'}
            </Button>
          </div>
        )}

        {(status === 'working' || status === 'in_progress') && (
          <div className="space-y-2 pt-2">
            <Label className="text-xs text-muted-foreground">
              {lang === 'ar' ? 'صورة بعد الصيانة (مطلوبة)' : 'After service photo (required)'}
            </Label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setCompletionFile(file);
              }}
              className="w-full rounded-md border border-border bg-background p-2 text-xs"
              data-testid={`input-complete-photo-${id}`}
            />
            <Button
              className="w-full"
              onClick={() => completionFile && onComplete?.(id, completionFile)}
              disabled={isBusy || !completionFile}
              data-testid={`button-complete-${id}`}
            >
              {lang === 'ar' ? 'تم الانتهاء من الصيانة' : 'Complete'}
            </Button>
          </div>
        )}
        
        {(status === 'accepted' || status === 'on_the_way' || status === 'working' || status === 'in_progress') && (
          <Button variant="outline" className="w-full" data-testid={`button-contact-${id}`}>
            <Phone className="w-4 h-4 ml-2" />
            {lang === 'ar' ? 'الاتصال بالعميل' : 'Contact Customer'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function TechnicianDashboard() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(true);
  // Keep the active tab stable after mutations; previously defaultValue reset the view on rerender.
  const [activeTab, setActiveTab] = useState<'new' | 'progress' | 'done'>('new');
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});
  const isNative = Capacitor.isNativePlatform();
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PageBackground = ({ children }: { children: React.ReactNode }) => (
    <div className="relative min-h-screen bg-transparent" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${workshopBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "scroll",
        }}
      >
        <div className="absolute inset-0 bg-black/30" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );

  const labels = {
    ar: {
      title: 'لوحة الفني',
      online: 'متصل',
      offline: 'غير متصل',
      newRequests: 'طلبات جديدة',
      inProgress: 'قيد التنفيذ',
      completed: 'مكتملة',
      noRequests: 'لا توجد طلبات',
      notRegistered: 'أنت غير مسجل كفني',
      registerNow: 'سجل الآن',
      pendingApproval: 'طلبك قيد المراجعة',
      waitingApproval: 'يرجى الانتظار حتى يتم الموافقة على طلبك من قبل الإدارة',
    },
    en: {
      title: 'Technician Panel',
      online: 'Online',
      offline: 'Offline',
      newRequests: 'New Requests',
      inProgress: 'In Progress',
      completed: 'Completed',
      noRequests: 'No requests',
      notRegistered: 'You are not registered as a technician',
      registerNow: 'Register Now',
      pendingApproval: 'Application Under Review',
      waitingApproval: 'Please wait for admin approval of your application',
    }
  };

  const t = labels[lang as keyof typeof labels] || labels.en;

  const stopLocationTracking = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
  };

  const { data: technician, isLoading: techLoading } = useQuery<Technician>({
    queryKey: ['/api/technicians/me'],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (data) => {
      const status = (data as any)?.status;
      const approvalStatus = status === "online" || status === "offline" ? "approved" : status;
      if (!data || approvalStatus === "pending") return 15000;
      return false;
    },
  });
  const status = (technician as any)?.status;
  const approvalStatus = status === "online" || status === "offline" ? "approved" : status;
  const isActive = (technician as any)?.is_active ?? (technician as any)?.isActive;
  const currentOnline = (technician as any)?.is_available ?? (technician as any)?.isAvailable ?? false;
  const isApprovedStatus = approvalStatus === "approved";

  const { data: requests = [], isLoading: reqLoading } = useQuery<TechnicianOrder[]>({
    queryKey: ['/api/technician/orders'],
    enabled: isApprovedStatus && isActive === true,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const safeRequests = Array.isArray(requests) ? requests : [];
  const technicianCoords = useMemo(() => {
    const lat = toNumber((technician as any)?.latitude ?? (technician as any)?.lat);
    const lng = toNumber((technician as any)?.longitude ?? (technician as any)?.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng };
  }, [technician]);
  const effectiveRequests = safeRequests.map((request) => ({
    ...request,
    status: optimisticStatuses[request.id] ?? request.status,
  }));

  const availabilityMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return apiRequest('/api/technicians/me/availability', 'PATCH', { is_available: next });
    },
    onSuccess: (updated: any) => {
      const online = updated?.is_available ?? updated?.isAvailable ?? false;
      setIsOnline(Boolean(online));
      queryClient.invalidateQueries({ queryKey: ['/api/technicians/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/technicians'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/technicians/locations'] });
      queryClient.invalidateQueries({
        predicate: (query) => (query.queryKey as any[])[0] === "/api/technicians/nearby",
      });
    },
    onError: () => {
      toast({
        title: lang === 'ar' ? 'فشل التحديث' : 'Update failed',
        description: lang === 'ar' ? 'تعذر تحديث التوفر' : 'Could not update availability',
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (technician && !availabilityMutation.isPending) {
      setIsOnline(currentOnline);
    }
  }, [technician, availabilityMutation.isPending, currentOnline]);

  const sendLocationUpdate = async (silent = false) => {
    try {
      let coords: { latitude: number; longitude: number } | null = null;
      if (isNative) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
        });
        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      } else if (navigator.geolocation) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          });
        });
        coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }

      if (!coords) {
        throw new Error("Location unavailable");
      }

      await apiRequest("/api/technicians/location", "POST", {
        lat: coords.latitude,
        lng: coords.longitude,
      });
    } catch (error: any) {
      const message = error?.message || "";
      const denied =
        error?.code === 1 ||
        message.toLowerCase().includes("permission") ||
        message.toLowerCase().includes("denied");
      if (!silent) {
        toast({
          title: lang === "ar" ? "تعذر تحديث الموقع" : "Location update failed",
          description: lang === "ar"
            ? "تأكد من تفعيل خدمات الموقع للسماح بظهورك للعميل."
            : "Enable location services to appear for customers.",
          variant: "destructive",
        });
      }
      if (denied && !availabilityMutation.isPending) {
        stopLocationTracking();
        setIsOnline(false);
        availabilityMutation.mutate(false);
      }
    }
  };

  useEffect(() => {
    if (!isApprovedStatus || isActive !== true || !isOnline) {
      stopLocationTracking();
      return;
    }

    sendLocationUpdate(true);
    locationIntervalRef.current = setInterval(() => {
      sendLocationUpdate(true);
    }, 15000);

    return () => stopLocationTracking();
  }, [isApprovedStatus, isActive, isOnline]);

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/technician/orders/${id}/accept`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/technician/orders'] });
      toast({
        title: lang === 'ar' ? 'تم القبول' : 'Accepted',
        description: lang === 'ar' ? 'تم قبول الطلب بنجاح' : 'Order accepted',
      });
    },
    onError: (error) => {
      console.error("[TECH][UI][ACCEPT][ERROR]", error);
      toast({
        title: lang === 'ar' ? 'تعذر القبول' : 'Accept failed',
        description: lang === 'ar' ? 'لم يتم قبول الطلب' : 'Could not accept order',
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/technician/orders/${id}/reject`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/technician/orders'] });
      toast({
        title: lang === 'ar' ? 'تم الرفض' : 'Rejected',
        description: lang === 'ar' ? 'تم رفض الطلب' : 'Order rejected',
      });
    },
    onError: (error) => {
      console.error("[TECH][UI][REJECT][ERROR]", error);
      toast({
        title: lang === 'ar' ? 'تعذر الرفض' : 'Reject failed',
        description: lang === 'ar' ? 'لم يتم رفض الطلب' : 'Could not reject order',
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/service-requests/${id}/status`, 'PATCH', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/technician/orders'] });
      toast({
        title: lang === 'ar' ? 'تم التحديث' : 'Updated',
        description: lang === 'ar' ? 'تم تحديث حالة الطلب' : 'Request status updated',
      });
    },
    onError: (error) => {
      console.error("[TECH][UI][STATUS][ERROR]", error);
      toast({
        title: lang === 'ar' ? 'تعذر التحديث' : 'Update failed',
        description: lang === 'ar' ? 'لم يتم تحديث حالة الطلب' : 'Could not update status',
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("photo", file);
      return apiRequest(`/api/technician/orders/${id}/complete`, 'POST', form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/technician/orders'] });
      toast({
        title: lang === 'ar' ? 'تم الإنهاء' : 'Completed',
        description: lang === 'ar' ? 'تم إنهاء الطلب بنجاح' : 'Order completed',
      });
    },
    onError: (error) => {
      console.error("[TECH][UI][COMPLETE][ERROR]", error);
      toast({
        title: lang === 'ar' ? 'تعذر حفظ الإنهاء الآن' : 'Completion not synced',
        description: lang === 'ar'
          ? 'تم تحديث الواجهة، وسيتم المزامنة لاحقاً.'
          : 'UI updated; sync will be retried later.',
      });
    },
  });

  const handleAccept = (id: string) => {
    acceptMutation.mutate(id);
  };

  const handleDecline = (id: string) => {
    rejectMutation.mutate(id);
  };

  const handleStatusChange = (id: string, status: string) => {
    statusMutation.mutate({ id, status });
  };

  const handleComplete = (id: string, file: File) => {
    setOptimisticStatuses((prev) => ({ ...prev, [id]: 'completed' }));
    completeMutation.mutate({ id, file });
  };

  if (techLoading) {
    return (
      <PageBackground>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageBackground>
    );
  }

  if (!technician) {
    return (
      <PageBackground>
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center bg-black/50 backdrop-blur-md border border-white/10 shadow-2xl">
            <CardHeader>
              <Wrench className="w-16 h-16 mx-auto text-primary mb-4" />
              <CardTitle className="text-white">{t.notRegistered}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={() => window.location.href = '/technician/register'} data-testid="button-register-technician">
                {t.registerNow}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageBackground>
    );
  }

  if (approvalStatus === 'pending') {
    return (
      <PageBackground>
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center bg-black/50 backdrop-blur-md border border-white/10 shadow-2xl">
            <CardHeader>
              <Clock className="w-16 h-16 mx-auto text-primary mb-4" />
              <CardTitle className="text-white">{t.pendingApproval}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-white/80">{t.waitingApproval}</p>
            </CardContent>
          </Card>
        </div>
      </PageBackground>
    );
  }

  if (approvalStatus === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <CardTitle>{lang === 'ar' ? 'تم رفض الطلب' : 'Application Rejected'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{lang === 'ar' ? 'يرجى التواصل مع الدعم لمزيد من التفاصيل' : 'Please contact support for details.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isApprovedStatus && isActive === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <XCircle className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle>{lang === 'ar' ? 'الحساب موقوف مؤقتاً' : 'Account Suspended'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{lang === 'ar' ? 'يرجى التواصل مع الإدارة لإعادة التفعيل' : 'Please contact admin to reactivate your account.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingRequests = effectiveRequests.filter(r => ['pending', 'assigned', 'created'].includes(r.status || ''));
  const inProgressRequests = effectiveRequests.filter(r =>
    ['accepted', 'on_the_way', 'working', 'in_progress'].includes(r.status || ''),
  );
  const completedRequests = effectiveRequests.filter(r => r.status === 'completed');
  const isActionBusy =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    statusMutation.isPending ||
    completeMutation.isPending;

  return (
    <PageBackground>
      <main className="p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col gap-3 bg-muted/60 border rounded-xl px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              <Label className="text-sm font-medium">
                {isOnline ? t.online : t.offline}
              </Label>
            </div>
            <div className="flex items-center gap-1 rounded-full border bg-background/80 p-1">
              <Button
                type="button"
                size="sm"
                variant={isOnline ? "default" : "ghost"}
                disabled={availabilityMutation.isPending}
                onClick={() => {
                  if (isOnline) return;
                  availabilityMutation.mutate(true, {
                    onSuccess: (data: any) => {
                      const online = String(data?.status || "").toLowerCase() === "online";
                      setIsOnline(online);
                      if (online) {
                        sendLocationUpdate();
                      }
                    },
                  });
                }}
                data-testid="button-online"
                className="rounded-full px-4"
              >
                {t.online}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isOnline ? "default" : "ghost"}
                disabled={availabilityMutation.isPending}
                onClick={() => {
                  if (!isOnline) return;
                  availabilityMutation.mutate(false, {
                    onSuccess: (data: any) => {
                      const online = String(data?.status || "").toLowerCase() === "online";
                      setIsOnline(online);
                    },
                  });
                }}
                data-testid="button-offline"
                className="rounded-full px-4"
              >
                {t.offline}
              </Button>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'new' | 'progress' | 'done')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="new" data-testid="tab-new-requests">
                {t.newRequests} ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="progress" data-testid="tab-in-progress">
                {t.inProgress} ({inProgressRequests.length})
              </TabsTrigger>
              <TabsTrigger value="done" data-testid="tab-completed">
                {t.completed} ({completedRequests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-4 mt-4">
              {pendingRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t.noRequests}</p>
              ) : (
                pendingRequests.map(request => (
                  <ServiceRequestCard 
                    key={request.id} 
                    {...request} 
                    onAccept={handleAccept}
                    onDecline={handleDecline}
                    onStatusChange={handleStatusChange}
                    onComplete={handleComplete}
                    isBusy={isActionBusy}
                    lang={lang as 'ar' | 'en'}
                    technicianCoords={technicianCoords}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="progress" className="space-y-4 mt-4">
              {inProgressRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t.noRequests}</p>
              ) : (
                inProgressRequests.map(request => (
                  <ServiceRequestCard 
                    key={request.id} 
                    {...request}
                    onStatusChange={handleStatusChange}
                    onComplete={handleComplete}
                    isBusy={isActionBusy}
                    lang={lang as 'ar' | 'en'}
                    technicianCoords={technicianCoords}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="done" className="space-y-4 mt-4">
              {completedRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">{t.noRequests}</p>
              ) : (
                completedRequests.map(request => (
                  <ServiceRequestCard 
                    key={request.id} 
                    {...request}
                    isBusy={isActionBusy}
                    lang={lang as 'ar' | 'en'}
                    technicianCoords={technicianCoords}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </PageBackground>
  );
}
