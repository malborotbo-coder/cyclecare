import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft, Check, MapPin, Wrench, Package, Settings, User, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ApiError } from "@/lib/apiError";
import type { Technician, User as UserType, Bike as BikeType, PaymentMethod } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import { useLanguage } from "@/contexts/LanguageContext";
import BookingBackgroundLayout from "@/components/layout/BookingBackgroundLayout";
import type { PricingBreakdown } from "@shared/bookingTypes";

export default function ServiceBooking() {
  const { lang: language } = useLanguage();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedService, setSelectedService] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState({ lat: 24.7136, lng: 46.6753 }); // Riyadh center
  const [locationText, setLocationText] = useState(language === 'ar' ? "الرياض" : "Riyadh");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [userSetLocation, setUserSetLocation] = useState(false);
  const [mapUrl, setMapUrl] = useState("https://maps.google.com/?q=24.7136,46.6753");
  const [costBreakdown, setCostBreakdown] = useState<PricingBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  useEffect(() => {
    if (!userSetLocation) {
      setLocationText(language === 'ar' ? "الرياض" : "Riyadh");
    }
  }, [language, userSetLocation]);
  const [createdServiceRequestId, setCreatedServiceRequestId] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

  const t = {
    ar: {
      title: "احجز خدمة",
      steps: {
        serviceType: "نوع الخدمة",
        location: "الموقع",
        technician: "الفني",
        breakdown: "التكلفة",
        payment: "الدفع",
      },
      services: {
        maintenance: "صيانة دورية",
        repair: "إصلاح عطل",
        parts: "استبدال قطع",
      },
      prices: {
        maintenance: "150 ر.س",
        repair: "يبدأ من 100 ر.س",
        parts: "حسب القطعة",
      },
      location: {
        selectLocation: "حدد موقعك",
        currentLocation: "الموقع الحالي:",
        useCurrentLocation: "استخدم موقعي الحالي",
        gettingLocation: "جاري تحديد الموقع...",
        additionalNotes: "ملاحظات إضافية (اختياري)",
        notesPlaceholder: "أي تفاصيل إضافية عن موقعك أو حالة الدراجة...",
      },
      technician: {
        selectTechnician: "اختر فني من الفنيين المتاحين",
        loading: "جاري التحميل...",
        technicianLabel: "فني #",
        reviews: "تقييم",
        available: "متاح",
        busy: "مشغول",
        noTechnicians: "لا يوجد فنيون متاحون حالياً",
        certifiedTechnician: "فني معتمد",
        notSelected: "لم يتم الاختيار",
      },
      confirmation: {
        serviceType: "نوع الخدمة:",
        technician: "الفني:",
        location: "الموقع:",
        estimatedCost: "التكلفة المتوقعة:",
      },
      buttons: {
        previous: "السابق",
        next: "التالي",
        confirm: "تأكيد الحجز",
        confirming: "جارٍ الحجز...",
      },
      toast: {
        notSupported: "غير مدعوم",
        browserNoGeolocation: "متصفحك لا يدعم خدمة تحديد الموقع",
        locationSet: "تم تحديد الموقع",
        locationSuccess: "تم الحصول على موقعك الحالي بنجاح",
        locationError: "خطأ في تحديد الموقع",
        locationErrorGeneric: "حدث خطأ أثناء تحديد الموقع",
        permissionDenied: "يجب السماح بالوصول إلى الموقع",
        positionUnavailable: "الموقع غير متاح حالياً",
        timeout: "انتهت مهلة الحصول على الموقع",
        unauthorized: "غير مصرح",
        unauthorizedDesc: "تم تسجيل خروجك. جارٍ تسجيل الدخول مرة أخرى...",
        error: "خطأ",
        requestFailed: "فشل إنشاء الطلب:",
        serviceRequestNotFound: "لم يتم العثور على طلب الخدمة",
        paymentMethodSelected: "تم اختيار طريقة الدفع",
        bookingSuccess: "تم الحجز بنجاح!",
        technicianWillContact: "سيتواصل معك الفني قريباً لتأكيد الموعد والدفع",
        paymentSaveFailed: "فشل حفظ طريقة الدفع",
      },
      payment: {
        methods: {
          applePay: "Apple Pay",
          creditCard: "بطاقة ائتمان",
          stcPay: "STC Pay",
          bankTransfer: "حوالة بنكية",
        },
        instructions: {
          applePay: "ستتمكن من الدفع عبر Apple Pay عند تأكيد الفني",
          creditCard: "ستتمكن من الدفع ببطاقتك عند تأكيد الفني",
          stcPay: "يمكنك الدفع عبر STC Pay بعد تأكيد الموعد",
          bankTransfer: "سيتم إرسال تفاصيل التحويل البنكي قريباً",
          default: "سيتم التواصل معك لتأكيد طريقة الدفع",
        },
        preferredMethod: "طريقة الدفع المفضلة:",
      },
    },
    en: {
      title: "Book Service",
      steps: {
        serviceType: "Service Type",
        location: "Location",
        technician: "Technician",
        breakdown: "Cost Breakdown",
        payment: "Payment",
      },
      services: {
        maintenance: "Periodic Maintenance",
        repair: "Repair Issue",
        parts: "Replace Parts",
      },
      prices: {
        maintenance: "150 SAR",
        repair: "Starting from 100 SAR",
        parts: "As per part",
      },
      location: {
        selectLocation: "Select your location",
        currentLocation: "Current location:",
        useCurrentLocation: "Use my current location",
        gettingLocation: "Getting location...",
        additionalNotes: "Additional notes (optional)",
        notesPlaceholder: "Any additional details about your location or bike condition...",
      },
      technician: {
        selectTechnician: "Choose from available technicians",
        loading: "Loading...",
        technicianLabel: "Technician #",
        reviews: "reviews",
        available: "Available",
        busy: "Busy",
        noTechnicians: "No technicians available at the moment",
        certifiedTechnician: "Certified Technician",
        notSelected: "Not selected",
      },
      confirmation: {
        serviceType: "Service Type:",
        technician: "Technician:",
        location: "Location:",
        estimatedCost: "Estimated Cost:",
      },
      buttons: {
        previous: "Previous",
        next: "Next",
        confirm: "Confirm Booking",
        confirming: "Booking...",
      },
      toast: {
        notSupported: "Not Supported",
        browserNoGeolocation: "Your browser doesn't support geolocation service",
        locationSet: "Location Set",
        locationSuccess: "Successfully obtained your current location",
        locationError: "Location Error",
        locationErrorGeneric: "An error occurred while determining location",
        permissionDenied: "Location access permission required",
        positionUnavailable: "Location currently unavailable",
        timeout: "Location request timed out",
        unauthorized: "Unauthorized",
        unauthorizedDesc: "You have been logged out. Logging in again...",
        error: "Error",
        requestFailed: "Failed to create request:",
        serviceRequestNotFound: "Service request not found",
        paymentMethodSelected: "Payment method selected",
        bookingSuccess: "Booking successful!",
        technicianWillContact: "The technician will contact you soon to confirm the appointment and payment",
        paymentSaveFailed: "Failed to save payment method",
      },
      payment: {
        methods: {
          applePay: "Apple Pay",
          creditCard: "Credit Card",
          stcPay: "STC Pay",
          bankTransfer: "Bank Transfer",
        },
        instructions: {
          applePay: "You can pay via Apple Pay upon technician confirmation",
          creditCard: "You can pay with your card upon technician confirmation",
          stcPay: "You can pay via STC Pay after appointment confirmation",
          bankTransfer: "Bank transfer details will be sent soon",
          default: "We will contact you to confirm payment method",
        },
        preferredMethod: "Preferred payment method:",
      },
    },
  };

  const steps = [
    t[language].steps.serviceType,
    t[language].steps.location,
    t[language].steps.technician,
    t[language].steps.breakdown,
    t[language].steps.payment,
  ];

  const services = [
    { id: "maintenance", name: t[language].services.maintenance, icon: <Settings className="w-5 h-5" />, price: t[language].prices.maintenance, base: 150 },
    { id: "repair", name: t[language].services.repair, icon: <Wrench className="w-5 h-5" />, price: t[language].prices.repair, base: 100 },
    { id: "parts", name: t[language].services.parts, icon: <Package className="w-5 h-5" />, price: t[language].prices.parts, base: 0 },
  ];

  // Fetch user bikes
  const { data: bikes } = useQuery<BikeType[]>({
    queryKey: ["/api/bikes"],
  });

  // Fetch available technicians
  const { data: technicians, isLoading: loadingTechnicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians/nearby", location.lat, location.lng],
    enabled: !!location.lat && !!location.lng,
    queryFn: async () => {
      return apiRequest(`/api/technicians/nearby?lat=${location.lat}&lng=${location.lng}`, "GET");
    }
  });

  // Get current location from GPS
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setIsGettingLocation(false);
      toast({
        title: t[language].toast.notSupported,
        description: t[language].toast.browserNoGeolocation,
        variant: "destructive",
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setLocationText(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        setMapUrl(`https://maps.google.com/?q=${latitude},${longitude}`);
        setUserSetLocation(true);
        setIsGettingLocation(false);
        
        toast({
          title: t[language].toast.locationSet,
          description: t[language].toast.locationSuccess,
        });
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMessage = t[language].toast.locationErrorGeneric;
        
        if (error.code === 1) { // PERMISSION_DENIED
          errorMessage = t[language].toast.permissionDenied;
        } else if (error.code === 2) { // POSITION_UNAVAILABLE
          errorMessage = t[language].toast.positionUnavailable;
        } else if (error.code === 3) { // TIMEOUT
          errorMessage = t[language].toast.timeout;
        }
        
        toast({
          title: t[language].toast.locationError,
          description: errorMessage,
          variant: "destructive",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Submit booking (service request)
  const submitBooking = async () => {
    if (!selectedService || !selectedTechnicianId || !costBreakdown) {
      toast({
        title: t[language].toast.error,
        description: t[language].toast.requestFailed,
        variant: "destructive",
      });
      return;
    }
    if (location.lat == null || location.lng == null) {
      toast({
        title: t[language].toast.error,
        description: t[language].toast.locationError,
        variant: "destructive",
      });
      return;
    }
    setSubmittingBooking(true);
    try {
      const payload: any = {
        serviceType: selectedService,
        technicianId: selectedTechnicianId,
        notes,
        latitude: `${location.lat}`,
        longitude: `${location.lng}`,
        location: locationText || "Riyadh",
        status: "pending",
        scheduledAt: new Date().toISOString(),
      };
      const response = await apiRequest("/api/service-requests", "POST", payload);
      setCreatedServiceRequestId(response.id);
      nextStep(); // go to payment
    } catch (error: any) {
      console.error("Service request creation error:", error);
      if (isUnauthorizedError(error)) {
        toast({
          title: t[language].toast.unauthorized,
          description: t[language].toast.unauthorizedDesc,
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      const validationMessage =
        error instanceof ApiError && error.errors?.length
          ? error.errors.map((e) => e.message).join(" / ")
          : null;
      toast({
        title: t[language].toast.error,
        description:
          validationMessage ||
          `${t[language].toast.requestFailed} ${error?.message || ""}`,
        variant: "destructive",
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleConfirmBooking = () => {
    submitBooking();
  };

  const resetBooking = () => {
    setCurrentStep(0);
    setSelectedService("");
    setSelectedTechnicianId("");
    setCostBreakdown(null);
    setNotes("");
    setCreatedServiceRequestId(null);
    setSelectedPaymentMethod(null);
  };

  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    if (!createdServiceRequestId || !costBreakdown || !selectedTechnicianId) {
      toast({
        title: t[language].toast.error,
        description: t[language].toast.serviceRequestNotFound,
        variant: "destructive",
      });
      return;
    }
    setProcessingPayment(true);
    try {
      await apiRequest("/api/orders/mock-checkout", "POST", {
        serviceRequestId: createdServiceRequestId,
        technicianId: (selectedTechnician as any)?.isMock ? null : selectedTechnicianId,
        breakdown: costBreakdown,
        paymentMethod: "mock",
      });
      toast({
        title: t[language].toast.bookingSuccess,
        description: t[language].toast.technicianWillContact,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      resetBooking();
    } catch (error) {
      console.error("Mock payment failed:", error);
      toast({
        title: t[language].toast.error,
        description: t[language].toast.paymentSaveFailed,
        variant: "destructive",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  const getPaymentMethodName = (method: PaymentMethod): string => {
    switch (method) {
      case "stripe_apple_pay":
        return t[language].payment.methods.applePay;
      case "stripe_card":
        return t[language].payment.methods.creditCard;
      case "stc_pay":
        return t[language].payment.methods.stcPay;
      case "bank_transfer":
        return t[language].payment.methods.bankTransfer;
      default:
        return method;
    }
  };

  const getPaymentInstructions = (method: PaymentMethod): string => {
    switch (method) {
      case "stripe_apple_pay":
        return t[language].payment.instructions.applePay;
      case "stripe_card":
        return t[language].payment.instructions.creditCard;
      case "stc_pay":
        return t[language].payment.instructions.stcPay;
      case "bank_transfer":
        return t[language].payment.instructions.bankTransfer;
      default:
        return t[language].payment.instructions.default;
    }
  };

  const selectedServiceData = services.find((s) => s.id === selectedService);
  const selectedTechnician = technicians?.find((t) => t.id === selectedTechnicianId);

  // Compute cost breakdown once technician is selected
  useEffect(() => {
    const fetchBreakdown = async () => {
      if (!selectedTechnicianId || !selectedServiceData) return;
      const distanceKm = (selectedTechnician as any)?.distanceKm || 0;
      setLoadingBreakdown(true);
      try {
        const breakdown = await apiRequest("/api/pricing/quote", "POST", {
          serviceBase: selectedServiceData.base,
          serviceId: selectedServiceData.id,
          serviceName: selectedServiceData.name,
          distanceKm,
        });
        setCostBreakdown(breakdown);
      } catch (error) {
        console.error("Failed to fetch pricing", error);
        toast({
          title: t[language].toast.error,
          description: t[language].toast.requestFailed,
          variant: "destructive",
        });
      } finally {
        setLoadingBreakdown(false);
      }
    };
    fetchBreakdown();
  }, [selectedTechnicianId, selectedServiceData]);

  return (
    <BookingBackgroundLayout>
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2 text-white">{t[language].title}</h1>
            <div className="flex items-center gap-2 mt-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center flex-1">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    idx <= currentStep ? 'bg-primary text-white' : 'bg-white/40 text-white'
                  }`}>
                    {idx < currentStep ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 ${
                      idx < currentStep ? 'bg-primary' : 'bg-white/40'
                    }`}></div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {steps.map((step, idx) => (
                <span 
                  key={idx} 
                  className={`text-xs ${idx <= currentStep ? 'text-white' : 'text-white/70'}`}
                >
                  {step}
                </span>
              ))}
            </div>
          </div>

          <Card className="bg-white/85 dark:bg-slate-900/85 backdrop-blur border border-white/20 shadow-xl">
            <CardHeader>
              <CardTitle>{steps[currentStep]}</CardTitle>
            </CardHeader>
            <CardContent>
              {currentStep === 0 && (
                <RadioGroup value={selectedService} onValueChange={setSelectedService}>
                  <div className="space-y-3">
                    {services.map((service) => (
                      <Label
                        key={service.id}
                        htmlFor={service.id}
                        className={`flex items-center gap-4 p-4 rounded-md border-2 cursor-pointer transition-all hover-elevate ${
                          selectedService === service.id ? 'border-primary bg-primary/5' : 'border-border'
                        }`}
                        data-testid={`option-service-${service.id}`}
                      >
                        <RadioGroupItem value={service.id} id={service.id} />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            {service.icon}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold">{service.name}</div>
                            <div className="text-sm text-muted-foreground">{service.price}</div>
                          </div>
                        </div>
                      </Label>
                    ))}
                  </div>
                </RadioGroup>
              )}

            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="h-80 bg-muted rounded-md overflow-hidden border-2 border-border relative">
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                    style={{ border: 0 }}
                    allowFullScreen={false}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    data-testid="map-location"
                  />
                </div>
                
                <div className="bg-primary/10 p-4 rounded-md">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">{t[language].location.currentLocation} {locationText}</span>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={getCurrentLocation}
                      disabled={isGettingLocation}
                      data-testid="button-get-location"
                    >
                      <Navigation className="w-4 h-4 ml-1" />
                      {isGettingLocation ? t[language].location.gettingLocation : t[language].location.useCurrentLocation}
                    </Button>
                  </div>
                  <a 
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                    data-testid="link-open-maps"
                  >
                    {language === 'ar' ? 'فتح في Google Maps' : 'Open in Google Maps'}
                  </a>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">{t[language].location.additionalNotes}</Label>
                  <Textarea
                    id="notes"
                    placeholder={t[language].location.notesPlaceholder}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="input-notes"
                  />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <p className="text-muted-foreground mb-4">{t[language].technician.selectTechnician}</p>
                {loadingTechnicians ? (
                  <div className="text-center py-4 text-muted-foreground">{t[language].technician.loading}</div>
                ) : (
                  <RadioGroup value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                    {technicians && technicians.length > 0 ? (
                      technicians.map((tech, idx) => (
                        <Label
                          key={tech.id}
                          htmlFor={tech.id}
                          className="flex items-center gap-4 p-4 rounded-md border-2 cursor-pointer hover-elevate"
                          data-testid={`option-technician-${idx}`}
                        >
                          <RadioGroupItem value={tech.id} id={tech.id} />
                          <div className="flex items-center gap-3 flex-1">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="w-6 h-6 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold">{t[language].technician.technicianLabel}{idx + 1}</div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>⭐ {tech.rating || "0.0"}</span>
                                <span>•</span>
                                <span>{tech.reviewCount || 0} {t[language].technician.reviews}</span>
                              </div>
                            </div>
                            <Badge>{tech.isAvailable ? t[language].technician.available : t[language].technician.busy}</Badge>
                          </div>
                        </Label>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {t[language].technician.noTechnicians}
                      </div>
                    )}
                  </RadioGroup>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-md space-y-3">
                  {loadingBreakdown && (
                    <div className="text-muted-foreground">{t[language].technician.loading}</div>
                  )}
                  {costBreakdown && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t[language].confirmation.serviceType}</span>
                        <span className="font-semibold">{costBreakdown.service?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t[language].confirmation.technician}</span>
                        <span className="font-semibold">
                          {selectedTechnician ? t[language].technician.certifiedTechnician : t[language].technician.notSelected}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Distance</span>
                        <span className="font-semibold">{(selectedTechnician as any)?.distanceKm ?? "—"} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Delivery</span>
                        <span className="font-semibold">{costBreakdown.delivery?.total ?? "--"} SAR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Installation</span>
                        <span className="font-semibold">{costBreakdown.install?.total ?? 0} SAR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-semibold">{costBreakdown.subtotal ?? "--"} SAR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT (15%)</span>
                        <span className="font-semibold">{costBreakdown.vat ?? "--"} SAR</span>
                      </div>
                      <div className="border-t border-border pt-3 flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="text-xl font-bold text-primary">{costBreakdown.total ?? "--"} SAR</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {currentStep === 4 && createdServiceRequestId && costBreakdown && (
              <PaymentOptions
                amount={costBreakdown.total || 0}
                serviceRequestId={createdServiceRequestId}
                onSelectMethod={handlePaymentMethodSelect}
                onCancel={prevStep}
                isProcessing={processingPayment}
              />
            )}

            {currentStep < 4 && (
              <div className="flex gap-3 mt-6">
                {currentStep > 0 && (
                  <Button variant="outline" onClick={prevStep} data-testid="button-previous">
                    <ArrowRight className="w-4 h-4 ml-2" />
                    {t[language].buttons.previous}
                  </Button>
                )}
                {currentStep < 3 ? (
                  <Button 
                    onClick={nextStep} 
                    className="flex-1"
                    disabled={
                      (currentStep === 0 && !selectedService) ||
                      (currentStep === 2 && !selectedTechnicianId)
                    }
                    data-testid="button-next"
                  >
                    {t[language].buttons.next}
                    <ArrowLeft className="w-4 h-4 mr-2" />
                  </Button>
                ) : (
                  <Button 
                    onClick={handleConfirmBooking}
                    className="flex-1"
                    disabled={submittingBooking || !selectedTechnicianId || !selectedService || !costBreakdown}
                    data-testid="button-confirm"
                  >
                    {submittingBooking ? t[language].buttons.confirming : t[language].buttons.confirm}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  </BookingBackgroundLayout>
  );
}
