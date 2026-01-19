import { useState, useEffect, ReactNode, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { Save, User, Mail, Phone, Loader2, Camera } from "lucide-react";
import { apiRequest, queryClient, getAuthHeadersAsync } from "@/lib/queryClient";
import { Capacitor } from "@capacitor/core";
import { disableBiometricSession, isBiometricEnabled } from "@/lib/biometricSession";
import { buildApiUrl } from "@/lib/apiConfig";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";
import { auth } from "@/lib/firebase";
import { setPostLoginRedirect } from "@/lib/authRedirect";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

type ProfileFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const PageBackground = ({ children }: { children: ReactNode }) => (
  <div className="relative min-h-screen bg-background">
    <div className="absolute inset-0">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${workshopBg})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-black/50" aria-hidden="true" />
    </div>
    <div className="relative z-10">{children}</div>
  </div>
);

export default function ProfilePage() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
  const { user, isGuest, authReady } = useFirebaseAuth();
  const isNative = Capacitor.isNativePlatform();
  const isSignedIn = Boolean(user || nativeUser);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [phoneReadOnly, setPhoneReadOnly] = useState(false);

  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const initializedRef = useRef(false);

  const markInitialized = () => {
    if (!initializedRef.current) {
      initializedRef.current = true;
    }
  };

  useEffect(() => {
    if (!authReady || initializedRef.current || !isSignedIn) return;
    const loadUserData = async () => {
      setIsLoading(true);
      if (isNative) {
        const enabled = await isBiometricEnabled();
        setBiometricEnabled(enabled);
      }
      try {
        const response = await apiRequest("/api/user/profile", "GET");
        if (!initializedRef.current) {
          const phoneFromAuth = auth.currentUser?.phoneNumber || "";
          const resolvedPhone = phoneFromAuth || response.phone || nativeUser?.phone || "";
          setFormData({
            firstName: response.firstName || "",
            lastName: response.lastName || "",
            email: response.email || "",
            phone: resolvedPhone,
          });
          setPhoneReadOnly(Boolean(phoneFromAuth));
          setProfileImageUrl(
            response.avatarUrl || response.profileImageUrl || nativeUser?.profileImageUrl || null
          );
          setAuthError(null);
          markInitialized();
        }
      } catch (error: any) {
        console.error("Failed to load profile:", error);
        const isUnauthorized = error?.code === "UNAUTHORIZED" || error?.status === 401;
        if (isUnauthorized) {
          setAuthError(error?.raw?.reason || "unauthorized");
        } else if (nativeUser && !initializedRef.current) {
          setFormData({
            firstName: nativeUser.firstName || "",
            lastName: nativeUser.lastName || "",
            email: nativeUser.email || "",
            phone: nativeUser.phone || "",
          });
          setProfileImageUrl(nativeUser.profileImageUrl || null);
          markInitialized();
        }
      } finally {
        setIsLoading(false);
        markInitialized();
      }
    };

    loadUserData();
  }, [authReady, isNative, nativeUser, isSignedIn]);

  const getUnauthorizedCopy = (reason?: string | null) => {
    const normalized = reason || "unauthorized";
    if (normalized === "missing_token") {
      return lang === "ar"
        ? "غير مسجل الدخول. يرجى تسجيل الدخول أولاً."
        : "You are not signed in. Please log in first.";
    }
    if (normalized === "token_expired") {
      return lang === "ar"
        ? "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى."
        : "Your session expired. Please sign in again.";
    }
    if (normalized === "session_not_found") {
      return lang === "ar"
        ? "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى."
        : "Your session expired. Please sign in again.";
    }
    if (normalized === "invalid_token") {
      return lang === "ar"
        ? "مشكلة في التحقق من التوكن. يرجى إعادة تسجيل الدخول."
        : "Token verification failed. Please sign in again.";
    }
    return lang === "ar"
      ? "غير مصرح لك بهذا الإجراء. يرجى تسجيل الدخول."
      : "You are not authorized. Please sign in.";
  };

  const handleSave = async () => {
    if (authReady && (isGuest || !isSignedIn)) {
      toast({
        title: lang === "ar" ? "تسجيل الدخول مطلوب" : "Sign in required",
        description:
          lang === "ar"
            ? "يرجى تسجيل الدخول لحفظ بياناتك."
            : "Please sign in to save your profile.",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        phone: formData.phone,
        profileImageUrl,
      };
      await apiRequest("/api/user/profile", "POST", payload);
      setAuthError(null);
      
      if (nativeAuth && nativeUser) {
        nativeAuth.updateUser({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          profileImageUrl: profileImageUrl || undefined,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      toast({
        title: lang === "ar" ? "تم الحفظ بنجاح" : "Saved successfully",
        description: lang === "ar" ? "تم تحديث بياناتك الشخصية" : "Your profile has been updated",
      });
    } catch (error: any) {
      const isUnauthorized = error?.code === "UNAUTHORIZED" || error?.status === 401;
      console.error("Failed to save profile:", error);
      if (isUnauthorized) {
        setAuthError(error?.raw?.reason || "unauthorized");
      }
      toast({
        title: lang === "ar" ? "حدث خطأ" : "Error",
        description: isUnauthorized
          ? lang === "ar"
            ? "يرجى تسجيل الدخول مرة أخرى ثم حاول الحفظ."
            : "Please sign in again and try saving."
          : error.message || (lang === "ar" ? "فشل في حفظ البيانات" : "Failed to save profile"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePhotoUpload = async (file: File) => {
    if (authReady && (isGuest || !isSignedIn)) {
      toast({
        title: lang === "ar" ? "تسجيل الدخول مطلوب" : "Sign in required",
        description:
          lang === "ar"
            ? "يرجى تسجيل الدخول لرفع الصورة."
            : "Please sign in to upload a photo.",
        variant: "destructive",
      });
      return;
    }
    setIsUploadingPhoto(true);
    try {
      const headers = await getAuthHeadersAsync(false, lang);
      const form = new FormData();
      form.append("photo", file);
      const res = await fetchWithFirebaseAuth(buildApiUrl("/api/user/profile/avatar"), {
        method: "POST",
        headers,
        body: form,
        credentials: isNative ? "omit" : "include", // allow either JWT or cookie-based sessions
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        let bodyJson: any = null;
        try {
          bodyJson = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          bodyJson = null;
        }
        console.error("[Profile Photo Upload] Failed", {
          status: res.status,
          body: bodyText.slice(0, 200),
        });
        const isUnauthorized = res.status === 401 || res.status === 403;
        const serverMessage =
          bodyJson?.message ||
          bodyJson?.error ||
          bodyJson?.reason ||
          (bodyText ? bodyText.slice(0, 120) : "");
        throw new Error(
          isUnauthorized
            ? lang === "ar"
              ? "يرجى تسجيل الدخول مرة أخرى"
              : "Please sign in again"
            : serverMessage || "Failed to upload photo"
        );
      }
      const data = await res.json();
      setProfileImageUrl(data.imageUrl || null);
      if (nativeAuth && nativeUser) {
        nativeAuth.updateUser({ profileImageUrl: data.imageUrl });
      }
      setAuthError(null);
      toast({
        title: lang === "ar" ? "تم رفع الصورة" : "Photo uploaded",
      });
    } catch (error: any) {
      console.error("Profile photo upload failed:", error);
      const unauthorized = error?.message?.includes("تسجيل الدخول") || error?.message?.includes("sign in");
      if (unauthorized) {
        setAuthError("unauthorized");
      }
      toast({
        title: lang === "ar" ? "فشل رفع الصورة" : "Failed to upload photo",
        description:
          error?.message ||
          (lang === "ar" ? "تحقق من الملف وحاول مرة أخرى" : "Please check the file and try again"),
        variant: "destructive",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProfilePhotoUpload(file);
    }
    e.target.value = "";
  };

  const labels = {
    ar: {
      title: "الملف الشخصي",
      description: "عدّل بياناتك الشخصية",
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      email: "البريد الإلكتروني",
      phone: "رقم الجوال",
      save: "حفظ التغييرات",
      back: "رجوع",
      loading: "جاري التحميل...",
      saving: "جاري الحفظ...",
      firstNamePlaceholder: "أدخل اسمك الأول",
      lastNamePlaceholder: "أدخل اسم العائلة",
      emailPlaceholder: "example@email.com",
      phonePlaceholder: "+966 5xxxxxxxx",
    },
    en: {
      title: "Profile",
      description: "Edit your personal information",
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email",
      phone: "Phone Number",
      save: "Save Changes",
      back: "Back",
      loading: "Loading...",
      saving: "Saving...",
      firstNamePlaceholder: "Enter your first name",
      lastNamePlaceholder: "Enter your last name",
      emailPlaceholder: "example@email.com",
      phonePlaceholder: "+966 5xxxxxxxx",
    }
  };

  const l = labels[lang === "ar" ? "ar" : "en"];
  const isRTL = lang === "ar";
  const authErrorCopy = authError ? getUnauthorizedCopy(authError) : null;
  const showAuthLoading = !authReady && !initializedRef.current;

  return (
    <PageBackground>
      <main
        className="container mx-auto px-4 pb-10 max-w-lg"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 88px)" }}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <Card className="shadow-xl bg-background/90 dark:bg-slate-900/85 backdrop-blur-md border border-border/60">
          <CardHeader className="text-center">
            <input
              id="profile-photo-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoSelect}
              disabled={isUploadingPhoto || (authReady && (isGuest || !isSignedIn))}
            />
            <div className="mx-auto w-24 h-24 rounded-full bg-muted/30 flex items-center justify-center mb-4 overflow-hidden border border-border/60 relative">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-primary" />
              )}
              <label
                htmlFor="profile-photo-input"
                className="absolute bottom-1 right-1 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer shadow"
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </label>
            </div>
            <Button asChild variant="outline" size="sm" className="mx-auto">
              <label htmlFor="profile-photo-input" className="cursor-pointer">
                {isUploadingPhoto
                  ? lang === "ar"
                    ? "جارٍ رفع الصورة..."
                    : "Uploading photo..."
                  : lang === "ar"
                  ? "تحديث الصورة"
                  : "Update photo"}
              </label>
            </Button>
            <CardTitle className="text-2xl text-foreground">{l.title}</CardTitle>
            <CardDescription className="text-muted-foreground">{l.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{l.loading}</span>
              </div>
            ) : (
              <>
                {showAuthLoading && (
                  <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground">
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>{lang === "ar" ? "جاري تحميل الجلسة..." : "Loading session..."}</span>
                    </div>
                  </div>
                )}
                {authErrorCopy && (
                  <div className="rounded-lg border border-destructive bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground">
                    <div className="flex flex-col gap-3">
                      <span>{authErrorCopy}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPostLoginRedirect("/my-profile");
                          window.location.href = "/auth";
                        }}
                      >
                        {lang === "ar" ? "تسجيل دخول مرة أخرى" : "Sign in again"}
                      </Button>
                    </div>
                  </div>
                )}
                {authReady && (isGuest || !isSignedIn) && (
                  <div className="rounded-lg border border-destructive bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground">
                    {lang === "ar"
                      ? "تحتاج إلى تسجيل الدخول لحفظ بياناتك أو رفع الصورة."
                      : "You need to sign in to save changes or upload a photo."}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{l.firstName}</Label>
                    <div className="relative">
                      <User className={`absolute top-3 w-4 h-4 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => {
                          markInitialized();
                          setFormData({ ...formData, firstName: e.target.value });
                        }}
                        placeholder={l.firstNamePlaceholder}
                        className={isRTL ? "pr-10" : "pl-10"}
                        data-testid="input-first-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{l.lastName}</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => {
                        markInitialized();
                        setFormData({ ...formData, lastName: e.target.value });
                      }}
                      placeholder={l.lastNamePlaceholder}
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{l.email}</Label>
                  <div className="relative">
                    <Mail className={`absolute top-3 w-4 h-4 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => {
                        markInitialized();
                        setFormData({ ...formData, email: e.target.value });
                      }}
                      placeholder={l.emailPlaceholder}
                      className={isRTL ? "pr-10" : "pl-10"}
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{l.phone}</Label>
                  <div className="relative">
                    <Phone className={`absolute top-3 w-4 h-4 text-muted-foreground ${isRTL ? "right-3" : "left-3"}`} />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => {
                        if (phoneReadOnly) return;
                        markInitialized();
                        setFormData({ ...formData, phone: e.target.value });
                      }}
                      placeholder={l.phonePlaceholder}
                      className={isRTL ? "pr-10" : "pl-10"}
                      readOnly={phoneReadOnly}
                      data-testid="input-phone"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {phoneReadOnly
                      ? lang === "ar"
                        ? "رقم الجوال غير قابل للتعديل"
                        : "Phone number cannot be changed"
                      : lang === "ar"
                      ? "يمكنك تعديل رقم الجوال عند الحاجة"
                      : "You can update your phone number if needed"}
                  </p>
                </div>

                {isNative && (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-muted">
                    <div>
                      <p className="font-semibold text-sm">{lang === "ar" ? "البصمة / Face ID" : "Biometrics"}</p>
                      <p className="text-xs text-muted-foreground">
                        {biometricEnabled
                          ? lang === "ar" ? "مفعّل حالياً. يمكنك إيقافه هنا." : "Enabled. You can disable it here."
                          : lang === "ar" ? "غير مفعّل حالياً." : "Not enabled currently."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await disableBiometricSession();
                        setBiometricEnabled(false);
                        toast({
                          title: lang === "ar" ? "تم الإيقاف" : "Disabled",
                          description: lang === "ar" ? "تم إيقاف الدخول بالبصمة" : "Biometric unlock disabled",
                        });
                      }}
                      disabled={!biometricEnabled}
                    >
                      {biometricEnabled ? (lang === "ar" ? "إيقاف" : "Disable") : (lang === "ar" ? "غير مفعّل" : "Disabled")}
                    </Button>
                  </div>
                )}

                <Button 
                  onClick={handleSave} 
                  className="w-full"
                  disabled={isSaving || (authReady && (isGuest || !isSignedIn))}
                  data-testid="button-save-profile"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {l.saving}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {l.save}
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </PageBackground>
  );
}
