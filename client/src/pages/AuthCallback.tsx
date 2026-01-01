import { useEffect } from "react";
import { useLocation } from "wouter";
import { Capacitor } from "@capacitor/core";
import { persistAuthTokens } from "@/lib/authStorage";

const AUTH_TOKEN_KEY = "auth_token";

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const processAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const redirectToRaw = params.get("redirectTo") || "/";
      // Prevent redirect loops back to the callback page
      const redirectTo =
        redirectToRaw === "/auth/callback" || redirectToRaw === "auth/callback"
          ? "/"
          : redirectToRaw;

      console.log("[AuthCallback] token:", token);

      // ❌ لا توكن
      if (!token) {
        console.error("[AuthCallback] No token found");
        setLocation("/auth?error=no_token");
        return;
      }

      // ✅ خزّن التوكن فوراً
      await persistAuthTokens({ authToken: token });

      console.log("[AuthCallback] Token saved to localStorage");

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
