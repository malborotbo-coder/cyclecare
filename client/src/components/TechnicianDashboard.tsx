import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, Clock, Phone, CheckCircle, XCircle, Home, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ServiceRequest, Technician } from "@shared/schema";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

interface ServiceRequestCardProps extends ServiceRequest {
  onAccept?: (id: string) => void;
  onDecline?: (id: string) => void;
  lang: 'ar' | 'en';
}

function ServiceRequestCard({ id, userId, serviceType, location, notes, status, createdAt, onAccept, onDecline, lang }: ServiceRequestCardProps) {
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
      accepted: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress',
      in_progress: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress',
      completed: lang === 'ar' ? 'مكتمل' : 'Completed',
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <Card className={`border-r-4 ${status === 'pending' ? 'border-r-primary' : status === 'accepted' || status === 'in_progress' ? 'border-r-blue-500' : 'border-r-green-500'}`}>
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
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{formatTime(createdAt)}</span>
        </div>
        {notes && (
          <div className="text-sm text-muted-foreground bg-muted p-2 rounded-md">
            {notes}
          </div>
        )}
        
        {status === 'pending' && (
          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={() => onAccept?.(id)}
              data-testid={`button-accept-${id}`}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              {lang === 'ar' ? 'قبول' : 'Accept'}
            </Button>
            <Button 
              variant="outline"
              onClick={() => onDecline?.(id)}
              data-testid={`button-decline-${id}`}
            >
              <XCircle className="w-4 h-4 ml-2" />
              {lang === 'ar' ? 'رفض' : 'Decline'}
            </Button>
          </div>
        )}
        
        {(status === 'accepted' || status === 'in_progress') && (
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

  const { data: technician, isLoading: techLoading } = useQuery<Technician>({
    queryKey: ['/api/technicians/me'],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (data) => {
      const status = (data as any)?.status;
      if (!data || status === "pending") return 15000;
      return false;
    },
  });
  const status = (technician as any)?.status;
  const isActive = (technician as any)?.is_active ?? (technician as any)?.isActive;
  const currentAvailability = (technician as any)?.is_available ?? (technician as any)?.isAvailable;
  const isApprovedStatus = ["approved", "online", "offline"].includes(status);

  const { data: requests = [], isLoading: reqLoading } = useQuery<ServiceRequest[]>({
    queryKey: ['/api/technician/orders'],
    enabled: isApprovedStatus && isActive === true,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const safeRequests = Array.isArray(requests) ? requests : [];

  const availabilityMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return apiRequest('/api/technicians/me/availability', 'PATCH', { is_available: next });
    },
    onSuccess: (updated: any) => {
      setIsOnline(!!updated?.is_available);
      queryClient.invalidateQueries({ queryKey: ['/api/technicians/me'] });
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
      setIsOnline(!!currentAvailability);
    }
  }, [technician, availabilityMutation.isPending, currentAvailability]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/service-requests/${id}`, 'PATCH', { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/technician/orders'] });
      toast({
        title: lang === 'ar' ? 'تم التحديث' : 'Updated',
        description: lang === 'ar' ? 'تم تحديث حالة الطلب' : 'Request status updated',
      });
    },
  });

  const handleAccept = (id: string) => {
    updateStatus.mutate({ id, status: 'accepted' });
  };

  const handleDecline = (id: string) => {
    updateStatus.mutate({ id, status: 'cancelled' });
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

  if (status === 'pending') {
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

  if (status === 'rejected') {
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

  const pendingRequests = safeRequests.filter(r => r.status === 'pending');
  const inProgressRequests = safeRequests.filter(r => r.status === 'accepted' || r.status === 'in_progress');
  const completedRequests = safeRequests.filter(r => r.status === 'completed');

  return (
    <PageBackground>
      <main className="p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 bg-muted/60 border rounded-md px-4 py-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="online-switch" className="text-sm">
                {isOnline ? t.online : t.offline}
              </Label>
            </div>
            <Switch 
              id="online-switch"
              checked={isOnline}
              disabled={availabilityMutation.isPending}
              onCheckedChange={(checked) => {
                const previous = isOnline;
                availabilityMutation.mutate(checked, {
                  onSuccess: (data: any) => setIsOnline(!!data?.is_available),
                  onError: () => setIsOnline(previous),
                });
              }}
              data-testid="switch-online-status"
            />
          </div>

          <Tabs defaultValue="new" className="w-full">
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
                    lang={lang as 'ar' | 'en'}
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
                    lang={lang as 'ar' | 'en'}
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
                    lang={lang as 'ar' | 'en'}
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
