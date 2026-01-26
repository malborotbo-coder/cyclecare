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
import { getAuthToken } from "@/lib/authStorage";

const TOKEN_STORAGE_KEY = "push_device_token";
const TOKEN_TYPE_STORAGE_KEY = "push_device_token_type";
const PENDING_TOKEN_KEY = "push_pending_token";
const PENDING_TOKEN_TYPE_KEY = "push_pending_token_type";
const PERMISSION_FLAG_KEY = "push_permission_requested";

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
const environment = import.meta.env.PROD ? "production" : "development";

let initialized = false;
let listenersAttached = false;
let registerCalled = false;
let registerInFlight = false;
let cachedToken: string | null = null;
let lastSentToken: string | null = null;
let lastSentUserId: string | null = null;
let authListenerAttached = false;
let registrationAllowed = false;
let currentUserId: string | null = null;
let cachedAppVersion: string | null = null;

type ForegroundHandler = (notification: PushNotificationSchema) => void;
type TapHandler = (action: ActionPerformed) => void;

const foregroundHandlers = new Set<ForegroundHandler>();
const tapHandlers = new Set<TapHandler>();

const getTokenType = () => (platform === "ios" ? "apns" : "fcm");

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
  authToken: string;
}) => {
  const res = await fetch(buildApiUrl("/api/push/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.authToken}`,
    },
    body: JSON.stringify({
      token: payload.token,
      tokenType: payload.tokenType,
      platform: payload.platform,
      deviceId: payload.deviceId ?? null,
      environment,
    }),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody?.message || `push_register_failed_${res.status}`);
  }
  return res.json().catch(() => ({}));
};

const registerDeviceToken = async (token: string, userId: string) => {
  if (
    !token ||
    !userId ||
    registerInFlight ||
    (token === lastSentToken && userId === lastSentUserId)
  )
    return;
  const authToken = await getAuthToken();
  if (!authToken) {
    console.log("[Push] Skipped: no auth token yet");
    await persistPendingToken(token, getTokenType());
    return;
  }
  registerInFlight = true;
  try {
    const info = cachedAppVersion
      ? { version: cachedAppVersion }
      : await App.getInfo().catch(() => ({ version: null }));
    cachedAppVersion = info?.version || cachedAppVersion;
    await sendRegisterRequest({
      token,
      tokenType: getTokenType(),
      platform,
      deviceId: null,
      authToken,
    });
    lastSentToken = token;
    lastSentUserId = userId;
    await writeStoredValue(TOKEN_STORAGE_KEY, token);
    await writeStoredValue(TOKEN_TYPE_STORAGE_KEY, getTokenType());
    await clearPendingToken();
    console.log("[Push][Token] Registered on backend.");
  } catch (error) {
    console.log("[Push][Token] Registration failed:", error);
  } finally {
    registerInFlight = false;
  }
};

const handleToken = async (tokenValue: string) => {
  cachedToken = tokenValue;
  console.log("[Push][Token] Received:", tokenValue);
  await writeStoredValue(TOKEN_STORAGE_KEY, tokenValue);
  await writeStoredValue(TOKEN_TYPE_STORAGE_KEY, getTokenType());
  const authToken = await getAuthToken();
  if (!authToken) {
    console.log("[Push] Skipped: no auth token yet");
    await persistPendingToken(tokenValue, getTokenType());
    return;
  }
  if (registrationAllowed && currentUserId) {
    await registerDeviceToken(tokenValue, currentUserId);
  }
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
    console.log("[Push][Received]", notification);
    foregroundHandlers.forEach((handler) => handler(notification));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("push:received", { detail: notification }));
    }
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
    console.log("[Push][Action]", action);
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
  console.log("[Push][Permission]", { status: currentStatus });

  if (currentStatus === "prompt" && permissionFlag !== "true") {
    const requested = await PushNotifications.requestPermissions();
    currentStatus = requested.receive;
    console.log("[Push][Permission]", { status: currentStatus });
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
    console.log("[Push] Registering device with APNs/FCM.");
    await PushNotifications.register();
  }
};

export const initializePushManagerOnce = async () => {
  if (!isNative || initialized) return;
  initialized = true;
  attachListeners();
  if (!authListenerAttached && typeof window !== "undefined") {
    authListenerAttached = true;
    window.addEventListener("auth-token-updated", () => {
      if (currentUserId) {
        void syncPushRegistrationOnLogin(currentUserId);
      }
    });
  }
  await requestPermissionAndRegister();
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
  if (!registrationAllowed || !currentUserId) return;
  const authToken = await getAuthToken();
  if (!authToken) {
    console.log("[Push] Skipped: no auth token yet");
    return;
  }
  const pendingToken = await readStoredValue(PENDING_TOKEN_KEY);
  const token = await ensureCachedToken();
  const effectiveToken = pendingToken || token;
  if (effectiveToken) {
    await registerDeviceToken(effectiveToken, currentUserId);
  }
};
