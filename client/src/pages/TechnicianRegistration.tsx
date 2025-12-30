import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Upload, Check, Loader2, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import Logo from "@/components/Logo";
import LanguageToggle from "@/components/LanguageToggle";
import { queryClient } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/apiConfig";
import technicianBg from "@assets/stock_images/bicycle_mechanic_tec_e306465b.jpg";

type FieldErrors = Record<string, string>;

export default function TechnicianRegistration() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { lang, toggleLanguage, t } = useLanguage();
  const isRTL = lang === "ar";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState("");

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

  // File names for display
  const [fileNames, setFileNames] = useState({
    profileImage: "",
    nationalIdFile: "",
    commercialFile: "",
    certifications: [] as string[],
  });

  const gatherDocuments = () => {
    const docs: File[] = [];
    [profileImageRef, nationalIdRef, commercialRef, certificationsRef].forEach((ref) => {
      if (ref.current?.files) {
        docs.push(...Array.from(ref.current.files));
      }
    });
    return docs;
  };

  // Submit mutation - uses FormData for multipart upload
  const submitMutation = useMutation({
    mutationFn: async (documents: File[]) => {
      const formDataToSend = new FormData();
      formDataToSend.append("phone_number", formData.phoneNumber);
      formDataToSend.append("years_of_experience", formData.experienceYears || "0");
      formDataToSend.append("national_address", formData.nationalAddress);
      documents.forEach((file) => formDataToSend.append("documents", file));

      const response = await fetch(buildApiUrl("/api/technicians/apply"), {
        method: "POST",
        body: formDataToSend,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error: any = new Error(data.message || "Submission failed");
        error.fieldErrors = data.fieldErrors;
        throw error;
      }
      return data;
    },
    onSuccess: () => {
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
    },
    onError: (error: any) => {
      if (error.fieldErrors) {
        setErrors(error.fieldErrors);
      }
      toast({
        title: t("applicationError"),
        description: error.message.includes("already")
          ? t("emailAlreadyRegistered")
          : error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof typeof formData, value: string) => {
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
    const newErrors: FieldErrors = {};
    const docs = gatherDocuments();

    if (!formData.phoneNumber.trim()) newErrors.phone_number = t("requiredField");
    if (!formData.experienceYears.trim()) newErrors.years_of_experience = t("requiredField");
    if (!formData.nationalAddress.trim()) newErrors.national_address = t("requiredField");
    if (formData.nationalAddress.trim().length > 8) newErrors.national_address = lang === "ar" ? "الحد الأقصى 8 أحرف" : "Max 8 characters";
    const addressPattern = /^[\u0600-\u06FF0-9]{0,8}$/;
    if (formData.nationalAddress && !addressPattern.test(formData.nationalAddress)) {
      newErrors.national_address = lang === "ar" ? "أدخل أحرف عربية أو أرقام فقط" : "Use Arabic letters or numbers only";
    }
    if (docs.length === 0)
      newErrors.documents =
        lang === "ar" ? "يرجى إرفاق مستند واحد على الأقل" : "Please attach at least one document";

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    const maxSize = 5 * 1024 * 1024;
    for (const file of docs) {
      if (!allowedTypes.includes(file.type)) {
        newErrors.documents = lang === "ar" ? "صيغة ملف غير مسموحة" : "Invalid file type";
        break;
      }
      if (file.size > maxSize) {
        newErrors.documents = lang === "ar" ? "الحد الأقصى للملف 5 ميجابايت" : "File too large (max 5MB)";
        break;
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    submitMutation.mutate(docs);
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const inputErrorClass = (field: string) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <div className="min-h-screen relative">
      {/* Background Image with Overlay */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${technicianBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-primary/95 backdrop-blur-sm text-primary-foreground p-4 sticky top-0 z-50">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
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

            <LanguageToggle currentLang={lang} onToggle={toggleLanguage} />
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto p-4 pb-8">
          {/* Logo and Title */}
          <div className="text-center py-6">
            <div className="bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-2xl p-6 mb-6 inline-block">
              <Logo size="lg" className="justify-center" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Wrench className="w-6 h-6 text-primary" />
              <h1 className="text-2xl font-bold text-white drop-shadow-lg" data-testid="text-page-title">
                {t("techRegTitle")}
              </h1>
            </div>
            <p className="text-white/90 drop-shadow" data-testid="text-page-subtitle">
              {t("techRegSubtitle")}
            </p>
          </div>

          {successMessage && (
            <div className="mb-4 text-center text-sm font-medium text-green-500 bg-white/80 dark:bg-black/60 p-3 rounded-lg">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Personal Information Card */}
            <Card className="mb-4 bg-white/95 dark:bg-card/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
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
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    placeholder={t("fullNamePlaceholder")}
                    className={inputErrorClass("name")}
                    data-testid="input-fullname"
                  />
                  {errors.name && <p className="text-destructive text-sm">{errors.name}</p>}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t("email")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="example@email.com"
                    className={inputErrorClass("email")}
                    data-testid="input-email"
                  />
                  {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("phone")} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    placeholder={t("phonePlaceholder")}
                    className={inputErrorClass("phone_number")}
                    data-testid="input-phone"
                  />
                  {errors.phone_number && <p className="text-destructive text-sm">{errors.phone_number}</p>}
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
                    <p className="text-destructive text-sm">{errors.years_of_experience}</p>
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
                    data-testid="input-national-id"
                  />
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
                  <Label htmlFor="nationalAddress">{lang === "ar" ? "العنوان الوطني" : "National Address"} *</Label>
                  <Input
                    id="nationalAddress"
                    value={formData.nationalAddress}
                    maxLength={8}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^\u0600-\u06FF0-9]/g, "").slice(0, 8);
                      handleInputChange("nationalAddress", sanitized);
                    }}
                    placeholder={lang === "ar" ? "اكتب العنوان الوطني" : "Enter national address"}
                    className={inputErrorClass("national_address")}
                    data-testid="input-national-address"
                  />
                  {errors.national_address && <p className="text-destructive text-sm">{errors.national_address}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Attachments Card */}
            <Card className="mb-6 bg-white/95 dark:bg-card/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5 text-secondary" />
                  {lang === "ar" ? "المستندات مطلوبة" : "Documents are required"}
                </CardTitle>
                <CardDescription>
                  {lang === "ar"
                    ? "يرجى رفع مستندات الهوية أو الشهادات (PDF أو صورة) بحد أقصى 5 ميجابايت لكل ملف"
                    : "Please upload ID or certificates (PDF or image), max 5MB each"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Photo */}
                <div className="space-y-2">
                  <Label>{t("profilePhoto")}</Label>
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
                        accept="image/*,.pdf"
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
                  {errors.documents && <p className="text-destructive text-sm">{errors.documents}</p>}
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full bg-primary hover:bg-primary/90 text-lg py-6"
              disabled={submitMutation.isPending}
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
        </main>
      </div>
    </div>
  );
}
