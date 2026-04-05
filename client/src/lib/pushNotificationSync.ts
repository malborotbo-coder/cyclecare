import { queryClient } from "@/lib/queryClient";
import { onForegroundNotification, onNotificationTap } from "@/lib/pushManager";
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

  onForegroundNotification((notification) => {
    refreshNotifications();
    const raw = (notification as any)?.data;
    const data = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as
      | NotificationData
      | undefined;
    if (isOrderNotification(data)) {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests?mine=true"] });
    }
  });
  onNotificationTap((action) => {
    refreshNotifications();
    const raw = (action as any)?.notification?.data;
    const data = (typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw) as
      | NotificationData
      | undefined;
    if (isOrderNotification(data)) {
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests?mine=true"] });
    }
    const target = resolveNotificationTarget(data);
    if (target) {
      navigateTo(target);
    }
  });
};
