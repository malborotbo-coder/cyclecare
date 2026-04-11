import { useCallback, useEffect, useState } from "react";
import {
  LOGIN_MODE_CHANGED_EVENT,
  getStoredLoginMode,
  setStoredLoginMode,
  type LoginMode,
} from "@/lib/authRole";

export function useLoginMode() {
  const [loginMode, setLoginModeState] = useState<LoginMode>(() =>
    getStoredLoginMode(),
  );

  useEffect(() => {
    const syncFromStorage = () => {
      setLoginModeState(getStoredLoginMode());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== "cyclecare_login_mode") return;
      syncFromStorage();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LOGIN_MODE_CHANGED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LOGIN_MODE_CHANGED_EVENT, syncFromStorage);
    };
  }, []);

  const setLoginMode = useCallback((mode: LoginMode) => {
    setStoredLoginMode(mode);
    setLoginModeState(mode);
  }, []);

  return { loginMode, setLoginMode };
}
