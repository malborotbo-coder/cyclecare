import { Capacitor, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiRequest } from "./queryClient";

const PERMISSION_FLAG_KEY = "permissions_requested";
const PUSH_PERMISSION_FLAG_KEY = "push_permissions_requested";
const PUSH_TOKEN_KEY = "push_token";
const FCM_TOKEN_KEY = "fcm_token";
const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log("[Permissions]", ...args);
  }
};
let pushListenersReady = false;

type FcmPlugin = {
  getToken: () => Promise<{ token?: string }>;
};

const getFcmPlugin = () => registerPlugin<FcmPlugin>("FCM");

async function sendPushTokenToServer(token: string, tokenType: "apns" | "fcm") {
  try {
    await apiRequest("/api/push/register", "POST", {
      token,
      tokenType,
      platform,
    });
    console.log("[Push] Token registered on server:", tokenType);
  } catch (error: any) {
    console.warn("[Push] Failed to register token on server:", {
      tokenType,
      message: error?.message,
    });
  }
}

async function setupPushListeners() {
  if (pushListenersReady) return;
  pushListenersReady = true;

  await PushNotifications.addListener("registration", async (token) => {
    const tokenType = platform === "ios" ? "apns" : "fcm";
    const label = tokenType === "apns" ? "APNs" : "FCM";
    console.log(`[Push] ${label} token:`, token.value);
    await Preferences.set({ key: PUSH_TOKEN_KEY, value: token.value });
    await sendPushTokenToServer(token.value, tokenType);
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.log("[Push] Registration error:", error);
  });

  await PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[Push] Received notification:", notification);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("push:received", { detail: notification }));
    }
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[Push] Action performed:", action);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("push:action", { detail: action }));
    }
  });
}

async function fetchAndStoreFcmToken() {
  try {
    const fcm = getFcmPlugin();
    if (!fcm?.getToken) return null;
    const result = await fcm.getToken();
    const token = result?.token || null;
    if (token) {
      console.log("[Push] FCM token:", token);
      await Preferences.set({ key: FCM_TOKEN_KEY, value: token });
      await sendPushTokenToServer(token, "fcm");
    }
    return token;
  } catch (err) {
    console.log("[Push] FCM token unavailable:", err);
    return null;
  }
}

export async function printPushDiagnostics() {
  if (!isNative) {
    console.log("[Push] Diagnostics: not running on native.");
    return;
  }
  const permissionStatus = await PushNotifications.checkPermissions();
  const apns = await Preferences.get({ key: PUSH_TOKEN_KEY });
  const fcm = await Preferences.get({ key: FCM_TOKEN_KEY });
  console.log("[Push] Diagnostics:", {
    platform,
    permission: permissionStatus.receive,
    apnsToken: apns.value || null,
    fcmToken: fcm.value || null,
  });
}

export async function initializePushNotificationsOnce() {
  if (!isNative) return;

  try {
    await setupPushListeners();
    const { value } = await Preferences.get({ key: PUSH_PERMISSION_FLAG_KEY });
    const requestedBefore = value === "true";

    const cachedApns = await Preferences.get({ key: PUSH_TOKEN_KEY });
    if (cachedApns.value) {
      console.log("[Push] APNs token (cached):", cachedApns.value);
      const cachedType = platform === "ios" ? "apns" : "fcm";
      await sendPushTokenToServer(cachedApns.value, cachedType);
    }
    const cachedFcm = await Preferences.get({ key: FCM_TOKEN_KEY });
    if (cachedFcm.value) {
      console.log("[Push] FCM token (cached):", cachedFcm.value);
      await sendPushTokenToServer(cachedFcm.value, "fcm");
    }

    let permissionStatus = await PushNotifications.checkPermissions();
    if (permissionStatus.receive !== "granted" && !requestedBefore) {
      permissionStatus = await PushNotifications.requestPermissions();
    }

    if (permissionStatus.receive === "granted") {
      await PushNotifications.register();
      await fetchAndStoreFcmToken();
    } else {
      console.log("[Push] Permission not granted:", permissionStatus.receive);
    }

    await Preferences.set({ key: PUSH_PERMISSION_FLAG_KEY, value: "true" });
  } catch (err) {
    console.log("[Push] Permission flow error:", err);
    try {
      await Preferences.set({ key: PUSH_PERMISSION_FLAG_KEY, value: "true" });
    } catch {
      // Ignore storage failures; do not crash the flow
    }
  }
}

export async function requestNativePermissionsOnce() {
  if (!isNative) return;

  try {
    const { value } = await Preferences.get({ key: PERMISSION_FLAG_KEY });
    if (value === "true") {
      return;
    }

    try {
      const cameraResult = await Camera.requestPermissions({
        permissions: ["camera", "photos"],
      });
      devLog("Camera permissions:", cameraResult);
    } catch (err) {
      devLog("Camera permission error:", err);
    }

    try {
      const locationResult = await Geolocation.requestPermissions();
      devLog("Location permissions:", locationResult);
    } catch (err) {
      devLog("Location permission error:", err);
    }

    await initializePushNotificationsOnce();

    await Preferences.set({ key: PERMISSION_FLAG_KEY, value: "true" });
  } catch (err) {
    devLog("Permission flow error:", err);
    try {
      await Preferences.set({ key: PERMISSION_FLAG_KEY, value: "true" });
    } catch {
      // Ignore storage failures; do not crash the flow
    }
  }
}
