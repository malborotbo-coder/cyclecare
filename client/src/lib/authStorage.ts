import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const AUTH_TOKEN_KEY = "auth_token";
const PHONE_SESSION_KEY = "phone_session";
const PHONE_USER_ID_KEY = "phone_user_id";
const PHONE_NUMBER_KEY = "phone_number";
const FIREBASE_TOKEN_KEY = "firebase_token";
const REMEMBER_ME_KEY = "remember_me_enabled";
const AUTH_TOKEN_UPDATED_EVENT = "auth-token-updated";
const TOKEN_KEYS = [
  AUTH_TOKEN_KEY,
  PHONE_SESSION_KEY,
  PHONE_USER_ID_KEY,
  PHONE_NUMBER_KEY,
  FIREBASE_TOKEN_KEY,
];

type AuthTokenUpdateAction = "persisted" | "cleared";

const dispatchAuthTokenUpdated = (action: AuthTokenUpdateAction) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_TOKEN_UPDATED_EVENT, { detail: { action } }));
};

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";
const canUseSessionStorage = () => typeof sessionStorage !== "undefined";
const canUseLocalStorage = () => typeof localStorage !== "undefined";
const isSessionStorageWritable = () => {
  if (!canUseSessionStorage()) return false;
  const probeKey = "__cyclecare_session_probe__";
  try {
    sessionStorage.setItem(probeKey, "1");
    sessionStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
};

const safeGetStorageItem = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorageItem = (storage: Storage, key: string, value: string): boolean => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeRemoveStorageItem = (storage: Storage, key: string): boolean => {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const readRuntimeStorage = (key: string) => {
  if (canUseSessionStorage()) {
    const sessionValue = safeGetStorageItem(sessionStorage, key);
    if (sessionValue) return sessionValue;
  }
  if (canUseLocalStorage()) {
    return safeGetStorageItem(localStorage, key);
  }
  return null;
};

const removeRuntimeStorage = (key: string) => {
  if (canUseSessionStorage()) {
    safeRemoveStorageItem(sessionStorage, key);
  }
  if (canUseLocalStorage()) {
    safeRemoveStorageItem(localStorage, key);
  }
};

const persistRuntimeStorage = (key: string, value: string, remember: boolean) => {
  let storedInSession = false;
  if (canUseSessionStorage()) {
    storedInSession = safeSetStorageItem(sessionStorage, key, value);
  }
  // Always fall back to local storage if session storage is not writable.
  if ((remember || !storedInSession) && canUseLocalStorage()) {
    safeSetStorageItem(localStorage, key, value);
  } else if (!remember && canUseLocalStorage()) {
    safeRemoveStorageItem(localStorage, key);
  }
};

export const isRememberMeEnabled = () => {
  return true;
};

export const setRememberMeEnabled = (value: boolean) => {
  if (!canUseLocalStorage()) return;
  // Remember-me toggle is disabled in current release; keep durable auth behavior always on.
  if (!value) {
    safeRemoveStorageItem(localStorage, REMEMBER_ME_KEY);
    return;
  }
  safeSetStorageItem(localStorage, REMEMBER_ME_KEY, "true");
};

const readPreference = async (key: string): Promise<string | null> => {
  if (!isNative) return null;
  try {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch (err) {
    console.warn("[AuthStorage] Failed to read preference", key, err);
    return null;
  }
};

const setPreference = async (key: string, value: string) => {
  if (!isNative) return;
  try {
    await Preferences.set({ key, value });
  } catch (err) {
    console.warn("[AuthStorage] Failed to set preference", key, err);
  }
};

const removePreference = async (key: string) => {
  if (!isNative) return;
  try {
    await Preferences.remove({ key });
  } catch (err) {
    console.warn("[AuthStorage] Failed to remove preference", key, err);
  }
};

export async function persistAuthTokens(options: {
  authToken: string;
  phoneSession?: string;
  phoneUserId?: string;
  phoneNumber?: string;
  firebaseToken?: string;
  remember?: boolean;
}) {
  const { authToken, phoneSession, phoneUserId, phoneNumber, firebaseToken, remember } = options;
  const shouldRemember = remember ?? isRememberMeEnabled();

  if (authToken) {
    persistRuntimeStorage(AUTH_TOKEN_KEY, authToken, shouldRemember);
    if (shouldRemember) {
      await setPreference(AUTH_TOKEN_KEY, authToken);
    } else {
      await removePreference(AUTH_TOKEN_KEY);
    }
  }

  if (phoneSession) {
    persistRuntimeStorage(PHONE_SESSION_KEY, phoneSession, shouldRemember);
    if (shouldRemember) {
      await setPreference(PHONE_SESSION_KEY, phoneSession);
    } else {
      await removePreference(PHONE_SESSION_KEY);
    }
  }

  if (phoneUserId) {
    persistRuntimeStorage(PHONE_USER_ID_KEY, phoneUserId, shouldRemember);
    if (shouldRemember) {
      await setPreference(PHONE_USER_ID_KEY, phoneUserId);
    } else {
      await removePreference(PHONE_USER_ID_KEY);
    }
  }

  if (phoneNumber) {
    persistRuntimeStorage(PHONE_NUMBER_KEY, phoneNumber, shouldRemember);
    if (shouldRemember) {
      await setPreference(PHONE_NUMBER_KEY, phoneNumber);
    } else {
      await removePreference(PHONE_NUMBER_KEY);
    }
  }

  if (typeof firebaseToken === "string") {
    persistRuntimeStorage(FIREBASE_TOKEN_KEY, firebaseToken, shouldRemember);
    if (shouldRemember) {
      await setPreference(FIREBASE_TOKEN_KEY, firebaseToken);
    } else {
      await removePreference(FIREBASE_TOKEN_KEY);
    }
  }

  if (!shouldRemember && isSessionStorageWritable()) {
    TOKEN_KEYS.forEach((key) => {
      if (canUseLocalStorage()) {
        safeRemoveStorageItem(localStorage, key);
      }
    });
  }

  dispatchAuthTokenUpdated("persisted");
}

export async function clearAuthTokens(options?: { emitEvent?: boolean }) {
  TOKEN_KEYS.forEach(removeRuntimeStorage);

  await removePreference(AUTH_TOKEN_KEY);
  await removePreference(PHONE_SESSION_KEY);
  await removePreference(PHONE_USER_ID_KEY);
  await removePreference(PHONE_NUMBER_KEY);
  await removePreference(FIREBASE_TOKEN_KEY);

  if (options?.emitEvent !== false) {
    dispatchAuthTokenUpdated("cleared");
  }
}

export async function syncAuthTokensFromPreferences() {
  if (!isNative) return readRuntimeStorage(AUTH_TOKEN_KEY);
  if (!isRememberMeEnabled()) {
    return readRuntimeStorage(AUTH_TOKEN_KEY);
  }

  try {
    let syncedAuthToken: string | null = null;

    for (const key of TOKEN_KEYS) {
      const value = await readPreference(key);
      if (!value) continue;

      if (canUseLocalStorage()) {
        safeSetStorageItem(localStorage, key, value);
      }
      if (canUseSessionStorage()) {
        safeSetStorageItem(sessionStorage, key, value);
      }
      if (key === AUTH_TOKEN_KEY) {
        syncedAuthToken = value;
      }
    }

    return syncedAuthToken;
  } catch (err) {
    console.warn("[AuthStorage] Failed to sync preferences", err);
    return null;
  }
}

export async function getBestAuthToken(): Promise<string | null> {
  const runtimeToken =
    readRuntimeStorage(AUTH_TOKEN_KEY) ||
    readRuntimeStorage(PHONE_SESSION_KEY) ||
    readRuntimeStorage(FIREBASE_TOKEN_KEY);
  if (runtimeToken) return runtimeToken;

  // Native: prefer Capacitor Preferences, fallback to in-memory/localStorage
  if (isNative && isRememberMeEnabled()) {
    const keys = [AUTH_TOKEN_KEY, PHONE_SESSION_KEY, FIREBASE_TOKEN_KEY];
    for (const key of keys) {
      const value = await readPreference(key);
      if (value) {
        if (canUseLocalStorage()) {
          safeSetStorageItem(localStorage, key, value);
        }
        if (canUseSessionStorage()) {
          safeSetStorageItem(sessionStorage, key, value);
        }
        return value;
      }
    }
  }

  return null;
}

export async function getAuthToken(): Promise<string | null> {
  const runtimeValue = readRuntimeStorage(AUTH_TOKEN_KEY);
  if (runtimeValue) return runtimeValue;

  if (isNative && isRememberMeEnabled()) {
    const value = await readPreference(AUTH_TOKEN_KEY);
    if (value) {
      if (canUseLocalStorage()) {
        safeSetStorageItem(localStorage, AUTH_TOKEN_KEY, value);
      }
      if (canUseSessionStorage()) {
        safeSetStorageItem(sessionStorage, AUTH_TOKEN_KEY, value);
      }
      return value;
    }
  }
  return null;
}
