import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNativeUser, useNativeAuth } from "@/contexts/NativeAuthContext";
import { ArrowLeft, Save, User, Mail, Phone, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";

export default function ProfilePage() {
  const { t, lang, toggleLanguage } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const nativeUser = useNativeUser();
  const nativeAuth = useNativeAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    const loadUserData = async () => {
      setIsLoading(true);
      try {
        const response = await apiRequest("/api/user/profile", "GET");
        setFormData({
          firstName: response.firstName || "",
          lastName: response.lastName || "",
          email: response.email || "",
          phone: response.phone || nativeUser?.phone || "",
        });
      } catch (error) {
        console.error("Failed to load profile:", error);
        if (nativeUser) {
          setFormData({
            firstName: nativeUser.firstName || "",
            lastName: nativeUser.lastName || "",
            email: nativeUser.email || "",
            phone: nativeUser.phone || "",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [nativeUser]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiRequest("/api/user/profile", "POST", formData);
      
      if (nativeAuth && nativeUser) {
        nativeAuth.updateUser({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
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
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-40 bg-primary backdrop-blur-md border-b border-primary/20 shadow-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/")}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Logo size="sm" />
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-lg">
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <User className="w-10 h-10 text-primary" />
            </div>
            <CardTitle className="text-2xl">{l.title}</CardTitle>
            <CardDescription>{l.description}</CardDescription>
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
    </div>
  );
}
