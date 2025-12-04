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
import technicianBg from "@assets/stock_images/bicycle_mechanic_tec_e306465b.jpg";

export default function TechnicianRegistration() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { lang, toggleLanguage, t } = useLanguage();
  const isRTL = lang === 'ar';

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
    location: "",
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

  // Submit mutation - uses FormData for multipart upload
  const submitMutation = useMutation({
    mutationFn: async () => {
      const formDataToSend = new FormData();
      
      // Add text fields
      formDataToSend.append("name", formData.fullName);
      formDataToSend.append("email", formData.email);
      formDataToSend.append("phoneNumber", formData.phoneNumber);
      formDataToSend.append("experienceYears", formData.experienceYears || "0");
      if (formData.location) formDataToSend.append("location", formData.location);
      if (formData.nationalId) formDataToSend.append("nationalId", formData.nationalId);
      if (formData.iban) formDataToSend.append("iban", formData.iban);
      if (formData.commercialRegister) formDataToSend.append("commercialRegister", formData.commercialRegister);

      // Add files
      if (profileImageRef.current?.files?.[0]) {
        formDataToSend.append("profileImage", profileImageRef.current.files[0]);
      }
      if (nationalIdRef.current?.files?.[0]) {
        formDataToSend.append("nationalIdFile", nationalIdRef.current.files[0]);
      }
      if (commercialRef.current?.files?.[0]) {
        formDataToSend.append("commercialFile", commercialRef.current.files[0]);
      }
      if (certificationsRef.current?.files) {
        Array.from(certificationsRef.current.files).forEach(file => {
          formDataToSend.append("certifications", file);
        });
      }

      const response = await fetch("/api/public/technicians/upload", {
        method: "POST",
        body: formDataToSend,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Submission failed");
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: t('applicationSuccess'),
        description: t('applicationSuccessDesc'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/technicians'] });
      setTimeout(() => navigate("/"), 2000);
    },
    onError: (error: Error) => {
      toast({
        title: t('applicationError'),
        description: error.message.includes("already") 
          ? t('emailAlreadyRegistered') 
          : error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: keyof typeof fileNames, files: FileList | null) => {
    if (!files) return;
    if (field === "certifications") {
      setFileNames(prev => ({ ...prev, certifications: Array.from(files).map(f => f.name) }));
    } else {
      setFileNames(prev => ({ ...prev, [field]: files[0]?.name || "" }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.fullName || !formData.email || !formData.phoneNumber) {
      toast({
        title: t('applicationError'),
        description: t('requiredField'),
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate();
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen relative">
      {/* Background Image with Overlay */}
      <div 
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: `url(${technicianBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
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
              <span className="mx-2">{t('backToHome')}</span>
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
                {t('techRegTitle')}
              </h1>
            </div>
            <p className="text-white/90 drop-shadow" data-testid="text-page-subtitle">
              {t('techRegSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Personal Information Card */}
            <Card className="mb-4 bg-white/95 dark:bg-card/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  {t('personalInfo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('fullName')} *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    placeholder={t('fullNamePlaceholder')}
                    required
                    data-testid="input-fullname"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    placeholder="example@email.com"
                    required
                    data-testid="input-email"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('phone')} *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    placeholder={t('phonePlaceholder')}
                    required
                    data-testid="input-phone"
                  />
                </div>

                {/* Experience Years */}
                <div className="space-y-2">
                  <Label htmlFor="experience">{t('experienceYears')}</Label>
                  <Input
                    id="experience"
                    type="number"
                    min="0"
                    max="50"
                    value={formData.experienceYears}
                    onChange={(e) => handleInputChange("experienceYears", e.target.value)}
                    placeholder="0"
                    data-testid="input-experience"
                  />
                </div>

                {/* National ID */}
                <div className="space-y-2">
                  <Label htmlFor="nationalId">{t('nationalIdNumber')}</Label>
                  <Input
                    id="nationalId"
                    value={formData.nationalId}
                    onChange={(e) => handleInputChange("nationalId", e.target.value)}
                    placeholder={t('nationalIdPlaceholder')}
                    data-testid="input-national-id"
                  />
                </div>

                {/* IBAN */}
                <div className="space-y-2">
                  <Label htmlFor="iban">{t('ibanNumber')}</Label>
                  <Input
                    id="iban"
                    value={formData.iban}
                    onChange={(e) => handleInputChange("iban", e.target.value)}
                    placeholder={t('ibanPlaceholder')}
                    data-testid="input-iban"
                  />
                </div>

                {/* Commercial Register */}
                <div className="space-y-2">
                  <Label htmlFor="commercial">{t('commercialRegisterNumber')}</Label>
                  <Input
                    id="commercial"
                    value={formData.commercialRegister}
                    onChange={(e) => handleInputChange("commercialRegister", e.target.value)}
                    placeholder={t('commercialRegisterPlaceholder')}
                    data-testid="input-commercial-register"
                  />
                </div>

                {/* Location */}
                <div className="space-y-2">
                  <Label htmlFor="location">{t('locationArea')}</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleInputChange("location", e.target.value)}
                    placeholder={t('locationPlaceholder')}
                    data-testid="input-location"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Attachments Card */}
            <Card className="mb-6 bg-white/95 dark:bg-card/95 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="w-5 h-5 text-secondary" />
                  {t('attachmentsOptional')}
                </CardTitle>
                <CardDescription>
                  {lang === 'ar' 
                    ? 'يمكنك رفع الصور والمستندات لتسريع عملية المراجعة'
                    : 'You can upload photos and documents to speed up the review process'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Photo */}
                <div className="space-y-2">
                  <Label>{t('profilePhoto')}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-profile"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t('chooseFile')}
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
                </div>

                {/* National ID Photo */}
                <div className="space-y-2">
                  <Label>{t('nationalIdPhoto')}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-national-id"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t('chooseFile')}
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
                  <Label>{t('commercialRegisterPhoto')}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-commercial"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t('chooseFile')}
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
                  <Label>{t('professionalCerts')}</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="relative"
                      data-testid="button-upload-certs"
                    >
                      <Upload className="w-4 h-4 mx-1" />
                      {t('chooseFiles')}
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
                        {fileNames.certifications.length} {t('filesSelected')}
                      </span>
                    )}
                  </div>
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
                  {t('submitting')}
                </>
              ) : (
                <>
                  <Wrench className="w-5 h-5 mx-2" />
                  {t('submitApplication')}
                </>
              )}
            </Button>
          </form>
        </main>
      </div>
    </div>
  );
}
