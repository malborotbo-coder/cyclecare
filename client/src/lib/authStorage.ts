import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const AUTH_TOKEN_KEY = "auth_token";
const PHONE_SESSION_KEY = "phone_session";
const PHONE_USER_ID_KEY = "phone_user_id";
const PHONE_NUMBER_KEY = "phone_number";
const FIREBASE_TOKEN_KEY = "firebase_token";

const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";

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
}) {
  const { authToken, phoneSession, phoneUserId, phoneNumber, firebaseToken } = options;

  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    await setPreference(AUTH_TOKEN_KEY, authToken);
  }

  if (phoneSession) {
    localStorage.setItem(PHONE_SESSION_KEY, phoneSession);
    await setPreference(PHONE_SESSION_KEY, phoneSession);
  }

  if (phoneUserId) {
    localStorage.setItem(PHONE_USER_ID_KEY, phoneUserId);
    await setPreference(PHONE_USER_ID_KEY, phoneUserId);
  }

  if (phoneNumber) {
    localStorage.setItem(PHONE_NUMBER_KEY, phoneNumber);
    await setPreference(PHONE_NUMBER_KEY, phoneNumber);
  }

  if (typeof firebaseToken === "string") {
    localStorage.setItem(FIREBASE_TOKEN_KEY, firebaseToken);
    await setPreference(FIREBASE_TOKEN_KEY, firebaseToken);
  }

  window.dispatchEvent(new CustomEvent("auth-token-updated"));
}

export async function clearAuthTokens() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(PHONE_SESSION_KEY);
  localStorage.removeItem(PHONE_USER_ID_KEY);
  localStorage.removeItem(PHONE_NUMBER_KEY);
  localStorage.removeItem(FIREBASE_TOKEN_KEY);

  await removePreference(AUTH_TOKEN_KEY);
  await removePreference(PHONE_SESSION_KEY);
  await removePreference(PHONE_USER_ID_KEY);
  await removePreference(PHONE_NUMBER_KEY);
  await removePreference(FIREBASE_TOKEN_KEY);

  window.dispatchEvent(new CustomEvent("auth-token-updated"));
}

export async function syncAuthTokensFromPreferences() {
  if (!isNative) return null;

  try {
    const keys = [
      AUTH_TOKEN_KEY,
      PHONE_SESSION_KEY,
      PHONE_USER_ID_KEY,
      PHONE_NUMBER_KEY,
      FIREBASE_TOKEN_KEY,
    ];

    let syncedAuthToken: string | null = null;

    for (const key of keys) {
      const { value } = await Preferences.get({ key });
      if (value) {
        localStorage.setItem(key, value);
        if (key === AUTH_TOKEN_KEY) {
          syncedAuthToken = value;
        }
      }
    }

    return syncedAuthToken;
  } catch (err) {
    console.warn("[AuthStorage] Failed to sync preferences", err);
    return null;
  }
}

export async function getBestAuthToken(): Promise<string | null> {
  // Native: prefer preference, fallback to localStorage
  if (isNative) {
    try {
      const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
      if (value) {
        localStorage.setItem(AUTH_TOKEN_KEY, value);
        return value;
      }
    } catch (err) {
      console.warn("[AuthStorage] Failed to read native auth token", err);
    }
  }

  // Web fallback order
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem(PHONE_SESSION_KEY) ||
    localStorage.getItem(FIREBASE_TOKEN_KEY)
  );
}
