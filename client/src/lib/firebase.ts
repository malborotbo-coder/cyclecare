import { initializeApp } from "firebase/app";
import { getAuth, indexedDBLocalPersistence, browserLocalPersistence, initializeAuth, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyDWNlm0_J4TCkxgClw9xQId62OctYDszdU",
  authDomain: "cyclecare-aa686.firebaseapp.com",
  projectId: "cyclecare-aa686",
  storageBucket: "cyclecare-aa686.firebasestorage.app",
  messagingSenderId: "129179738500",
  appId: "1:129179738500:web:31c32a5c0d1289bc6cbdd1",
  measurementId: "G-7M5F3G89CZ"
};

export const app = initializeApp(firebaseConfig);
const platform = Capacitor.getPlatform();
const isNative = platform === "android" || platform === "ios";

// Detect iOS/Safari for special handling
const isIOS = () => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return true;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isSafari = () => {
  const ua = navigator.userAgent;
  return /^((?!chrome|android).)*safari/i.test(ua);
};

export const isIOSOrSafari = () => isIOS() || isSafari();

// Use indexedDB persistence for Safari/iOS web only. Native WebViews struggle with IndexedDB,
// so we fall back to local storage there and persist API tokens via Capacitor Preferences.
let auth: ReturnType<typeof getAuth>;
try {
  if (isNative) {
    auth = initializeAuth(app, {
      persistence: [browserLocalPersistence]
    });
  } else if (isIOSOrSafari()) {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  } else {
    auth = getAuth(app);
  }
} catch (e) {
  // If auth already initialized, get existing instance
  auth = getAuth(app);
}

export { auth };

let authReadyPromise: Promise<FirebaseUser | null> | null = null;

export function waitForAuthReady(): Promise<FirebaseUser | null> {
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
  return authReadyPromise;
}
