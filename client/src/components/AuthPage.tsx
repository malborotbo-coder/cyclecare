import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { FaGoogle, FaApple, FaGithub } from "react-icons/fa";
import { MdEmail } from "react-icons/md";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState } from "react";
import authBgImage from "@assets/generated_images/Premium_black_orange_road_bike_ab4ecb10.png";
import Logo from "@/components/Logo";
import { Link } from "wouter";

export default function AuthPage() {
  const { t, lang, toggleLanguage } = useLanguage();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = () => {
    setIsLoggingIn(true);
    // Clear any existing session data before login
    sessionStorage.clear();
    localStorage.removeItem('auth_state');
    // Redirect to login
    window.location.href = "/api/login";
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 bg-cover bg-center relative"
      style={{ backgroundImage: `url(${authBgImage})` }}
    >
      {/* Dark gradient overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/85 via-black/75 to-black/85"></div>
      
      <div className="absolute top-4 left-4 z-10">
        <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center space-y-4">
          <div className="flex justify-center items-center">
            <Logo size="xl" className="drop-shadow-2xl" />
          </div>
          <h1 className="text-4xl font-bold text-white drop-shadow-lg">{t("loginTitle")}</h1>
          <p className="text-xl text-gray-200 drop-shadow-md">{t("loginSubtitle")}</p>
        </div>

        <Card className="p-8 bg-black/40 backdrop-blur-xl border-white/20 shadow-2xl">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-white text-center mb-6">
              {t("loginHeading")}
            </h2>

            <div className="space-y-4">
              <Button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full h-12 text-base bg-white hover:bg-gray-100 text-gray-900 flex items-center justify-center gap-3"
                data-testid="button-login-google"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === "ar" ? "جارٍ تسجيل الدخول..." : "Logging in..."}</span>
                  </>
                ) : (
                  <>
                    <FaGoogle className="w-5 h-5" />
                    <span>{lang === "ar" ? "تسجيل الدخول باستخدام Google" : "Continue with Google"}</span>
                  </>
                )}
              </Button>

              <Button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full h-12 text-base bg-black hover:bg-gray-900 text-white border border-white/20 flex items-center justify-center gap-3"
                data-testid="button-login-apple"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === "ar" ? "جارٍ تسجيل الدخول..." : "Logging in..."}</span>
                  </>
                ) : (
                  <>
                    <FaApple className="w-5 h-5" />
                    <span>{lang === "ar" ? "تسجيل الدخول باستخدام Apple" : "Continue with Apple"}</span>
                  </>
                )}
              </Button>

              <Button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full h-12 text-base bg-gray-800 hover:bg-gray-700 text-white flex items-center justify-center gap-3"
                data-testid="button-login-github"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === "ar" ? "جارٍ تسجيل الدخول..." : "Logging in..."}</span>
                  </>
                ) : (
                  <>
                    <FaGithub className="w-5 h-5" />
                    <span>{lang === "ar" ? "تسجيل الدخول باستخدام GitHub" : "Continue with GitHub"}</span>
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-transparent px-2 text-gray-400">
                    {lang === "ar" ? "أو" : "OR"}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-3"
                data-testid="button-login-email"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{lang === "ar" ? "جارٍ تسجيل الدخول..." : "Logging in..."}</span>
                  </>
                ) : (
                  <>
                    <MdEmail className="w-5 h-5" />
                    <span>{lang === "ar" ? "تسجيل الدخول بالبريد الإلكتروني" : "Continue with Email"}</span>
                  </>
                )}
              </Button>
            </div>

            <div className="text-center text-sm text-gray-300 pt-4 space-y-2">
              <p className="text-gray-400">{t("loginTerms")}</p>
              <p className="text-xs text-gray-500">
                {lang === "ar" 
                  ? "✓ سيتم إنشاء حسابك تلقائياً عند أول دخول"
                  : "✓ Your account will be created automatically on first login"}
              </p>
            </div>

            <div className="text-center text-xs text-gray-500 pt-2 flex justify-center gap-2">
              <Link href="/privacy" className="hover:text-gray-300 underline transition-colors" data-testid="link-privacy-auth">
                {lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
              </Link>
              <span>•</span>
              <Link href="/terms" className="hover:text-gray-300 underline transition-colors" data-testid="link-terms-auth">
                {lang === "ar" ? "شروط الخدمة" : "Terms of Service"}
              </Link>
            </div>
          </div>
        </Card>

        <div className="text-center text-gray-300 text-sm drop-shadow-md">
          {t("loginFooter")}
        </div>
      </div>
    </div>
  );
}
