import { useState, useEffect, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import { Save, User, Mail, Phone, Loader2, Camera } from "lucide-react";
import { apiRequest, queryClient, getAuthHeadersAsync } from "@/lib/queryClient";
import { Capacitor } from "@capacitor/core";
import { disableBiometricSession, isBiometricEnabled } from "@/lib/biometricSession";
import { buildApiUrl } from "@/lib/apiConfig";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";

export default function ProfilePage() {
  const { t, lang, toggleLanguage } = useLanguage();
  const { toast } = useToast();
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
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
      console.error("Failed to save profile:", error);
      toast({
        title: lang === "ar" ? "حدث خطأ" : "Error",
        description: error.message || (lang === "ar" ? "فشل في حفظ البيانات" : "Failed to save profile"),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProfilePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true);
    try {
      const headers = await getAuthHeadersAsync(false, lang);
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(buildApiUrl("/api/user/profile/photo"), {
        method: "POST",
        headers,
        body: form,
        credentials: "include", // allow either JWT or cookie-based sessions
      });
      if (!res.ok) {
        throw new Error("Failed to upload photo");
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
        description: lang === "ar" ? "تحقق من الملف وحاول مرة أخرى" : "Please check the file and try again",
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
  };

  const PageBackground = ({ children }: { children: ReactNode }) => (
    <div className="relative min-h-screen bg-background">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${workshopBg})` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
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

  return (
    <PageBackground>
      <main
        className="container mx-auto px-4 pb-10 max-w-lg"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 88px)" }}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <Card className="shadow-lg bg-black/50 backdrop-blur-md border border-white/10 text-white">
          <CardHeader className="text-center">
            <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-4 overflow-hidden border border-primary/20 relative">
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-primary" />
              )}
              <label className="absolute bottom-1 right-1 bg-primary text-white rounded-full p-2 cursor-pointer shadow">
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                  disabled={isUploadingPhoto}
                />
              </label>
            </div>
            <CardTitle className="text-2xl text-white">{l.title}</CardTitle>
            <CardDescription className="text-white/80">{l.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{l.loading}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{l.firstName}</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        placeholder={l.firstNamePlaceholder}
                        className="pl-10"
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
                    <Mail className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={l.emailPlaceholder}
                      className="pl-10"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">{l.phone}</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder={l.phonePlaceholder}
                      className="pl-10"
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
                  disabled={isSaving}
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
