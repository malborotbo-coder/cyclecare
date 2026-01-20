import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { PushNotifications } from "@capacitor/push-notifications";

const PERMISSION_FLAG_KEY = "permissions_requested";
const PUSH_PERMISSION_FLAG_KEY = "push_permissions_requested";
const PUSH_TOKEN_KEY = "push_token";
const isNative = Capacitor.isNativePlatform();
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log("[Permissions]", ...args);
  }
};
let pushListenersReady = false;

async function setupPushListeners() {
  if (pushListenersReady) return;
  pushListenersReady = true;

  await PushNotifications.addListener("registration", async (token) => {
    devLog("Push token:", token.value);
    await Preferences.set({ key: PUSH_TOKEN_KEY, value: token.value });
    // TODO: Send token to the server using your existing device-token endpoint.
  });

  await PushNotifications.addListener("registrationError", (error) => {
    devLog("Push registration error:", error);
  });
}

export async function initializePushNotificationsOnce() {
  if (!isNative) return;
  if (Capacitor.getPlatform() !== "ios") return;

  try {
    const { value } = await Preferences.get({ key: PUSH_PERMISSION_FLAG_KEY });
    if (value === "true") {
      return;
    }

    await setupPushListeners();

    let permissionStatus = await PushNotifications.checkPermissions();
    if (permissionStatus.receive !== "granted") {
      permissionStatus = await PushNotifications.requestPermissions();
    }

    if (permissionStatus.receive === "granted") {
      await PushNotifications.register();
    } else {
      devLog("Push permission not granted:", permissionStatus.receive);
    }

    await Preferences.set({ key: PUSH_PERMISSION_FLAG_KEY, value: "true" });
  } catch (err) {
    devLog("Push permission flow error:", err);
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
