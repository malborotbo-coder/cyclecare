import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import {
  PushNotifications,
  type PushNotificationSchema,
  type ActionPerformed,
  type Token,
} from "@capacitor/push-notifications";
import { buildApiUrl } from "@/lib/apiConfig";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { getBestAuthToken } from "@/lib/authStorage";
import { hasStoredAuthTokenSync } from "@/lib/authSession";

const TOKEN_STORAGE_KEY = "push_device_token";
const TOKEN_TYPE_STORAGE_KEY = "push_device_token_type";
const PENDING_TOKEN_KEY = "push_pending_token";
const PENDING_TOKEN_TYPE_KEY = "push_pending_token_type";
const PERMISSION_FLAG_KEY = "push_permission_requested";
const DEVICE_ID_KEY = "push_device_id";
const ROLE_STORAGE_KEY = "push_device_role";
const BACKEND_REGISTERED_KEY = "push_backend_registered";

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
const environment = import.meta.env.PROD ? "production" : "development";
const debugPush =
  typeof window !== "undefined" &&
  (import.meta.env.DEV || localStorage.getItem("debug_push") === "true");
const maskToken = (value?: string | null) =>
  value ? `${value.slice(0, 8)}...${value.slice(-4)}` : null;
const REGISTRATION_RETRY_DELAY_MS = 3500;
const MAX_REGISTRATION_RETRIES = 3;

let initialized = false;
let listenersAttached = false;
let registerCalled = false;
let registerInFlight = false;
let cachedToken: string | null = null;
let cachedDeviceId: string | null = null;
let lastSentToken: string | null = null;
let lastSentUserId: string | null = null;
let lastSentRole: string | null = null;
let authListenerAttached = false;
let registrationAllowed = false;
let currentUserId: string | null = null;
let currentRole: string | null = null;
let roleUserId: string | null = null;
let cachedAppVersion: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;

type ForegroundHandler = (notification: PushNotificationSchema) => void;
type TapHandler = (action: ActionPerformed) => void;

const foregroundHandlers = new Set<ForegroundHandler>();
const tapHandlers = new Set<TapHandler>();

const getTokenType = () => (platform === "ios" ? "apns" : "fcm");

const normalizeRole = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "rider") return "customer";
  if (raw === "customer" || raw === "technician" || raw === "admin") return raw;
  return null;
};

const readStoredValue = async (key: string) => {
  try {
    const { value } = await Preferences.get({ key });
    if (value) return value;
  } catch {
    // Ignore storage failures; do not block app startup.
  }
  if (typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return null;
};

const writeStoredValue = async (key: string, value: string) => {
  try {
    await Preferences.set({ key, value });
    return;
  } catch {
    // Ignore storage failures; do not block app startup.
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  }
};

const ensureCachedToken = async () => {
  if (cachedToken) return cachedToken;
  cachedToken = await readStoredValue(TOKEN_STORAGE_KEY);
  return cachedToken;
};

const ensureDeviceId = async () => {
  if (cachedDeviceId) return cachedDeviceId;
  const stored = await readStoredValue(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await writeStoredValue(DEVICE_ID_KEY, generated);
  cachedDeviceId = generated;
  return generated;
};

const resolveRoleForRegistration = async () => {
  if (currentRole) return currentRole;
  if (!hasStoredAuthTokenSync()) return null;
  const stored = await readStoredValue(ROLE_STORAGE_KEY);
  if (stored) {
    const normalized = normalizeRole(stored);
    if (normalized) {
      currentRole = normalized;
      return normalized;
    }
  }
  try {
    const res = await fetchWithFirebaseAuth(buildApiUrl("/api/roles/me"), { method: "GET" });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const roles = Array.isArray(data?.roles) ? data.roles : [];
      const role = data?.isAdmin
        ? "admin"
        : roles.includes("technician")
        ? "technician"
        : "customer";
      const normalized = normalizeRole(role);
      currentRole = normalized;
      if (normalized) {
        await writeStoredValue(ROLE_STORAGE_KEY, normalized);
      }
      return normalized;
    }
  } catch (error) {
    if (debugPush) {
      console.log("[Push][Role] Failed to fetch roles:", error);
    }
  }
  return null;
};

const persistPendingToken = async (token: string, tokenType: string) => {
  await writeStoredValue(PENDING_TOKEN_KEY, token);
  await writeStoredValue(PENDING_TOKEN_TYPE_KEY, tokenType);
};

const clearPendingToken = async () => {
  await writeStoredValue(PENDING_TOKEN_KEY, "");
  await writeStoredValue(PENDING_TOKEN_TYPE_KEY, "");
};

const sendRegisterRequest = async (payload: {
  token: string;
  tokenType: string;
  platform: string;
  deviceId?: string | null;
  appVersion?: string | null;
  role?: string | null;
}) => {
  console.log("[Push][Register][Request]", {
    userId: currentUserId,
    role: payload.role ?? null,
    tokenType: payload.tokenType,
    tokenPreview: maskToken(payload.token),
    platform: payload.platform,
    environment,
    deviceId: payload.deviceId ?? null,
  });
  const res = await fetchWithFirebaseAuth(buildApiUrl("/api/push/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: payload.token,
      tokenType: payload.tokenType,
      platform: payload.platform,
      deviceId: payload.deviceId ?? null,
      appVersion: payload.appVersion ?? null,
      environment,
      role: payload.role ?? null,
    }),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.message || `push_register_failed_${res.status}`);
  }
  return res.json().catch(() => ({}));
};

const registerDeviceToken = async (token: string, userId: string, role?: string | null) => {
  if (currentUserId && userId !== currentUserId) {
    if (debugPush) {
      console.log("[Push][Token] Skipped stale registration attempt", {
        targetUserId: userId,
        activeUserId: currentUserId,
        tokenPreview: maskToken(token),
      });
    }
    return;
  }
  if (
    !token ||
    !userId ||
    !hasStoredAuthTokenSync() ||
    registerInFlight ||
    (token === lastSentToken && userId === lastSentUserId && role === lastSentRole)
  )
    return;
  registerInFlight = true;
  try {
    const info = cachedAppVersion
      ? { version: cachedAppVersion }
      : await App.getInfo().catch(() => ({ version: null }));
    cachedAppVersion = info?.version || cachedAppVersion;
    const deviceId = await ensureDeviceId();
    const resolvedRole = role || currentRole || (await resolveRoleForRegistration());
    console.log("[Push][Token] Register attempt", {
      userId,
      roleRequested: role ?? null,
      roleResolved: resolvedRole ?? null,
      tokenPreview: maskToken(token),
      retryCount,
    });
    await sendRegisterRequest({
      token,
      tokenType: getTokenType(),
      platform,
      deviceId,
      appVersion: cachedAppVersion || null,
      role: resolvedRole,
    });
    lastSentToken = token;
    lastSentUserId = userId;
    lastSentRole = resolvedRole || null;
    await writeStoredValue(TOKEN_STORAGE_KEY, token);
    await writeStoredValue(TOKEN_TYPE_STORAGE_KEY, getTokenType());
    await writeStoredValue(BACKEND_REGISTERED_KEY, "true");
    await clearPendingToken();
    retryCount = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    console.log("[Push][Token] Registered on backend.");
  } catch (error) {
    await writeStoredValue(BACKEND_REGISTERED_KEY, "");
    console.log("[Push][Token] Registration failed:", error);
    if (registrationAllowed && currentUserId === userId && retryCount < MAX_REGISTRATION_RETRIES) {
      retryCount += 1;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void registerDeviceToken(token, userId, currentRole);
      }, REGISTRATION_RETRY_DELAY_MS);
      if (debugPush) {
        console.log("[Push][Token] Scheduled retry", {
          retryCount,
          delayMs: REGISTRATION_RETRY_DELAY_MS,
          userId,
          tokenPreview: maskToken(token),
        });
      }
    }
  } finally {
    registerInFlight = false;
  }
};

const handleToken = async (tokenValue: string) => {
  cachedToken = tokenValue;
  console.log("[Push][Token] Received", {
    tokenPreview: maskToken(tokenValue),
    platform,
    environment,
  });
  await writeStoredValue(TOKEN_STORAGE_KEY, tokenValue);
  await writeStoredValue(TOKEN_TYPE_STORAGE_KEY, getTokenType());
  await writeStoredValue(BACKEND_REGISTERED_KEY, "");
  if (!registrationAllowed || !currentUserId) {
    if (debugPush) {
      console.log("[Push] Skipped: no auth session yet");
    }
    await persistPendingToken(tokenValue, getTokenType());
    return;
  }
  await registerDeviceToken(tokenValue, currentUserId, currentRole);
};

const attachListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  PushNotifications.addListener("registration", (token: Token) => {
    void handleToken(token.value);
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.log("[Push][Error] Registration error:", error);
  });

  PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
    if (debugPush) {
      console.log("[Push][Received]", notification);
    }
    foregroundHandlers.forEach((handler) => handler(notification));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("push:received", { detail: notification }));
    }
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    if (debugPush) {
      console.log("[Push][Action]", action);
    }
    tapHandlers.forEach((handler) => handler(action));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("push:action", { detail: action }));
    }
  });
};

const requestPermissionAndRegister = async () => {
  if (!isNative) return;

  const permissionFlag = await readStoredValue(PERMISSION_FLAG_KEY);
  const status = await PushNotifications.checkPermissions();
  let currentStatus = status.receive;
  console.log("[Push][Permission]", {
    status: currentStatus,
    platform,
    permissionRequestedBefore: permissionFlag === "true",
  });

  if (currentStatus === "prompt" && permissionFlag !== "true") {
    const requested = await PushNotifications.requestPermissions();
    currentStatus = requested.receive;
    console.log("[Push][Permission]", { status: currentStatus, requestTriggered: true });
    if (currentStatus === "granted" || currentStatus === "denied") {
      await writeStoredValue(PERMISSION_FLAG_KEY, "true");
    }
    if (currentStatus === "granted") {
      console.log("[Push][Permission] Granted.");
    }
    if (currentStatus !== "granted") return;
  }

  if (currentStatus === "denied") {
    console.log("[Push][Permission] Denied; enable in Settings.");
    await writeStoredValue(PERMISSION_FLAG_KEY, "true");
    return;
  }

  if (currentStatus === "granted" && !registerCalled) {
    registerCalled = true;
    try {
      console.log("[Push] Registering device with APNs/FCM.");
      await PushNotifications.register();
    } catch (error) {
      registerCalled = false;
      console.log("[Push][Error] Native register call failed:", error);
    }
  }
};

const ensureAndroidNotificationChannels = async () => {
  if (!isNative || platform !== "android") return;
  try {
    await PushNotifications.createChannel({
      id: "technician_alerts",
      name: "طلبات الفني",
      description: "تنبيهات الطلبات الجديدة للفني",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
    await PushNotifications.createChannel({
      id: "customer_updates",
      name: "تحديثات الطلبات",
      description: "تحديثات حالة الطلب للعميل",
      importance: 4,
      visibility: 1,
      sound: "default",
      vibration: true,
      lights: true,
    });
  } catch (error) {
    if (debugPush) {
      console.log("[Push][Channel] Failed to create Android channels:", error);
    }
  }
};

export const initializePushManagerOnce = async () => {
  if (!isNative || initialized) return;
  initialized = true;
  console.info("[Push] Init start", {
    platform,
    environment,
    debugPush,
    provider: "capacitor_push_notifications_apns_fcm",
  });
  attachListeners();
  if (!authListenerAttached && typeof window !== "undefined") {
    authListenerAttached = true;
    window.addEventListener("auth-token-updated", (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      if (detail?.action === "cleared") {
        registrationAllowed = false;
        currentUserId = null;
        currentRole = null;
        roleUserId = null;
        return;
      }
      if (currentUserId) {
        void syncPushRegistrationOnLogin(currentUserId);
      }
    });
  }
  await ensureAndroidNotificationChannels();
  await requestPermissionAndRegister();
  if (debugPush) {
    console.info("[Push] Init done", { registerCalled });
  }
};

export const onForegroundNotification = (handler: ForegroundHandler) => {
  foregroundHandlers.add(handler);
  return () => foregroundHandlers.delete(handler);
};

export const onNotificationTap = (handler: TapHandler) => {
  tapHandlers.add(handler);
  return () => tapHandlers.delete(handler);
};

export const syncPushRegistrationOnLogin = async (userId?: string | null) => {
  registrationAllowed = Boolean(userId);
  currentUserId = userId ?? null;
  currentRole = null;
  if (currentUserId && roleUserId && currentUserId !== roleUserId) {
    await writeStoredValue(ROLE_STORAGE_KEY, "");
  }
  roleUserId = currentUserId;
  if (!registrationAllowed || !currentUserId || !hasStoredAuthTokenSync()) return;
  const pendingToken = await readStoredValue(PENDING_TOKEN_KEY);
  const token = await ensureCachedToken();
  const effectiveToken = pendingToken || token;
  if (effectiveToken) {
    const role = await resolveRoleForRegistration();
    await registerDeviceToken(effectiveToken, currentUserId, role);
    // Safe delayed retry to cover auth/role readiness races during startup.
    setTimeout(() => {
      if (!currentUserId || !registrationAllowed) return;
      if (currentUserId !== userId) return;
      void registerDeviceToken(effectiveToken, currentUserId, currentRole);
    }, 1800);
  }
};

export const setPushRoleContext = async (role?: string | null) => {
  const normalized = normalizeRole(role);
  if (normalized === currentRole) return;
  currentRole = normalized;
  if (currentUserId) {
    roleUserId = currentUserId;
  }
  await writeStoredValue(ROLE_STORAGE_KEY, normalized ?? "");
  if (!registrationAllowed || !currentUserId) return;
  const pendingToken = await readStoredValue(PENDING_TOKEN_KEY);
  const token = await ensureCachedToken();
  const effectiveToken = pendingToken || token;
  if (effectiveToken) {
    await registerDeviceToken(effectiveToken, currentUserId, normalized);
  }
};

export const unregisterPushToken = async (userId?: string | null) => {
  const effectiveUserId = userId || currentUserId;
  if (!effectiveUserId) {
    console.log("[Push][Unregister] Skipped: no authenticated user.");
    return;
  }

  const token = await getBestAuthToken();
  if (!token) {
    console.log("[Push][Unregister] Skipped: missing auth token.");
    return;
  }

  const deviceId = await ensureDeviceId();
  try {
    await fetchWithFirebaseAuth(buildApiUrl("/api/push/unregister"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        deviceId,
        platform,
        tokenType: getTokenType(),
      }),
    });
    lastSentToken = null;
    lastSentUserId = null;
    lastSentRole = null;
    currentRole = null;
    roleUserId = null;
    await writeStoredValue(ROLE_STORAGE_KEY, "");
    await clearPendingToken();
    await writeStoredValue(BACKEND_REGISTERED_KEY, "");
  } catch (error) {
    console.log("[Push][Unregister] Failed:", error);
  }
};
