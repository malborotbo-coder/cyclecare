import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { saveCredentialsWithBiometric } from "@/lib/biometricAuth";

const AUTH_TOKEN_KEY = "auth_token";

function clearExistingToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"validating" | "error">("validating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const validateAndStoreToken = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const redirectTo = params.get("redirectTo") || "/";
      const error = params.get("error");

      // ----------------------------
      // 1️⃣ OAuth error from server
      // ----------------------------
      if (error) {
        console.error("[AuthCallback] OAuth error:", error);
        clearExistingToken();
        setStatus("error");
        setErrorMessage(error);
        setTimeout(() => setLocation("/auth?error=" + error), 2000);
        return;
      }

      // ----------------------------
      // 2️⃣ No token received
      // ----------------------------
      if (!token) {
        console.error("[AuthCallback] No token received");
        clearExistingToken();
        setStatus("error");
        setErrorMessage("لم يتم استلام رمز المصادقة");
        setTimeout(() => setLocation("/auth?error=no_token"), 2000);
        return;
      }

      // ----------------------------
      // 3️⃣ IMPORTANT: store token immediately
      // ----------------------------
      console.log("[AuthCallback] Storing token locally");
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      window.dispatchEvent(new CustomEvent("auth-token-updated"));

      // ----------------------------
      // 4️⃣ Validate token with server
      // ----------------------------
      try {
        const response = await fetch("/api/auth/session", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.error("[AuthCallback] Token validation failed:", response.status);
          clearExistingToken();
          setStatus("error");
          setErrorMessage("رمز المصادقة غير صالح");
          setTimeout(() => setLocation("/auth?error=invalid_token"), 2000);
          return;
        }

        const data = await response.json();

        console.log(
          "[AuthCallback] Token validated successfully, user:",
          data?.user?.email
        );

        // ----------------------------
        // 5️⃣ Save biometric (mobile only)
        // ----------------------------
        if (Capacitor.isNativePlatform() && data?.user?.email) {
          try {
            await saveCredentialsWithBiometric(token, data.user.email);
            console.log("[AuthCallback] Biometric credentials saved");
          } catch (err) {
            console.log("[AuthCallback] Biometric save skipped:", err);
          }
        }

        // ----------------------------
        // 6️⃣ Redirect user
        // ----------------------------
        console.log("[AuthCallback] Redirecting to:", redirectTo);
        setLocation(redirectTo);
      } catch (err) {
        console.error("[AuthCallback] Validation error:", err);
        clearExistingToken();
        setStatus("error");
        setErrorMessage("حدث خطأ أثناء التحقق من رمز المصادقة");
        setTimeout(() => setLocation("/auth?error=validation_error"), 2000);
      }
    };

    validateAndStoreToken();
  }, [setLocation]);

  // ----------------------------
  // UI
  // ----------------------------
  if (status === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">{errorMessage || "حدث خطأ"}</p>
          <p className="text-sm text-muted-foreground mt-2">
            جاري إعادة التوجيه...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">
          جاري التحقق من تسجيل الدخول...
        </p>
      </div>
    </div>
  );
}