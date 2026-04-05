import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { persistAuthTokens } from "@/lib/authStorage";
import { promptBiometricEnrollment } from "@/lib/biometricSession";
import { consumePostLoginRedirect } from "@/lib/authRedirect";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const isSafeClientRedirect = (value: string) => value.startsWith("/") && !value.startsWith("//");

    const processAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token")?.trim() || "";
      const storedRedirect = consumePostLoginRedirect("");
      const redirectToRaw = storedRedirect || params.get("redirectTo") || "/";
      const normalizedRedirect =
        redirectToRaw === "/auth/callback" || redirectToRaw === "auth/callback"
          ? "/"
          : redirectToRaw;
      const redirectTo = isSafeClientRedirect(normalizedRedirect) ? normalizedRedirect : "/";

      if (!token) {
        console.error("[AuthCallback] No token found");
        setLocation("/?auth_error=no_token");
        return;
      }

      console.info("[AuthCallback] Token received from callback", {
        hasToken: true,
        tokenPreview: `${token.slice(0, 10)}...`,
      });

      await persistAuthTokens({ authToken: token });
      const hasStoredToken =
        (typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem("auth_token"))) ||
        (typeof localStorage !== "undefined" && Boolean(localStorage.getItem("auth_token")));
      console.info("[AuthCallback] Token stored", {
        hasAuthToken: hasStoredToken,
      });

      await promptBiometricEnrollment(token);

      if (Capacitor.isNativePlatform()) {
        try {
          await Browser.close();
        } catch {
          // ignore close failures
        }
      }

      const callbackPath = `${window.location.origin}/auth/callback`;
      window.history.replaceState({}, document.title, callbackPath);
      window.location.replace(redirectTo);
    };

    processAuth().catch((error) => {
      console.error("[AuthCallback] Failed to process callback", error);
      setLocation("/?auth_error=callback_process_failed");
    });
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">
          جاري تسجيل الدخول...
        </p>
      </div>
    </div>
  );
}
