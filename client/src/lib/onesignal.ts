import { Capacitor } from "@capacitor/core";
import OneSignal from "onesignal-cordova-plugin";
import { apiRequest } from "@/lib/queryClient";

const APP_ID = "c8da7e2f-2129-4ce4-8d15-e9489ac0d125";
const PERMISSION_FLAG_KEY = "notifications_permission_requested";

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();

let initialized = false;
let subscriptionId: string | null = null;
let lastRegisteredKey: string | null = null;
let lastLoggedInUser: string | null = null;
let registerInFlight = false;
let observerAttached = false;

const getPlatformLabel = () => (platform === "ios" ? "ios" : "android");

const safeGetOneSignal = () => (OneSignal as any);

const updateSubscriptionId = (value?: string | null) => {
  if (!value || value === subscriptionId) return;
  subscriptionId = value;
  if (lastLoggedInUser) {
    void registerDevice(lastLoggedInUser, value);
  }
};

const resolveSubscriptionId = async () => {
  try {
    const os = safeGetOneSignal();
    let id = os?.User?.pushSubscription?.id;
    if (!id && typeof os?.getDeviceState === "function") {
      const state = await os.getDeviceState();
      id = state?.userId || state?.pushSubscription?.id || null;
    }
    updateSubscriptionId(id);
    return id || null;
  } catch {
    return subscriptionId;
  }
};

const attachSubscriptionObserver = () => {
  if (observerAttached) return;
  const os = safeGetOneSignal();
  const subscription = os?.User?.pushSubscription;
  if (!subscription?.addObserver) return;
  observerAttached = true;
  subscription.addObserver((event: any) => {
    const id = event?.current?.id || subscription.id;
    updateSubscriptionId(id);
  });
};

const readPermissionStatus = async () => {
  try {
    const os = safeGetOneSignal();
    const statusSource = os?.Notifications?.permissionStatus;
    if (typeof statusSource === "function") {
      return await statusSource();
    }
    return statusSource ?? null;
  } catch {
    return null;
  }
};

const normalizePermissionStatus = (value: any) => {
  const raw = typeof value === "string" ? value : value?.permissionStatus ?? value?.status ?? value?.toString?.();
  const status = String(raw || "").toLowerCase();
  if (status.includes("grant")) return "granted";
  if (status.includes("deny")) return "denied";
  if (status.includes("not") && status.includes("determin")) return "not_determined";
  if (status === "0" || status === "false") return "not_determined";
  return status || "unknown";
};

export const requestNotificationPermissionOnce = async (trigger: "login" | "home") => {
  if (!isNative || platform !== "ios") return;
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(PERMISSION_FLAG_KEY) === "true") return;
  const os = safeGetOneSignal();
  if (!os?.Notifications?.requestPermission) return;

  const current = normalizePermissionStatus(await readPermissionStatus());
  console.log("[Push][Permission]", { trigger, status: current });

  if (current === "granted" || current === "denied") {
    localStorage.setItem(PERMISSION_FLAG_KEY, "true");
    return;
  }

  try {
    const granted = await os.Notifications.requestPermission(true);
    const resolved = normalizePermissionStatus(granted ?? (await readPermissionStatus()));
    console.log("[Push][Permission]", { trigger, status: resolved });
  } catch {
    // Fail silently; do not block app startup.
  } finally {
    localStorage.setItem(PERMISSION_FLAG_KEY, "true");
  }
};

export const printOneSignalDiagnostics = async (context: string) => {
  if (!isNative) return;
  const os = safeGetOneSignal();
  if (!os) return;

  const permission = normalizePermissionStatus(await readPermissionStatus());
  const subscription = os?.User?.pushSubscription;
  let deviceState: any = null;
  if (typeof os?.getDeviceState === "function") {
    try {
      deviceState = await os.getDeviceState();
    } catch {
      deviceState = null;
    }
  }

  const subscriptionId = subscription?.id ?? deviceState?.pushSubscription?.id ?? deviceState?.userId ?? null;
  const subscriptionToken = subscription?.token ?? deviceState?.pushToken ?? null;
  const optedIn = subscription?.optedIn ?? deviceState?.isSubscribed ?? null;
  const onesignalId = os?.User?.onesignalId ?? os?.User?.id ?? deviceState?.userId ?? null;
  const apnsEnvGuess = import.meta.env.DEV ? "sandbox" : "production";

  console.log("[OneSignal][Diagnostics]", {
    context,
    permission,
    pushSubscriptionId: subscriptionId,
    pushSubscriptionToken: subscriptionToken,
    pushSubscriptionOptedIn: optedIn,
    onesignalId,
    apnsEnvironment: apnsEnvGuess,
    platform: getPlatformLabel(),
  });
};

export const initializeOneSignalOnce = async () => {
  if (!isNative || initialized) return;
  const os = safeGetOneSignal();
  if (!os) return;
  initialized = true;

  try {
    if (typeof os.initialize === "function") {
      os.initialize(APP_ID);
    } else if (typeof os.setAppId === "function") {
      os.setAppId(APP_ID);
    }
  } catch {
    // Ignore init failures; do not block app startup.
  }

  attachSubscriptionObserver();
  await resolveSubscriptionId();
};

const registerDevice = async (userId: string, providerId: string) => {
  const key = `${userId}:${providerId}`;
  if (registerInFlight || key === lastRegisteredKey) return;
  registerInFlight = true;
  try {
    await apiRequest("/api/push/register", "POST", {
      userId,
      provider: "onesignal",
      providerId,
      platform: getPlatformLabel(),
    });
    lastRegisteredKey = key;
  } catch {
    // Backend is not updated yet; fail silently.
  } finally {
    registerInFlight = false;
  }
};

export const syncOneSignalUser = async (userId: string | null | undefined) => {
  if (!isNative) return;
  const os = safeGetOneSignal();
  if (!os) return;

  if (!initialized) {
    await initializeOneSignalOnce();
  }

  if (!userId) {
    if (lastLoggedInUser && typeof os.logout === "function") {
      try {
        await os.logout();
      } catch {
        // Ignore logout failures.
      }
      lastLoggedInUser = null;
      lastRegisteredKey = null;
    }
    return;
  }

  if (userId !== lastLoggedInUser && typeof os.login === "function") {
    try {
      await os.login(userId);
    } catch {
      // Ignore login failures.
    }
    lastLoggedInUser = userId;
  }

  const id = subscriptionId || (await resolveSubscriptionId());
  if (id) {
    await registerDevice(userId, id);
  }
};
