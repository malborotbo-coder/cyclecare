import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";
import { persistAuthTokens } from "./authStorage";

const BIOMETRIC_SERVICE = "cyclecare_biometric";
const BIOMETRIC_ACCOUNT = "auth_session";
const BIOMETRIC_OPT_IN_KEY = "biometric_opt_in";

export type BiometryType = "face" | "fingerprint" | "none";

export type BiometricStatus = {
  isAvailable: boolean;
  biometryType: BiometryType;
  isEnabled: boolean;
};

const isNative = () => Capacitor.isNativePlatform();

const normalizeBiometryType = (value: unknown): BiometryType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "none";
  if (
    raw === "face" ||
    raw === "faceid" ||
    raw === "face_id" ||
    raw === "face-id" ||
    raw === "face id"
  ) {
    return "face";
  }
  if (
    raw === "fingerprint" ||
    raw === "touchid" ||
    raw === "touch_id" ||
    raw === "touch-id" ||
    raw === "touch id" ||
    raw === "finger"
  ) {
    return "fingerprint";
  }
  return "none";
};

const extractBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return false;
  const mapped = value as Record<string, unknown>;
  if (typeof mapped.credentials === "boolean") return mapped.credentials;
  if (typeof mapped.exists === "boolean") return mapped.exists;
  if (typeof mapped.available === "boolean") return mapped.available;
  if (typeof mapped.isAvailable === "boolean") return mapped.isAvailable;
  if (typeof mapped.verified === "boolean") return mapped.verified;
  if (typeof mapped.success === "boolean") return mapped.success;
  return false;
};

const hasStoredCredentials = async (): Promise<boolean> => {
  try {
    const result = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVICE,
    } as any);
    return Boolean((result as any)?.password);
  } catch {
    return false;
  }
};

const readOptIn = async (): Promise<boolean> => {
  if (isNative()) {
    try {
      const { value } = await Preferences.get({ key: BIOMETRIC_OPT_IN_KEY });
      if (value != null) return value === "true";
    } catch {
      // Ignore preference read errors.
    }
  }
  if (typeof localStorage !== "undefined") {
    const value = localStorage.getItem(BIOMETRIC_OPT_IN_KEY);
    if (value != null) return value === "true";
  }
  return false;
};

const writeOptIn = async (enabled: boolean) => {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(BIOMETRIC_OPT_IN_KEY, enabled ? "true" : "false");
  }
  if (isNative()) {
    try {
      await Preferences.set({ key: BIOMETRIC_OPT_IN_KEY, value: enabled ? "true" : "false" });
    } catch {
      // Ignore preference write errors.
    }
  }
};

export async function getBiometricOptIn(): Promise<boolean> {
  return readOptIn();
}

export async function setBiometricOptIn(enabled: boolean): Promise<void> {
  await writeOptIn(enabled);
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { isAvailable, biometryType } = await NativeBiometric.isAvailable();
    const normalized = normalizeBiometryType(biometryType);
    return Boolean(isAvailable) && normalized !== "none";
  } catch (err) {
    console.warn("[Biometric] Availability check failed", err);
    return false;
  }
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  if (!isNative()) {
    return { isAvailable: false, biometryType: "none", isEnabled: false };
  }
  try {
    const { isAvailable, biometryType } = await NativeBiometric.isAvailable();
    const normalized = normalizeBiometryType(biometryType);
    const enabled = await isBiometricEnabled();
    return {
      isAvailable: Boolean(isAvailable) && normalized !== "none",
      biometryType: normalized,
      isEnabled: enabled,
    };
  } catch (err) {
    console.warn("[Biometric] Status check failed", err);
    return { isAvailable: false, biometryType: "none", isEnabled: false };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return await hasStoredCredentials();
  } catch (err) {
    console.warn("[Biometric] Check enabled failed", err);
    return false;
  }
}

export async function enableBiometricSession(token: string): Promise<boolean> {
  if (!isNative()) return false;
  if (!(await isBiometricAvailable())) return false;
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Cycle Care",
      title: "Biometric Login",
      subtitle: "",
    });
    await NativeBiometric.setCredentials({
      username: BIOMETRIC_ACCOUNT,
      password: token,
      server: BIOMETRIC_SERVICE,
    });
    await setBiometricOptIn(true);
    console.log("[Biometric] Credentials stored");
    return true;
  } catch (err) {
    console.warn("[Biometric] Enable failed", err);
    return false;
  }
}

export async function disableBiometricSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const exists = await hasStoredCredentials();
    if (exists) {
      await NativeBiometric.deleteCredentials({
        server: BIOMETRIC_SERVICE,
      });
      console.log("[Biometric] Credentials deleted");
    }
    await setBiometricOptIn(false);
  } catch (err) {
    console.warn("[Biometric] Disable failed", err);
  }
}

export async function restoreBiometricSession(): Promise<boolean> {
  if (!isNative()) {
    console.info("[Biometric] Restore skipped: web platform");
    return false;
  }
  try {
    const optedIn = await getBiometricOptIn();
    console.info("[Biometric] Restore start", { native: true, optedIn });
    if (!optedIn) {
      console.info("[Biometric] Restore skipped: opt-in disabled");
      return false;
    }

    const available = await isBiometricAvailable();
    if (!available) {
      console.info("[Biometric] Restore skipped: biometrics unavailable");
      return false;
    }

    const exists = await hasStoredCredentials();
    console.info("[Biometric] Secure token check", { exists });
    if (!exists) {
      console.log("[Biometric] No stored credentials");
      return false;
    }

    console.info("[Biometric] Prompting device biometrics");
    const verifiedResult = await NativeBiometric.verifyIdentity({
      reason: "Unlock Cycle Care",
      title: "Biometric Login",
      subtitle: "",
    });
    const verified =
      typeof verifiedResult === "undefined" ? true : extractBoolean(verifiedResult);
    if (!verified) {
      console.warn("[Biometric] Verification failed or cancelled");
      return false;
    }

    const { password } = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVICE,
    });
    if (!password) {
      console.warn("[Biometric] No password found in credentials");
      return false;
    }

    console.info("[Biometric] Verification success; restoring auth token");
    await persistAuthTokens({ authToken: password, firebaseToken: password });
    console.log("[Biometric] Session restored from secure storage");
    return true;
  } catch (err) {
    console.warn("[Biometric] Restore failed", err);
    return false;
  }
}

export async function promptBiometricEnrollment(token: string, isArabic?: boolean) {
  if (!isNative()) return;
  const optedIn = await getBiometricOptIn();
  if (!optedIn) return;
  const available = await isBiometricAvailable();
  const enabled = await isBiometricEnabled();
  if (!available || enabled) return;
  console.log("[Biometric] Prompting enrollment after successful login");
  const shouldEnable = window.confirm(
    isArabic ? "تفعيل الدخول بالبصمة / Face ID؟" : "Enable Face ID / Touch ID?"
  );
  if (shouldEnable) {
    console.log("[Biometric] Enrollment accepted");
    await enableBiometricSession(token);
  } else {
    console.log("[Biometric] Enrollment skipped by user");
  }
}
