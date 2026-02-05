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
    return isAvailable && !!biometryType && biometryType !== "none";
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
    const normalized: BiometryType =
      biometryType === "face" || biometryType === "fingerprint" ? biometryType : "none";
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
    const exists = await NativeBiometric.credentialsExist({
      server: BIOMETRIC_SERVICE,
      username: BIOMETRIC_ACCOUNT,
    });
    return exists;
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
    const exists = await NativeBiometric.credentialsExist({
      server: BIOMETRIC_SERVICE,
      username: BIOMETRIC_ACCOUNT,
    });
    if (exists) {
      await NativeBiometric.deleteCredentials({
        server: BIOMETRIC_SERVICE,
        username: BIOMETRIC_ACCOUNT,
      });
      console.log("[Biometric] Credentials deleted");
    }
    await setBiometricOptIn(false);
  } catch (err) {
    console.warn("[Biometric] Disable failed", err);
  }
}

export async function restoreBiometricSession(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const available = await isBiometricAvailable();
    if (!available) return false;

    const exists = await NativeBiometric.credentialsExist({
      server: BIOMETRIC_SERVICE,
      username: BIOMETRIC_ACCOUNT,
    });
    if (!exists) {
      console.log("[Biometric] No stored credentials");
      return false;
    }

    const verified = await NativeBiometric.verifyIdentity({
      reason: "Unlock Cycle Care",
      title: "Biometric Login",
      subtitle: "",
    });
    if (!verified) {
      console.warn("[Biometric] Verification failed or cancelled");
      return false;
    }

    const { password } = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVICE,
      username: BIOMETRIC_ACCOUNT,
    });
    if (!password) {
      console.warn("[Biometric] No password found in credentials");
      return false;
    }

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
