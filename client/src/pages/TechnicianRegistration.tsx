import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Upload, Check, Loader2, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import workshopBg from "@assets/generated_images/bike_repair_workshop_background.png";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import type { Technician } from "@shared/schema";
import { fetchWithFirebaseAuth } from "@/lib/apiClient";

type FieldErrors = Record<string, string>;
type ProfileData = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  profileImageUrl?: string | null;
};

export default function TechnicianRegistration() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { lang, toggleLanguage, t } = useLanguage();
  const { user } = useFirebaseAuth();
  const isRTL = lang === "ar";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const DRAFT_KEY = "technician_application_draft";

  // Form refs for file inputs
  const profileImageRef = useRef<HTMLInputElement>(null);
  const nationalIdRef = useRef<HTMLInputElement>(null);
  const commercialRef = useRef<HTMLInputElement>(null);
  const certificationsRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    experienceYears: "",
    nationalAddress: "",
    nationalId: "",
    commercialRegister: "",
    iban: "",
  });
  const dirtyFieldsRef = useRef<Record<string, boolean>>({});

  const markDirty = (field: string) => {
    dirtyFieldsRef.current[field] = true;
  };

  // File names for display
  const [fileNames, setFileNames] = useState({
    profileImage: "",
    nationalIdFile: "",
    commercialFile: "",
    certifications: [] as string[],
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      setFormData((prev) => ({ ...prev, ...draft }));
      setDraftRestored(true);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  const { data: profile, isLoading: profileLoading } = useQuery<ProfileData>({
    queryKey: ["/api/user/profile"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => apiRequest("/api/user/profile", "GET"),
  });

  const { data: technicianRecord, isLoading: technicianLoading } = useQuery<Technician | null>({
    queryKey: ["/api/technicians/me"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => apiRequest("/api/technicians/me", "GET"),
  });

  const effectiveStatus = (technicianRecord as any)?.status || applicationStatus || null;
  const isApproved = effectiveStatus === "approved";
  const isPending = effectiveStatus === "pending";
  const isRejected = effectiveStatus === "rejected";
  const hasExistingApplication = Boolean(effectiveStatus);
  const showApplicationStatus = hasExistingApplication && !technicianLoading;

  const profileComplete = Boolean(profile?.firstName && profile?.lastName && profile?.phone);

  const missingProfileFields = [
    !profile?.firstName || !profile?.lastName ? (lang === "ar" ? "الاسم الكامل" : "Full name") : null,
    !profile?.phone ? (lang === "ar" ? "رقم الجوال" : "Phone") : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    const firstName = profile?.firstName || user?.firstName || "";
    const lastName = profile?.lastName || user?.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim();
    setFormData((prev) => {
      const next = {
        ...prev,
        fullName: dirtyFieldsRef.current.fullName ? prev.fullName : fullName,
        email: dirtyFieldsRef.current.email ? prev.email : profile?.email || user?.email || "",
        phoneNumber: dirtyFieldsRef.current.phoneNumber ? prev.phoneNumber : profile?.phone || user?.phone || "",
      };
      const unchanged =
        next.fullName === prev.fullName &&
        next.email === prev.email &&
        next.phoneNumber === prev.phoneNumber;
      return unchanged ? prev : next;
    });
  }, [profile, user]);

  useEffect(() => {
    // Redirect approved technicians straight to dashboard.
    if (isApproved) {
      navigate("/technician");
    }
  }, [isApproved, navigate]);

  useEffect(() => {
    saveDraft();
  }, [formData]);

  const saveDraft = () => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
  };

  const clearDraft = () => {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(DRAFT_KEY);
  };

  const getSelectedFiles = () => {
    const profileImage = profileImageRef.current?.files?.[0] || null;
    const nationalIdFile = nationalIdRef.current?.files?.[0] || null;
    const commercialFile = commercialRef.current?.files?.[0] || null;
    const certifications = certificationsRef.current?.files
      ? Array.from(certificationsRef.current.files)
      : [];
    return { profileImage, nationalIdFile, commercialFile, certifications };
  };

  // Submit mutation - uses FormData for multipart upload
  const submitMutation = useMutation({
    mutationFn: async (payload: FormData) => {
      const response = await fetchWithFirebaseAuth(buildApiUrl("/api/technicians/apply"), {
        method: "POST",
        credentials: "include",
        body: payload,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error: any = new Error(data.message || "Submission failed");
        error.fieldErrors = data.fieldErrors || data.errors;
        error.code = data.code;
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      clearDraft();
      setDraftRestored(false);
      setSuccessMessage(
        lang === "ar"
          ? "تم إرسال طلبك وهو قيد المراجعة."
          : "Your application has been submitted and is under review."
      );
      setErrors({});
      toast({
        title: t("applicationSuccess"),
        description: t("applicationSuccessDesc"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/technicians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/me"] });
      setApplicationStatus("pending");
    },
    onError: (error: any) => {
      const normalizeFieldErrors = (fieldErrors: any): FieldErrors => {
        if (!fieldErrors) return {};
        if (Array.isArray(fieldErrors)) {
          return fieldErrors.reduce((acc, item) => {
            if (item?.field && item?.message) {
              acc[item.field] = item.message;
            }
            return acc;
          }, {} as FieldErrors);
        }
        return fieldErrors as FieldErrors;
      };

      const normalizedErrors = normalizeFieldErrors(error.fieldErrors);
      if (Object.keys(normalizedErrors).length > 0) {
        setErrors(normalizedErrors);
      }

      const fieldLabels = {
        ar: {
          name: "الاسم الكامل",
          email: "البريد الإلكتروني",
          phone_number: "رقم الجوال",
          years_of_experience: "سنوات الخبرة",
          national_id: "رقم الهوية",
          national_address: "العنوان الوطني",
          profile_image: "صورة الملف الشخصي",
          documents: "المستندات",
        },
        en: {
          name: "Full name",
          email: "Email",
          phone_number: "Phone number",
          years_of_experience: "Years of experience",
          national_id: "National ID",
          national_address: "National address",
          profile_image: "Profile image",
          documents: "Documents",
        },
      };

      const resolveErrorMessage = () => {
        const entries = Object.entries(normalizedErrors);
        if (entries.length === 0) return null;
        const [field, message] = entries[0];
        const label = fieldLabels[lang]?.[field as keyof typeof fieldLabels.ar];
        return label ? `${label}: ${message}` : message;
      };
      toast({
        title: t("applicationError"),
        description:
          resolveErrorMessage() ||
          (error.code === "STORAGE_UPLOAD_FAILED"
            ? lang === "ar"
              ? "فشل رفع الملفات. حاول مرة أخرى."
              : "File upload failed. Please try again."
            : error.message?.includes("already")
            ? t("emailAlreadyRegistered")
            : error.message || (lang === "ar" ? "تعذر إكمال الطلب." : "Unable to complete the request.")),
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    markDirty(field);
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: keyof typeof fileNames, files: FileList | null) => {
    if (!files) return;
    if (field === "certifications") {
      setFileNames((prev) => ({ ...prev, certifications: Array.from(files).map((f) => f.name) }));
    } else {
      setFileNames((prev) => ({ ...prev, [field]: files[0]?.name || "" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileComplete) {
      toast({
        title: lang === "ar" ? "أكمل بياناتك أولاً" : "Complete your profile first",
        description:
          lang === "ar"
            ? "يرجى تعبئة الاسم الكامل ورقم الجوال من صفحة بياناتي."
            : "Please complete your full name and phone number in your profile.",
        variant: "destructive",
      });
      return;
    }
    if (hasExistingApplication) {
      toast({
        title: lang === "ar" ? "طلب قائم" : "Application already submitted",
        description:
          lang === "ar"
            ? "تم إرسال طلبك مسبقًا، يرجى انتظار رد الإدارة."
            : "Your application is already submitted. Please wait for admin response.",
      });
      return;
    }
    const newErrors: FieldErrors = {};
    const { profileImage, nationalIdFile, commercialFile, certifications } = getSelectedFiles();

    if (!formData.fullName.trim()) {
      newErrors.name = lang === "ar" ? "الاسم الكامل مطلوب" : "Full name is required";
    }
    if (!formData.phoneNumber.trim()) {
      newErrors.phone_number = lang === "ar" ? "رقم الجوال مطلوب" : "Phone number is required";
    }

    const normalizedAddress = formData.nationalAddress.trim().toUpperCase();
    if (!normalizedAddress) {
      newErrors.national_address =
        lang === "ar" ? "العنوان الوطني مطلوب" : "National address is required";
    } else if (!nationalAddressPattern.test(normalizedAddress)) {
      newErrors.national_address =
        lang === "ar"
          ? "العنوان الوطني يجب أن يكون 4 أحرف متبوعة بـ 4 أرقام (مثال: ABCD1234)"
          : "National address must be 4 letters followed by 4 numbers (e.g. ABCD1234)";
    }

    const hasProfileImage = Boolean(profileImage || profile?.profileImageUrl);
    if (!hasProfileImage) {
      newErrors.profile_image =
        lang === "ar" ? "صورة الملف الشخصي مطلوبة" : "Personal profile image is required";
    } else if (profileImage && !profileImage.type.startsWith("image/")) {
      newErrors.profile_image =
        lang === "ar" ? "صورة الملف الشخصي يجب أن تكون صورة فقط" : "Profile image must be an image file";
    } else if (profileImage && profileImage.size > 5 * 1024 * 1024) {
      newErrors.profile_image =
        lang === "ar" ? "صورة الملف الشخصي كبيرة جدًا (حد أقصى 5 ميجابايت)" : "Profile image is too large (max 5MB)";
    }

    if (formData.experienceYears.trim()) {
      const parsedYears = Number(formData.experienceYears);
      if (!Number.isFinite(parsedYears) || parsedYears < 0) {
        newErrors.years_of_experience =
          lang === "ar" ? "سنوات الخبرة يجب أن تكون رقمًا صالحًا" : "Years of experience must be valid";
      }
    }

    const optionalFiles = [nationalIdFile, commercialFile, ...certifications].filter(
      Boolean,
    ) as File[];
    const allowedTypes = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "application/pdf"];
    const maxSize = 5 * 1024 * 1024;
    if (optionalFiles.length > 0) {
      for (const file of optionalFiles) {
        if (!allowedTypes.includes(file.type)) {
          newErrors.documents =
            lang === "ar" ? "صيغة الملف غير مدعومة" : "Unsupported file type";
          break;
        }
        if (file.size > maxSize) {
          newErrors.documents =
            lang === "ar" ? "حجم الملف كبير جدًا (حد أقصى 5 ميجابايت)" : "File is too large (max 5MB)";
          break;
        }
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload = new FormData();
    payload.append("phone_number", formData.phoneNumber.trim());
    if (formData.experienceYears.trim()) {
      payload.append("years_of_experience", formData.experienceYears.trim());
    }
    payload.append("national_address", normalizedAddress);
    if (formData.nationalId.trim()) {
      payload.append("national_id", formData.nationalId.trim());
    }
    if (formData.iban.trim()) {
      payload.append("iban", formData.iban.trim());
    }
    if (formData.commercialRegister.trim()) {
      payload.append("commercial_register", formData.commercialRegister.trim());
    }
    if (profileImage) {
      payload.append("profileImage", profileImage);
    }
    if (nationalIdFile) {
      payload.append("nationalIdFile", nationalIdFile);
    }
    if (commercialFile) {
      payload.append("commercialFile", commercialFile);
    }
    certifications.forEach((file) => payload.append("certifications", file));

    submitMutation.mutate(payload);
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const inputErrorClass = (field: string) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive" : "";
  const identityReadOnlyClass = "bg-muted/50 text-muted-foreground cursor-not-allowed";
  const errorMessageClass =
    "rounded-md border border-destructive bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground";
  const nationalAddressPattern = /^[A-Z]{4}\d{4}$/;
  const profileImageSelected = Boolean(fileNames.profileImage || profile?.profileImageUrl);
  const nationalAddressValid = nationalAddressPattern.test(
    formData.nationalAddress.trim().toUpperCase(),
  );
  const canSubmit =
    !submitMutation.isPending &&
    profileComplete &&
    !hasExistingApplication &&
    profileImageSelected &&
    nationalAddressValid;

  return (
    <div className="min-h-screen relative bg-transparent" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Background Image with Overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${workshopBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "scroll",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header
          className="bg-primary/90 backdrop-blur-sm text-primary-foreground p-4 sticky top-0 z-50"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
        >
        <div className="max-w-2xl mx-auto flex items-center justify-between text-primary-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="text-primary-foreground hover:bg-primary-foreground/10"
              data-testid="button-back-home"
            >
              <BackIcon className="w-4 h-4" />
              <span className="mx-2">{t("backToHome")}</span>
            </Button>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto p-4 pb-8 text-foreground">
          {/* Logo and Title */}
          <div className="text-center py-6">
            <div className="bg-background/85 dark:bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 mb-6 inline-block border border-border/40">
              <Logo size="lg" className="justify-center" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Wrench className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground dark:text-white drop-shadow-lg" data-testid="text-page-title">
                {t("techRegTitle")}
              </h1>
            </div>
            <p className="text-muted-foreground drop-shadow" data-testid="text-page-subtitle">
              {t("techRegSubtitle")}
            </p>
          </div>

          {draftRestored && (
            <div className="mb-4 text-center text-sm font-semibold text-white bg-amber-500 p-3 rounded-lg border border-amber-600">
              {lang === "ar"
                ? "تم استرجاع بيانات النموذج. يرجى إعادة رفع المستندات لإكمال الطلب."
                : "We restored your form data. Please re-attach your documents to continue."}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 text-center text-sm font-medium text-emerald-600 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
              {successMessage}
            </div>
          )}

          {profileLoading || technicianLoading ? (
            <div className="mb-4 text-center text-sm font-medium text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/40">
              {lang === "ar" ? "جارٍ تحميل البيانات..." : "Loading your data..."}
            </div>
          ) : null}

          {!profileComplete && !profileLoading && (
            <Card className="mb-4 bg-destructive border border-destructive shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-destructive-foreground">
                  {lang === "ar" ? "أكمل بياناتك أولاً" : "Complete your profile first"}
                </CardTitle>
                <CardDescription className="text-destructive-foreground/90">
                  {lang === "ar"
                    ? "لا يمكن التقديم كفني قبل تعبئة البيانات الأساسية في صفحة بياناتي."
                    : "You must complete your profile before submitting a technician application."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {missingProfileFields.length > 0 && (
                  <div className="text-sm font-semibold text-destructive-foreground">
                    {lang === "ar" ? "الحقول الناقصة:" : "Missing fields:"} {missingProfileFields.join("، ")}
                  </div>
                )}
                <Button type="button" onClick={() => navigate("/my-profile")} data-testid="button-go-profile">
                  {lang === "ar" ? "اذهب إلى بياناتي" : "Go to Profile"}
                </Button>
              </CardContent>
            </Card>
          )}

          {showApplicationStatus && (
            <Card className="mb-4 bg-primary/10 border border-primary/20">
              <CardHeader>
                <CardTitle className="text-base">
                  {isPending
                    ? lang === "ar"
                      ? "تم إرسال طلبك"
                      : "Application submitted"
                    : isRejected
                    ? lang === "ar"
                      ? "تم رفض الطلب"
                      : "Application rejected"
                    : lang === "ar"
                    ? "طلبك معتمد"
                    : "Application approved"}
                </CardTitle>
                <CardDescription>
                  {isPending
                    ? lang === "ar"
                      ? "يرجى انتظار رد الإدارة. لا يمكنك التقديم مرة أخرى."
                      : "Please wait for admin response. You cannot submit another application."
                    : isRejected
                    ? lang === "ar"
                      ? "يرجى التواصل مع الإدارة لمراجعة الطلب."
                      : "Please contact admin for further instructions."
                    : lang === "ar"
                    ? "سيتم تحويلك إلى لوحة الفني."
                    : "You will be redirected to the technician dashboard."}
                </CardDescription>
              </CardHeader>
              {!isApproved && (
                <CardContent>
                  <Button type="button" variant="outline" onClick={() => navigate("/support")}>
                    {lang === "ar" ? "التواصل مع الدعم" : "Contact support"}
                  </Button>
                </CardContent>
              )}
            </Card>
          )}

          {!hasExistingApplication && (
            <form onSubmit={handleSubmit}>
            {/* Personal Information Card */}
            <Card className="mb-4 bg-background/85 dark:bg-slate-900/80 backdrop-blur-md border border-border/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <Wrench className="w-5 h-5 text-primary" />
                  {t("personalInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t("fullName")} *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    readOnly
                    placeholder={t("fullNamePlaceholder")}
                    className={`${inputErrorClass("name")} ${identityReadOnlyClass}`}
                    data-testid="input-fullname"
                  />
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "يتم تعبئته من صفحة بياناتي" : "Loaded from your profile"}
                  </p>
                  {errors.name && <p className={errorMessageClass}>{errors.name}</p>}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    readOnly
                    placeholder="example@email.com"
                    className={`${inputErrorClass("email")} ${identityReadOnlyClass}`}
                    data-testid="input-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "يتم تعبئته من صفحة بياناتي" : "Loaded from your profile"}
                  </p>
                  {errors.email && <p className={errorMessageClass}>{errors.email}</p>}
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("phone")} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phoneNumber}
                    readOnly
                    placeholder={t("phonePlaceholder")}
                    className={`${inputErrorClass("phone_number")} ${identityReadOnlyClass}`}
                    data-testid="input-phone"
                  />
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar" ? "يتم تعبئته من صفحة بياناتي" : "Loaded from your profile"}
                  </p>
                  {errors.phone_number && <p className={errorMessageClass}>{errors.phone_number}</p>}
                </div>

                {/* Experience Years */}
                <div className="space-y-2">
                  <Label htmlFor="experience">{t("experienceYears")}</Label>
                  <Input
                    id="experience"
                    type="number"
                    min="0"
                    max="50"
                    value={formData.experienceYears}
                    onChange={(e) => handleInputChange("experienceYears", e.target.value)}
                    placeholder="0"
                    className={inputErrorClass("years_of_experience")}
                    data-testid="input-experience"
                  />
                  {errors.years_of_experience && (
                    <p className={errorMessageClass}>{errors.years_of_experience}</p>
                  )}
                </div>

                {/* National ID */}
                <div className="space-y-2">
                  <Label htmlFor="nationalId">{t("nationalIdNumber")}</Label>
                  <Input
                    id="nationalId"
                    value={formData.nationalId}
                    onChange={(e) => handleInputChange("nationalId", e.target.value)}
                    placeholder={t("nationalIdPlaceholder")}
                    className={inputErrorClass("national_id")}
                    data-testid="input-national-id"
                  />
                  {errors.national_id && <p className={errorMessageClass}>{errors.national_id}</p>}
                </div>

                {/* IBAN */}
                <div className="space-y-2">
                  <Label htmlFor="iban">{t("ibanNumber")}</Label>
                  <Input
                    id="iban"
                    value={formData.iban}
                    onChange={(e) => handleInputChange("iban", e.target.value)}
                    placeholder={t("ibanPlaceholder")}
                    data-testid="input-iban"
                  />
                </div>

                {/* Commercial Register */}
                <div className="space-y-2">
                  <Label htmlFor="commercial">{t("commercialRegisterNumber")}</Label>
                  <Input
                    id="commercial"
                    value={formData.commercialRegister}
                    onChange={(e) => handleInputChange("commercialRegister", e.target.value)}
                    placeholder={t("commercialRegisterPlaceholder")}
                    data-testid="input-commercial-register"
                  />
                </div>

                {/* National Address */}
                <div className="space-y-2">
                  <Label htmlFor="nationalAddress">
                    {lang === "ar" ? "العنوان الوطني" : "National Address"} *
                  </Label>
                  <Input
                    id="nationalAddress"
                    value={formData.nationalAddress}
                    maxLength={8}
                    onChange={(e) => {
                      const sanitized = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 8);
                      handleInputChange("nationalAddress", sanitized);
                    }}
                    placeholder={lang === "ar" ? "مثال: ABCD1234" : "Example: ABCD1234"}
                    className={inputErrorClass("national_address")}
                    data-testid="input-national-address"
                  />
                  {errors.national_address && <p className={errorMessageClass}>{errors.national_address}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Attachments Card */}
            <Card className="mb-6 bg-background/85 dark:bg-slate-900/80 backdrop-blur-md border border-border/40">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                  <Upload className="w-5 h-5 text-secondary" />
                  {lang === "ar" ? "المستندات" : "Documents"}
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  {lang === "ar"
                    ? "صورة الملف الشخصي مطلوبة، وباقي المستندات اختيارية (PDF أو صورة) بحد أقصى 5 ميجابايت لكل ملف"
                    : "Profile photo is required; other documents are optional (PDF or image), max 5MB each"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Photo */}
                <div className="space-y-2">
                  <Label>{t("profilePhoto")} *</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-profile"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t("chooseFile")}
                      <input
                        ref={profileImageRef}
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => handleFileChange("profileImage", e.target.files)}
                      />
                    </Button>
                    {fileNames.profileImage && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        {fileNames.profileImage}
                      </span>
                    )}
                  </div>
                  {errors.profile_image && <p className={errorMessageClass}>{errors.profile_image}</p>}
                </div>

                {/* National ID Photo */}
                <div className="space-y-2">
                  <Label>{t("nationalIdPhoto")}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-national-id"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t("chooseFile")}
                      <input
                        ref={nationalIdRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => handleFileChange("nationalIdFile", e.target.files)}
                      />
                    </Button>
                    {fileNames.nationalIdFile && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        {fileNames.nationalIdFile}
                      </span>
                    )}
                  </div>
                </div>

                {/* Commercial Register Photo */}
                <div className="space-y-2">
                  <Label>{t("commercialRegisterPhoto")}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-commercial"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t("chooseFile")}
                      <input
                        ref={commercialRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => handleFileChange("commercialFile", e.target.files)}
                      />
                    </Button>
                    {fileNames.commercialFile && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        {fileNames.commercialFile}
                      </span>
                    )}
                  </div>
                </div>

                {/* Certifications */}
                <div className="space-y-2">
                  <Label>{t("professionalCerts")}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-certs"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t("chooseFiles")}
                      <input
                        ref={certificationsRef}
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => handleFileChange("certifications", e.target.files)}
                      />
                    </Button>
                    {fileNames.certifications.length > 0 && (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <Check className="w-4 h-4" />
                        {fileNames.certifications.length} {t("filesSelected")}
                      </span>
                    )}
                  </div>
                  {errors.documents && <p className={errorMessageClass}>{errors.documents}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-lg py-6"
              disabled={!canSubmit}
              data-testid="button-submit-application"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mx-2 animate-spin" />
                  {t("submitting")}
                </>
              ) : (
                <>
                  <Wrench className="w-5 h-5 mx-2" />
                  {t("submitApplication")}
                </>
              )}
            </Button>
          </form>
          )}
        </main>
      </div>
    </div>
  );
}
