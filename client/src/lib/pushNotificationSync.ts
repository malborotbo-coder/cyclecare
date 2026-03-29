import { queryClient } from "@/lib/queryClient";
import { onForegroundNotification, onNotificationTap } from "@/lib/pushManager";
import { handleLiveActivityForRequest, handleLiveActivityFromPush } from "@/lib/liveActivity";
import { hasStoredAuthTokenSync } from "@/lib/authSession";

type NotificationData = {
  type?: string | null;
  role?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  activityType?: string | null;
  activityId?: string | null;
  activityState?: string | null;
};

const getLanguage = (): "ar" | "en" => {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem("language");
    if (saved === "en") return "en";
  }
  return "ar";
};

const isOrderNotification = (data?: NotificationData | null) => {
  if (!data) return false;
  if (data.activityType === "order_tracking") return true;
  if (data.type === "order_update") return true;
  return data.entityType === "service_request";
};

const refreshNotifications = () => {
  if (!hasStoredAuthTokenSync()) return;
  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
};

const refreshServiceRequests = async () => {
  if (!hasStoredAuthTokenSync()) return [];
  queryClient.invalidateQueries({ queryKey: ["/api/service-requests?mine=true"] });
  try {
    const data = await queryClient.fetchQuery({ queryKey: ["/api/service-requests?mine=true"] });
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.log("[LiveActivity] Failed to fetch service requests:", error);
    return [];
  }
};

const resolveNotificationTarget = (data?: NotificationData | null) => {
  if (!data) return null;
  if (data.role === "technician" || data.type === "technician_update" || data.activityType === "technician_route") {
    return "/technician";
  }
  if (isOrderNotification(data)) {
    return "/orders";
  }
  return null;
};

const navigateTo = (path: string) => {
  if (typeof window === "undefined") return;
  if (!path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

let initialized = false;

export const initializeNotificationSyncOnce = () => {
  if (initialized) return;
  initialized = true;

  const handleOrderUpdate = async (data?: NotificationData | null, title?: string | null, body?: string | null) => {
    if (!isOrderNotification(data)) return;
    const orderId = data?.activityId || data?.entityId || null;
    if (!orderId) return;
    const activityState = data?.activityState || (data as any)?.activity_state || null;
    const isTrackingUpdate = data?.activityType === "order_tracking" && Boolean(activityState);
    if (!isTrackingUpdate) return;
    await handleLiveActivityFromPush({
      orderId,
      activityState,
      title,
      body,
      lang: getLanguage(),
    });
    void refreshServiceRequests()
      .then((requests) => {
        const request = requests.find((item) => String(item?.id) === String(orderId));
        if (request) {
          return handleLiveActivityForRequest(request, getLanguage());
        }
        return null;
      })
      .catch(() => null);
  };

  onForegroundNotification((notification) => {
    refreshNotifications();
    const raw = (notification as any)?.data;
    const data = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as
      | NotificationData
      | undefined;
    void handleOrderUpdate(data, (notification as any)?.title, (notification as any)?.body);
  });
  onNotificationTap((action) => {
    refreshNotifications();
    const raw = (action as any)?.notification?.data;
    const data = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as
      | NotificationData
      | undefined;
    void handleOrderUpdate(data, (action as any)?.notification?.title, (action as any)?.notification?.body);
    const target = resolveNotificationTarget(data);
    if (target) {
      navigateTo(target);
    }
  });
};
