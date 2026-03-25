import { useEffect } from "react";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { persistAuthTokens } from "@/lib/authStorage";
import { promptBiometricEnrollment } from "@/lib/biometricSession";
import { consumePostLoginRedirect } from "@/lib/authRedirect";

const AUTH_TOKEN_KEY = "auth_token";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const isSafeClientRedirect = (value: string) => value.startsWith("/") && !value.startsWith("//");

    const processAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const storedRedirect = consumePostLoginRedirect("");
      const redirectToRaw = storedRedirect || params.get("redirectTo") || "/";
      const normalizedRedirect =
        redirectToRaw === "/auth/callback" || redirectToRaw === "auth/callback"
          ? "/"
          : redirectToRaw;
      const redirectTo = isSafeClientRedirect(normalizedRedirect) ? normalizedRedirect : "/";

      // ❌ لا توكن
      if (!token) {
        console.error("[AuthCallback] No token found");
        setLocation("/auth?error=no_token");
        return;
      }

      // ✅ خزّن التوكن فوراً
      await persistAuthTokens({ authToken: token });

      await promptBiometricEnrollment(token);

      // ✅ اغلق المتصفح المدمج في الهاتف بعد العودة
      if (Capacitor.isNativePlatform()) {
        try {
          await Browser.close();
        } catch {
          // ignore close failures
        }
      }

      // ✅ تحويل مباشر بدون تحقق
      setLocation(redirectTo);
    };

    processAuth();
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
