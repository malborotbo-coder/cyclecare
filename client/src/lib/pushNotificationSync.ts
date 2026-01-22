import { queryClient } from "@/lib/queryClient";
import { onForegroundNotification, onNotificationTap } from "@/lib/pushManager";

let initialized = false;

export const initializeNotificationSyncOnce = () => {
  if (initialized) return;
  initialized = true;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  onForegroundNotification(refresh);
  onNotificationTap(refresh);
};
