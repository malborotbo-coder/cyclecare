import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
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
import { Browser } from "@capacitor/browser";
import { buildApiUrl } from "@/lib/apiConfig";
import { signInWithGoogle, signInWithApple } from "@/lib/googleAuth";
import { getBiometricStatus, restoreBiometricSession } from "@/lib/biometricSession";
import { sendPhoneOtp, confirmPhoneOtp } from "@/lib/phoneAuth";
import type { ConfirmationResult } from "firebase/auth";
import { persistAuthTokens } from "@/lib/authStorage";
import { promptBiometricEnrollment } from "@/lib/biometricSession";
import { consumePostLoginRedirect } from "@/lib/authRedirect";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

export default function FirebaseAuthPage() {
  const [, setLocation] = useLocation();
  const { enterGuestMode } = useFirebaseAuth();
  const { lang, toggleLanguage } = useLanguage();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const isSignUp = mode === "signup";
  const [phoneStep, setPhoneStep] = useState<"input" | "verify">("input");
  const [error, setError] = useState("");
  const [biometricStatus, setBiometricStatus] = useState<{
    isAvailable: boolean;
    biometryType: "face" | "fingerprint" | "none";
    isEnabled: boolean;
  } | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null); // Backup: keeps legacy API fallback untouched
  const USE_TWILIO_ONLY = true; // Flag to disable Firebase Phone Auth on web
  const isNative = Capacitor.isNativePlatform();
  const ENABLE_BIOMETRIC = isNative;
  const googleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  useEffect(() => {
    return () => {
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
        googleTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ENABLE_BIOMETRIC) return;
    void getBiometricStatus().then(setBiometricStatus);
  }, [ENABLE_BIOMETRIC]);

  const handleBiometricSignIn = async () => {
    if (!ENABLE_BIOMETRIC) return;
    setIsLoading(true);
    setError("");
    const ok = await restoreBiometricSession();
    setIsLoading(false);
    if (ok) {
      window.location.href = consumePostLoginRedirect("/");
      return;
    }
    setError(isArabic ? "تعذّر التحقق بالبصمة. حاول مرة أخرى." : "Biometric authentication failed.");
  };

  const handleAuthCallback = useCallback(async (params: URLSearchParams) => {
    const sessionToken = params.get('session') || params.get('token');
    if (sessionToken) {
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
        googleTimeoutRef.current = null;
      }
      if (isNative) {
        try {
          await Browser.close();
        } catch {
          // Ignore close errors
        }
      }
      await persistAuthTokens({ authToken: sessionToken, phoneSession: sessionToken });
      setIsLoading(false);
      window.location.href = consumePostLoginRedirect('/');
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative) return;

    const handleAppUrlOpen = async (data: { url: string }) => {
      console.log('[DeepLink] URL opened:', data.url);
      try {
        await Browser.close();
      } catch {
        // Ignore close errors
      }
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
      guest: "المتابعة كزائر",
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
      guest: "Continue as Guest",
    },
  };

  const labels = t[isArabic ? "ar" : "en"];

  const handleGuestContinue = () => {
    enterGuestMode();
    setLocation("/");
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
      }
      if (isNative) {
        googleTimeoutRef.current = setTimeout(() => {
          console.warn("[GoogleAuth] Mobile OAuth timeout");
          setError(labels.error || "Google sign-in timed out. Please try again.");
          setIsLoading(false);
          Browser.close().catch(() => undefined);
        }, 25000);
      }

      // Single web-based OAuth flow (runs inside WebView on all platforms)
      const user = await signInWithGoogle();
      if (user) {
        console.log("[Auth] Google sign-in successful:", user.email);
        setLocation(consumePostLoginRedirect("/"));
      } else {
        console.log("[Auth] Redirecting to OAuth flow...");
      }
    } catch (err: any) {
      console.error("[Auth] Google sign-in error:", err);
      setError(err.message || labels.error);
      setIsLoading(false);
      if (googleTimeoutRef.current) {
        clearTimeout(googleTimeoutRef.current);
        googleTimeoutRef.current = null;
      }
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading(true);
      setError("");

      const user = await signInWithApple();
      if (user) {
        console.log('[Auth] Apple sign-in successful:', user.email);
        setIsLoading(false);
        window.location.href = consumePostLoginRedirect("/");
      } else {
        setIsLoading(false);
      }
    } catch (err: any) {
      console.error("[Auth] Apple sign-in error:", err);
      setError(err.message || labels.error);
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    // Shared checks (login + signup)
    if (!email) return setError(labels.noEmail);
    if (!password) return setError(labels.noPassword);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(isArabic ? "البريد الإلكتروني غير صحيح" : "Invalid email format");
      return;
    }

    if (password.length < 6) return setError(isArabic ? "كلمة المرور يجب أن تكون 6 أحرف على الأقل" : "Password must be at least 6 characters");
    if (password.length > 64) return setError(isArabic ? "كلمة المرور طويلة جداً" : "Password is too long");

    // Registration-only checks
    if (isSignUp) {
      if (!confirmPassword) return setError(isArabic ? "أكّد كلمة المرور" : "Confirm your password");
      if (password !== confirmPassword) return setError(isArabic ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      if (!firstName.trim()) return setError(isArabic ? "الاسم الأول مطلوب" : "First name is required");
      if (!lastName.trim()) return setError(isArabic ? "الاسم الأخير مطلوب" : "Last name is required");
      if (!phone.trim()) return setError(labels.noPhone);
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
      
      console.log("[EmailAuth] Firebase user after auth:", {
        uid: userCredential?.user?.uid,
        email: userCredential?.user?.email,
        exists: !!userCredential?.user,
      });

      // Get ID token and store for API authentication
      const idToken = await userCredential.user.getIdToken(true);
      console.log('[EmailAuth] Got Firebase ID token, length:', idToken?.length || 0);

      // Store token for backend authentication (will be used by queryClient)
      await persistAuthTokens({ authToken: idToken, firebaseToken: idToken });
      console.log("[EmailAuth] Tokens persisted. auth_token in localStorage:", !!localStorage.getItem("auth_token"));

      await promptBiometricEnrollment(idToken, isArabic);

      // Best-effort profile sync to backend
      if (isSignUp) {
        try {
          await fetch(buildApiUrl("/api/users/upsert"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              firebaseUid: userCredential.user.uid,
              firstName,
              lastName,
              email,
              phone,
              authMethod: "email",
            }),
          });
          console.log("[EmailAuth] Profile upserted");
        } catch (profileErr) {
          console.warn("[EmailAuth] Profile upsert failed (non-blocking):", profileErr);
        }
      }

      // Clear cache to ensure fresh auth state
      sessionStorage.clear();

      console.log('[EmailAuth] Auth tokens stored, redirecting...');
      window.location.href = consumePostLoginRedirect("/");
    } catch (err: any) {
      console.error("Email auth error:", err);
      
      if (err.code === "auth/user-not-found" && !isSignUp) {
        setError(isArabic ? "لا يوجد حساب بهذا البريد" : "No account found with this email");
      } else if (err.code === "auth/wrong-password") {
        setError(isArabic ? "كلمة المرور غير صحيحة" : "Incorrect password");
      } else if (err.code === "auth/email-already-in-use") {
        setError(isArabic ? "البريد مسجل بالفعل" : "Email already in use");
      } else if (err.code === "auth/weak-password") {
        setError(isArabic ? "كلمة المرور ضعيفة جداً" : "Password is too weak");
      } else if (err.code === "auth/invalid-email") {
        setError(isArabic ? "البريد الإلكتروني غير صحيح" : "Invalid email address");
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

      // Twilio-only path (Firebase Phone Auth disabled on web)
      if (!USE_TWILIO_ONLY) {
        try {
          const result = await sendPhoneOtp(fullPhone);
          setConfirmationResult(result);
          setPhoneStep("verify");
          return;
        } catch (firebaseError) {
          console.warn("[PhoneAuth] Firebase OTP send failed, falling back to API:", firebaseError);
        }
      }
      
      const response = await fetch(buildApiUrl("/api/auth/send-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || labels.error);
      }

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

      const fullPhone = `+966${phone}`;

      // Prefer Firebase confirmation if available AND enabled (currently disabled on web)
      if (!USE_TWILIO_ONLY && confirmationResult) {
        const credential = await confirmPhoneOtp(confirmationResult, otp);
        const idToken = await credential.user.getIdToken();
        await persistAuthTokens({
          authToken: idToken,
          firebaseToken: idToken,
          phoneSession: idToken,
          phoneUserId: credential.user.uid,
          phoneNumber: credential.user.phoneNumber || "",
        });
        await promptBiometricEnrollment(idToken, isArabic);
        window.location.href = consumePostLoginRedirect("/");
        return;
      }

      const response = await fetch(buildApiUrl("/api/auth/verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: fullPhone, code: otp }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || labels.error);
      }

      const data = await response.json();

      const authToken = data.authToken || data.sessionToken || data.customToken || null;

      if (!authToken) {
        throw new Error("No auth token received");
      }

      // Prefer dedicated session token for phone auth to align with backend middleware
      const sessionToken = data.sessionToken || authToken;

      await persistAuthTokens({
        authToken,
        phoneSession: sessionToken,
        phoneUserId: data.user?.id || data.userId || "",
        phoneNumber: data.user?.phone || data.phoneNumber || fullPhone,
      });
      await promptBiometricEnrollment(authToken, isArabic);
      window.location.href = consumePostLoginRedirect("/");
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
    setConfirmationResult(null);
    setError("");
  };

  const resetEmailForm = () => {
    setShowEmailForm(false);
    setMode("login");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setPhone("");
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
      {/* Backup: original layout محفوظ - إضافة reCAPTCHA مخفي للـ Phone Auth */}
      <div id="recaptcha-container" style={{ display: "none" }} />

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
                {isSignUp && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="text"
                        placeholder={isArabic ? "الاسم الأول" : "First name"}
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          setError("");
                        }}
                        disabled={isLoading}
                        className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg"
                        data-testid="input-first-name"
                      />
                      <Input
                        type="text"
                        placeholder={isArabic ? "الاسم الأخير" : "Last name"}
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          setError("");
                        }}
                        disabled={isLoading}
                        className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg"
                        data-testid="input-last-name"
                      />
                    </div>
                    <Input
                      type="tel"
                      placeholder={isArabic ? "رقم الجوال" : "Phone number"}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setError("");
                      }}
                      disabled={isLoading}
                      className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg"
                      data-testid="input-phone"
                    />
                  </>
                )}

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
                {isSignUp && (
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={isArabic ? "تأكيد كلمة المرور" : "Confirm password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    disabled={isLoading}
                    className="h-10 border border-white/10 bg-white/5 text-white placeholder:text-gray-500 rounded-lg"
                    data-testid="input-confirm-password"
                  />
                )}
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
                    onClick={() => setMode(isSignUp ? "login" : "signup")}
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
              {ENABLE_BIOMETRIC && biometricStatus?.isAvailable && biometricStatus?.isEnabled && (
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

              <Button
                onClick={handleGuestContinue}
                variant="outline"
                className="w-full h-12 text-base font-semibold rounded-xl border border-white/30 text-white hover:bg-white/10 transition"
                disabled={isLoading}
                data-testid="button-guest-mode"
              >
                {labels.guest}
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
