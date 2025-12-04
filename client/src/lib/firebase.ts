import { initializeApp } from "firebase/app";
import { getAuth, indexedDBLocalPersistence, browserLocalPersistence, initializeAuth } from "firebase/auth";
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

// Use indexedDB persistence for iOS/Safari to avoid sessionStorage issues
let auth: ReturnType<typeof getAuth>;
try {
  if (isIOSOrSafari()) {
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
