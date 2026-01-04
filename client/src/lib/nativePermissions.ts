import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";

const PERMISSION_FLAG_KEY = "permissions_requested";
const isNative = Capacitor.isNativePlatform();
const devLog = (...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log("[Permissions]", ...args);
  }
};

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
