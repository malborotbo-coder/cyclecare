import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "firebase/auth";
import { auth } from "./firebase";

let persistencePromise: Promise<void> | null = null;

const authReadyPromise: Promise<User | null> = new Promise((resolve) => {
  onAuthStateChanged(auth, (user) => resolve(user));
});

export async function initFirebaseAuthPersistence(): Promise<void> {
  if (persistencePromise) return persistencePromise;

  persistencePromise = (async () => {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      console.log("[Auth] Persistence set: indexedDB");
      return;
    } catch (err) {
      console.warn("[Auth] indexedDB persistence unavailable, falling back", err);
    }

    try {
      await setPersistence(auth, browserLocalPersistence);
      console.log("[Auth] Persistence set: localStorage");
      return;
    } catch (err) {
      console.warn("[Auth] localStorage persistence unavailable, falling back", err);
    }

    await setPersistence(auth, inMemoryPersistence);
    console.log("[Auth] Persistence set: inMemory");
  })();

  return persistencePromise;
}

export async function waitForFirebaseAuthReady(): Promise<User | null> {
  await initFirebaseAuthPersistence();
  if (auth.currentUser) return auth.currentUser;
  return authReadyPromise;
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  await initFirebaseAuthPersistence();
  const user = auth.currentUser ?? (await authReadyPromise);
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn("[Auth] Failed to get Firebase ID token", err);
    return null;
  }
}
