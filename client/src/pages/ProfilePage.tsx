import { useState, useEffect, ReactNode } from "react";
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
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

export default function ProfilePage() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
  const { user, isGuest, authReady } = useFirebaseAuth();
  const isNative = Capacitor.isNativePlatform();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    const loadUserData = async () => {
      setIsLoading(true);
      if (isNative) {
        const enabled = await isBiometricEnabled();
        setBiometricEnabled(enabled);
      }
      try {
        const response = await apiRequest("/api/user/profile", "GET");
        setFormData({
          firstName: response.firstName || "",
          lastName: response.lastName || "",
          email: response.email || "",
          phone: response.phone || nativeUser?.phone || "",
        });
        setProfileImageUrl(response.profileImageUrl || nativeUser?.profileImageUrl || null);
      } catch (error) {
        console.error("Failed to load profile:", error);
        if (nativeUser) {
          setFormData({
            firstName: nativeUser.firstName || "",
            lastName: nativeUser.lastName || "",
            email: nativeUser.email || "",
            phone: nativeUser.phone || "",
          });
          setProfileImageUrl(nativeUser.profileImageUrl || null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [nativeUser, isNative]);

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
      await apiRequest("/api/user/profile", "POST", { ...formData, profileImageUrl });
      
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
      const res = await fetchWithFirebaseAuth(buildApiUrl("/api/user/profile/photo"), {
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
      toast({
        title: lang === "ar" ? "تم رفع الصورة" : "Photo uploaded",
      });
    } catch (error: any) {
      console.error("Profile photo upload failed:", error);
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
  const isSignedIn = Boolean(user || nativeUser);

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
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder={l.phonePlaceholder}
                      className={isRTL ? "pr-10" : "pl-10"}
                      disabled
                      data-testid="input-phone"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "رقم الجوال غير قابل للتعديل" : "Phone number cannot be changed"}
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
