import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
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

const readPermissionFlag = async () => {
  try {
    if (typeof Preferences?.get === "function") {
      const { value } = await Preferences.get({ key: PERMISSION_FLAG_KEY });
      if (value === "true") return true;
    }
  } catch {
    // Ignore storage failures; do not block app startup.
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(PERMISSION_FLAG_KEY) === "true";
  }
  return false;
};

const writePermissionFlag = async () => {
  try {
    if (typeof Preferences?.set === "function") {
      await Preferences.set({ key: PERMISSION_FLAG_KEY, value: "true" });
      return;
    }
  } catch {
    // Ignore storage failures; do not block app startup.
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(PERMISSION_FLAG_KEY, "true");
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readOneSignalState = async () => {
  const os = safeGetOneSignal();
  const user = os?.User;
  let state: any = null;
  if (typeof user?.getState === "function") {
    try {
      state = await user.getState();
    } catch {
      state = null;
    }
  }

  let onesignalId = state?.onesignalId ?? user?.onesignalId ?? user?.id ?? null;
  let subscriptionId = state?.pushSubscription?.id ?? user?.pushSubscription?.id ?? null;
  let token = state?.pushSubscription?.token ?? user?.pushSubscription?.token ?? null;
  let optedIn = state?.pushSubscription?.optedIn ?? user?.pushSubscription?.optedIn ?? null;

  if ((!onesignalId || !subscriptionId || !token || optedIn == null) && typeof os?.getDeviceState === "function") {
    try {
      const deviceState = await os.getDeviceState();
      onesignalId = onesignalId ?? deviceState?.userId ?? null;
      subscriptionId = subscriptionId ?? deviceState?.pushSubscription?.id ?? deviceState?.userId ?? null;
      token = token ?? deviceState?.pushToken ?? null;
      if (optedIn == null) {
        optedIn = deviceState?.isSubscribed ?? null;
      }
    } catch {
      // Ignore device state failures; do not block app startup.
    }
  }

  return { onesignalId, subscriptionId, token, optedIn };
};

const waitForOneSignalReady = async (options?: { timeoutMs?: number; intervalMs?: number }) => {
  const timeoutMs = options?.timeoutMs ?? 12000;
  const intervalMs = options?.intervalMs ?? 300;
  const start = Date.now();
  let lastState: Awaited<ReturnType<typeof readOneSignalState>> | null = null;

  while (Date.now() - start < timeoutMs) {
    lastState = await readOneSignalState();
    const ready =
      Boolean(lastState.onesignalId) &&
      (Boolean(lastState.subscriptionId) || Boolean(lastState.token) || lastState.optedIn === true);
    if (ready) {
      return { ...lastState, ready: true, waitedMs: Date.now() - start };
    }
    await sleep(intervalMs);
  }

  return {
    ...(lastState || { onesignalId: null, subscriptionId: null, token: null, optedIn: null }),
    ready: false,
    waitedMs: Date.now() - start,
  };
};

export const requestNotificationPermissionOnce = async (trigger: "login" | "home") => {
  if (!isNative || platform !== "ios") return;
  const os = safeGetOneSignal();
  if (!os?.Notifications?.requestPermission) return;

  const current = normalizePermissionStatus(await readPermissionStatus());
  console.log("[Push][Permission]", { trigger, status: current });

  const alreadyRequested = await readPermissionFlag();
  if (alreadyRequested && current !== "not_determined" && current !== "unknown") {
    return;
  }

  if (current === "granted" || current === "denied") {
    await writePermissionFlag();
    if (current === "denied") {
      console.log("[Push][Permission] Notifications are denied. Enable them in iOS Settings.");
    }
    return;
  }

  if (current !== "not_determined" && current !== "unknown") {
    return;
  }

  try {
    const granted = await os.Notifications.requestPermission(true);
    const resolved = normalizePermissionStatus(granted ?? (await readPermissionStatus()));
    console.log("[Push][Permission]", { trigger, status: resolved });
    if (resolved === "granted" || resolved === "denied") {
      await writePermissionFlag();
      if (resolved === "denied") {
        console.log("[Push][Permission] Notifications are denied. Enable them in iOS Settings.");
      }
    }
  } catch {
    // Fail silently; do not block app startup.
  }
};

export const printOneSignalDiagnostics = async (context: string) => {
  if (!isNative) return;
  const os = safeGetOneSignal();
  if (!os) return;

  const permission = normalizePermissionStatus(await readPermissionStatus());
  const { onesignalId, subscriptionId, token, optedIn } = await readOneSignalState();
  const readyState = {
    hasOneSignalId: Boolean(onesignalId),
    hasPushSubscriptionId: Boolean(subscriptionId),
    hasPushToken: Boolean(token),
    optedIn: optedIn === true,
  };

  console.log("[OneSignal][Diagnostics]", {
    context,
    permission,
    pushSubscriptionId: subscriptionId,
    pushSubscriptionToken: token,
    pushSubscriptionOptedIn: optedIn,
    onesignalId,
    readyState,
    environmentNote: "TestFlight builds use production APNs.",
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

  await initializeOneSignalOnce();

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

  const readiness = await waitForOneSignalReady();
  if (!readiness.ready) {
    await printOneSignalDiagnostics("login-timeout");
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

  await printOneSignalDiagnostics("after-login");

  const id = subscriptionId || readiness.subscriptionId || (await resolveSubscriptionId()) || readiness.onesignalId;
  if (id) {
    await registerDevice(userId, id);
  }
};
