import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseTimestamp } from "@/lib/date";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { hasStoredAuthTokenSync } from "@/lib/authSession";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  emoji?: string | null;
  type?: string | null;
  role?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt?: string | null;
};

const typeEmojiFallback: Record<string, string> = {
  admin_broadcast: "📣",
  order_status: "✅",
  maintenance_near: "🔧",
  maintenance_overdue: "⚠️",
};

const formatTimeAgo = (value?: string | null, lang?: string) => {
  if (!value) return lang === "ar" ? "الآن" : "Just now";
  const date = parseTimestamp(value);
  if (!date) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (lang === "ar") {
    if (minutes < 1) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${days} يوم`;
  }
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
};

export default function NotificationsPage() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { user, isGuest, authReady } = useFirebaseAuth();
  const canCallProtectedEndpoints =
    authReady && Boolean(user) && !isGuest && hasStoredAuthTokenSync();
  const notificationScope = String(location || "").toLowerCase().startsWith("/technician")
    ? "technician"
    : "customer";

  const { data: notifications, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications", notificationScope],
    queryFn: () => apiRequest(`/api/notifications?scope=${notificationScope}`, "GET"),
    enabled: canCallProtectedEndpoints,
  });

  const unreadCount = useMemo(
    () => (Array.isArray(notifications) ? notifications.filter((n) => !n.readAt).length : 0),
    [notifications],
  );

  const markAllMutation = useMutation({
    mutationFn: async () => {
      if (!canCallProtectedEndpoints) return null;
      return apiRequest("/api/notifications/mark-read", "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
    onError: () => {
      toast({
        title: lang === "ar" ? "تعذر تحديث الإشعارات" : "Failed to update notifications",
        variant: "destructive",
      });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canCallProtectedEndpoints) return null;
      return apiRequest(`/api/notifications/${id}/read`, "PATCH");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const handleOpen = (notification: NotificationItem) => {
    if (!canCallProtectedEndpoints) return;
    if (!notification.readAt) {
      markOneMutation.mutate(notification.id);
    }
    if (notification.entityType === "service_request") {
      const isTechnician =
        notification.role === "technician" ||
        notification.type === "technician_update";
      const target = isTechnician ? "/technician" : "/orders";
      setLocation(target);
    }
  };

  const title = lang === "ar" ? "الإشعارات" : "Notifications";
  const emptyLabel = lang === "ar" ? "لا توجد إشعارات حالياً." : "No notifications yet.";

  return (
    <div className="container mx-auto px-4 pb-10 max-w-3xl">
      <Card className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-border/60 shadow-xl">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? "آخر التحديثات المرسلة لك." : "Latest updates sent to you."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Badge className="bg-primary text-white">
                {lang === "ar" ? `غير مقروء ${unreadCount}` : `${unreadCount} unread`}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={!canCallProtectedEndpoints || markAllMutation.isPending || unreadCount === 0}
            >
              {lang === "ar" ? "تعليم الكل كمقروء" : "Mark all read"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">
              {lang === "ar" ? "جاري تحميل الإشعارات..." : "Loading notifications..."}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">{emptyLabel}</div>
          ) : (
            <ScrollArea className="h-[70vh]">
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const emoji =
                    notification.emoji ||
                    (notification.type ? typeEmojiFallback[notification.type] : null) ||
                    "🔔";
                  const isUnread = !notification.readAt;
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleOpen(notification)}
                      className={`w-full text-left rounded-2xl border p-4 transition ${
                        isUnread
                          ? "border-primary/60 bg-primary/5 shadow-md"
                          : "border-border/60 bg-white/80 dark:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-2xl">
                          {emoji}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{notification.title}</p>
                            {isUnread && (
                              <span className="text-[11px] rounded-full bg-primary text-white px-2 py-0.5">
                                {lang === "ar" ? "جديد" : "NEW"}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{notification.message}</p>
                          <div className="text-xs text-muted-foreground">
                            {formatTimeAgo(notification.createdAt, lang)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
