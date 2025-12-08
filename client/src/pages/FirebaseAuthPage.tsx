import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Phone,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  X,
  Fingerprint,
  ScanFace,
} from "lucide-react";
import cycleCareLogo from "@assets/1_1764502393151.png";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { signInWithGoogle, signInWithApple } from "@/lib/googleAuth";
import { 
  checkBiometricAvailability, 
  authenticateWithBiometric,
  type BiometricStatus 
} from "@/lib/biometricAuth";

export default function FirebaseAuthPage() {
  const { lang, toggleLanguage } = useLanguage();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"input" | "verify">("input");
  const [error, setError] = useState("");
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      checkBiometricAvailability().then(status => {
        console.log('[Biometric] Status:', status);
        setBiometricStatus(status);
      });
    }
  }, [isNative]);

  const handleBiometricSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      const token = await authenticateWithBiometric();
      if (!token) {
        setError(lang === 'ar' ? 'فشل التحقق من البصمة' : 'Biometric verification failed');
        return;
      }
      
      const response = await fetch('/api/auth/session', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        localStorage.setItem('auth_token', token);
        console.log('[Biometric] Token validated and stored');
        window.location.href = '/';
      } else {
        console.error('[Biometric] Token validation failed');
        const { clearBiometricCredentials } = await import('@/lib/biometricAuth');
        await clearBiometricCredentials();
        setError(lang === 'ar' ? 'انتهت صلاحية الجلسة، سجل مرة أخرى' : 'Session expired, please sign in again');
      }
    } catch (err: any) {
      console.error('[Biometric] Error:', err);
      setError(err.message || (lang === 'ar' ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthCallback = useCallback(async (params: URLSearchParams) => {
    const sessionToken = params.get('session') || params.get('token');
    if (sessionToken) {
      localStorage.setItem('phone_session', sessionToken);
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    if (!isNative) return;

    const handleAppUrlOpen = (data: { url: string }) => {
      console.log('[DeepLink] URL opened:', data.url);
      try {
        const url = new URL(data.url);
        handleAuthCallback(new URLSearchParams(url.search));
      } catch (e) {
        console.error('[DeepLink] Parse error:', e);
      }
    };

    App.addListener('appUrlOpen', handleAppUrlOpen);
    return () => {
      App.removeAllListeners();
    };
  }, [isNative, handleAuthCallback]);

  const isArabic = lang === "ar";

  const t = {
    ar: {
      title: "Cycle Care",
      tagline: "خدمات صيانة الدراجات الاحترافية",
      welcome: "أهلاً بك",
      continueText: "استمرّ للبدء",
      email: "البريد الإلكتروني",
      phone: "رقم الجوال",
      password: "كلمة المرور",
      login: "دخول",
      signup: "تسجيل جديد",
      sendOTP: "إرسال الرمز",
      google: "جوجل",
      apple: "أبل",
      phoneAuth: "رقم الجوال",
      emailAuth: "البريد الإلكتروني",
      loading: "جاري التحميل...",
      error: "حدث خطأ",
      close: "إغلاق",
      noPhone: "أدخل رقم الجوال",
      noEmail: "أدخل البريد الإلكتروني",
      noPassword: "أدخل كلمة المرور",
      noOTP: "أدخل رمز التحقق",
      or: "أو",
      enterPhone: "أدخل رقمك بدون صفر",
      enterOTP: "أدخل رمز التحقق",
      otp: "رمز التحقق",
      verify: "تحقق",
      sendCodeAgain: "إرسال الرمز مرة أخرى",
      haveAccount: "لديك حساب بالفعل؟",
      noAccount: "ليس لديك حساب؟",
      continueWith: "الدخول عبر",
    },
    en: {
      title: "Cycle Care",
      tagline: "Professional Bike Maintenance Services",
      welcome: "Welcome",
      continueText: "Get Started",
      email: "Email",
      phone: "Phone Number",
      password: "Password",
      login: "Sign In",
      signup: "Create Account",
      sendOTP: "Send Code",
      google: "Google",
      apple: "Apple",
      phoneAuth: "Phone Number",
      emailAuth: "Email",
      loading: "Loading...",
      error: "An error occurred",
      close: "Close",
      noPhone: "Enter phone number",
      noEmail: "Enter email",
      noPassword: "Enter password",
      noOTP: "Enter verification code",
      or: "or",
      enterPhone: "Enter your number without 0",
      enterOTP: "Enter verification code",
      otp: "Verification Code",
      verify: "Verify",
      sendCodeAgain: "Send Code Again",
      haveAccount: "Already have an account?",
      noAccount: "Don't have an account?",
      continueWith: "Continue with",
    },
  };

  const labels = t[isArabic ? "ar" : "en"];

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      const user = await signInWithGoogle();
      if (user) {
        console.log('[Auth] Google sign-in successful:', user.email);
        window.location.href = '/';
      } else if (!isNative) {
        // Web platform redirects automatically
        console.log('[Auth] Redirecting to web OAuth...');
      }
    } catch (err: any) {
      console.error("[Auth] Google sign-in error:", err);
      setError(err.message || labels.error);
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      
      const user = await signInWithApple();
      if (user) {
        console.log('[Auth] Apple sign-in successful:', user.email);
        window.location.href = '/';
      } else {
        // Apple Sign-In redirects to OAuth endpoint
        console.log('[Auth] Redirecting to Apple OAuth...');
      }
    } catch (err: any) {
      console.error("[Auth] Apple sign-in error:", err);
      setError(err.message || labels.error);
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError(labels.noEmail);
      return;
    }
    if (!password) {
      setError(labels.noPassword);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(isArabic ? "البريد الإلكتروني غير صحيح" : "Invalid email format");
      return;
    }

    if (password.length < 6) {
      setError(isArabic ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      
      let userCredential;
      if (isSignUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
      
      // Get ID token and store for API authentication
      const idToken = await userCredential.user.getIdToken();
      console.log('[EmailAuth] Got Firebase ID token, length:', idToken.length);
      
      // Store token for backend authentication (will be used by queryClient)
      localStorage.setItem('firebase_token', idToken);
      localStorage.setItem('auth_token', idToken);
      
      // Clear cache to ensure fresh auth state
      sessionStorage.clear();
      
      console.log('[EmailAuth] Auth tokens stored, redirecting...');
      window.location.href = "/";
    } catch (err: any) {
      console.error("Email auth error:", err);
      
      if (err.code === "auth/user-not-found" && !isSignUp) {
        setError(isArabic ? "لا يوجد حساب بهذا البريد" : "No account found with this email");
      } else if (err.code === "auth/wrong-password") {
        setError(isArabic ? "كلمة المرور غير صحيحة" : "Wrong password");
      } else if (err.code === "auth/email-already-in-use") {
        setError(isArabic ? "البريد مسجل بالفعل" : "Email already in use");
      } else if (err.code === "auth/weak-password") {
        setError(isArabic ? "كلمة المرور ضعيفة جداً" : "Password is too weak");
      } else {
        setError(err.message || labels.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) {
      setError(labels.noPhone);
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      const fullPhone = `+966${phone}`;
      
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || labels.error);
      }

      const data = await response.json();
      (window as any).__phoneSessionId = data.sessionId;
      setPhoneStep("verify");
    } catch (error: any) {
      console.error("Phone sign-in error:", error);
      setError(error.message || labels.error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setError(labels.noOTP);
      return;
    }

    try {
      setError("");
      setIsLoading(true);

      const sessionId = (window as any).__phoneSessionId;
      if (!sessionId) {
        throw new Error(labels.error);
      }

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, code: otp }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || labels.error);
      }

      const data = await response.json();

      if (data.customToken) {
        if (data.useSimpleAuth) {
          localStorage.setItem("phone_session", data.customToken);
          localStorage.setItem("phone_user_id", data.userId);
          localStorage.setItem("phone_number", data.phoneNumber);
          window.location.href = "/";
        }
      } else {
        throw new Error("No auth token received");
      }
    } catch (error: any) {
      console.error("OTP verification error:", error);
      setError(error.message || labels.error);
      setIsLoading(false);
    }
  };

  const resetPhoneForm = () => {
    setShowPhoneForm(false);
    setPhoneStep("input");
    setPhone("");
    setOtp("");
    setError("");
  };

  const resetEmailForm = () => {
    setShowEmailForm(false);
    setIsSignUp(false);
    setEmail("");
    setPassword("");
    setError("");
  };

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d]/g, "");
    if (value.length <= 9) {
      setPhone(value);
      setError("");
    }
  };


  return (
    <div 
      className="min-h-screen overflow-hidden flex flex-col relative"
      style={{ paddingTop: isNative ? 'env(safe-area-inset-top, 0px)' : '0px' }}
    >
      {/* Background Image with Dark Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${workshopBg})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />
      </div>

      {/* Language Toggle - Top Right */}
      <div 
        className="absolute z-50"
        style={{ 
          top: isNative ? 'calc(env(safe-area-inset-top, 0px) + 16px)' : '16px',
          right: isNative ? 'calc(env(safe-area-inset-right, 0px) + 16px)' : '16px'
        }}
      >
        <button
          onClick={toggleLanguage}
          className="px-4 py-2 bg-primary text-white font-semibold rounded-lg text-sm hover:opacity-90 transition backdrop-blur-sm"
          data-testid="button-language-toggle"
        >
          {isArabic ? "EN" : "العربية"}
        </button>
      </div>

      {/* Top Section - Logo */}
      <div className="relative flex-1 overflow-hidden flex items-center justify-center min-h-72 z-10">
        <motion.div
          className="relative z-10 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          <motion.img
            src={cycleCareLogo}
            alt="Cycle Care"
            className="w-56 h-auto object-contain drop-shadow-2xl"
            animate={{
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      </div>

      {/* Bottom Section - Sign In Options */}
      <div className="relative px-4 py-6 pb-12 z-10 backdrop-blur-sm bg-black/30 rounded-t-3xl">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="space-y-4"
        >
          {/* Welcome Text */}
          {!showPhoneForm && !showEmailForm && (
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-2xl font-bold text-white">
                {labels.welcome}
              </h2>
              <p className="text-sm text-gray-400">{labels.continueText}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Email Form */}
          {showEmailForm ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">
                  {isSignUp ? labels.signup : labels.login}
                </h3>
                <button
                  onClick={resetEmailForm}
                  className="text-gray-400 hover:text-white"
                  data-testid="button-email-close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  disabled={isLoading}
                  className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg"
                  data-testid="input-email"
                />
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    disabled={isLoading}
                    className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg pr-10"
                    data-testid="input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <Button
                  type="submit"
                  className="w-full h-10 bg-gradient-to-r from-primary to-secondary text-white text-sm font-semibold rounded-lg"
                  disabled={isLoading}
                  data-testid="button-email-submit"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    isSignUp ? labels.signup : labels.login
                  )}
                </Button>
              </form>
              <div className="text-center text-sm">
                <p className="text-gray-400">
                  {isSignUp ? labels.haveAccount : labels.noAccount}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="ml-2 text-primary hover:text-secondary font-semibold"
                    data-testid="button-toggle-signup"
                  >
                    {isSignUp ? labels.login : labels.signup}
                  </button>
                </p>
              </div>
            </motion.div>
          ) : (
            <Button
              onClick={() => setShowEmailForm(true)}
              className="w-full h-12 text-base font-semibold rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition"
              disabled={isLoading}
              data-testid="button-email-auth"
            >
              <Mail className="w-5 h-5 mr-2" />
              {labels.emailAuth}
            </Button>
          )}

          {/* Phone Form */}
          {showPhoneForm ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">{labels.phoneAuth}</h3>
                <button
                  onClick={resetPhoneForm}
                  className="text-gray-400 hover:text-white"
                  data-testid="button-phone-close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={
                  phoneStep === "input"
                    ? handlePhoneSendOTP
                    : handlePhoneVerifyOTP
                }
                className="space-y-3"
              >
                {phoneStep === "input" ? (
                  <>
                    <div className="flex gap-2">
                      <div className="h-10 bg-white/5 border border-white/10 rounded-lg px-3 flex items-center text-white font-semibold min-w-fit">
                        +966
                      </div>
                      <Input
                        type="tel"
                        placeholder="505123456"
                        value={phone}
                        onChange={handlePhoneInputChange}
                        disabled={isLoading}
                        maxLength={9}
                        className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg flex-1"
                        data-testid="input-phone"
                      />
                    </div>
                    <p className="text-xs text-gray-400 text-center">
                      {labels.enterPhone}
                    </p>
                    <Button
                      type="submit"
                      className="w-full h-10 bg-gradient-to-r from-primary to-secondary text-white text-sm font-semibold rounded-lg"
                      disabled={isLoading || !phone}
                      data-testid="button-send-otp"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        labels.sendOTP
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 text-center">
                      {labels.enterOTP}
                    </p>
                    <Input
                      type="text"
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/[^\d]/g, "").slice(0, 6));
                        setError("");
                      }}
                      disabled={isLoading}
                      maxLength={6}
                      className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg text-center tracking-widest"
                      data-testid="input-otp"
                    />
                    <Button
                      type="submit"
                      className="w-full h-10 bg-gradient-to-r from-primary to-secondary text-white text-sm font-semibold rounded-lg"
                      disabled={isLoading || !otp}
                      data-testid="button-verify-otp"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        labels.verify
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-10 text-xs border border-white/10 text-white hover:bg-white/5"
                      onClick={() => setPhoneStep("input")}
                      disabled={isLoading}
                      data-testid="button-retry-phone"
                    >
                      {labels.sendCodeAgain}
                    </Button>
                  </>
                )}
              </form>
            </motion.div>
          ) : (
            <Button
              onClick={() => setShowPhoneForm(true)}
              className="w-full h-12 text-base font-semibold rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition"
              disabled={isLoading || showEmailForm}
              data-testid="button-phone-auth"
            >
              <Phone className="w-5 h-5 mr-2" />
              {labels.phoneAuth}
            </Button>
          )}

          {!showPhoneForm && !showEmailForm && (
            <>
              {/* Biometric Sign-in - Face ID / Touch ID */}
              {biometricStatus?.isAvailable && biometricStatus?.hasCredentials && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-4"
                >
                  <Button
                    onClick={handleBiometricSignIn}
                    className="w-full h-14 text-lg font-bold rounded-xl bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition flex items-center justify-center gap-3"
                    disabled={isLoading}
                    data-testid="button-biometric-auth"
                  >
                    {isLoading ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        {biometricStatus.biometryType === 'face' ? (
                          <ScanFace className="w-6 h-6" />
                        ) : (
                          <Fingerprint className="w-6 h-6" />
                        )}
                        {biometricStatus.biometryType === 'face' 
                          ? (lang === 'ar' ? 'الدخول بالوجه' : 'Sign in with Face ID')
                          : (lang === 'ar' ? 'الدخول بالبصمة' : 'Sign in with Touch ID')
                        }
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-xs text-gray-500 uppercase font-semibold">
                    {labels.or}
                  </span>
                </div>
              </div>

              {/* Google Sign-in - Professional */}
              <Button
                onClick={handleGoogleSignIn}
                className="w-full h-12 text-base font-semibold rounded-xl bg-white text-slate-900 hover:bg-gray-100 transition flex items-center justify-center gap-3"
                disabled={isLoading}
                data-testid="button-google-auth"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {labels.google}
                  </>
                )}
              </Button>

              {/* Apple Sign-in - Professional with official Apple logo */}
              <Button
                onClick={handleAppleSignIn}
                className="w-full h-12 text-base font-semibold rounded-xl bg-black text-white hover:bg-gray-900 border border-gray-800 transition flex items-center justify-center gap-3"
                disabled={isLoading}
                data-testid="button-apple-auth"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    {labels.apple}
                  </>
                )}
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
