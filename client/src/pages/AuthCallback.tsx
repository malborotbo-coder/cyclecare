import { useEffect } from "react";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { saveCredentialsWithBiometric } from "@/lib/biometricAuth";

const AUTH_TOKEN_KEY = "auth_token";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const redirectTo = params.get("redirectTo") || "/";

    console.log("[AuthCallback] token:", token);

    // ❌ لا توكن
    if (!token) {
      console.error("[AuthCallback] No token found");
      setLocation("/auth?error=no_token");
      return;
    }

    // ✅ خزّن التوكن فوراً
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.dispatchEvent(new CustomEvent("auth-token-updated"));

    console.log("[AuthCallback] Token saved to localStorage");

    // ✅ بصمة (للتطبيق فقط)
    if (Capacitor.isNativePlatform()) {
      saveCredentialsWithBiometric(token, "google")
        .then(() => console.log("[AuthCallback] Biometric saved"))
        .catch(() => {});
    }

    // ✅ تحويل مباشر بدون تحقق
    setLocation(redirectTo);
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