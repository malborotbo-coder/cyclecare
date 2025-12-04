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
import type { Technician, User as UserType, Bike as BikeType, PaymentMethod } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import { useLanguage } from "@/contexts/LanguageContext";
import bookingBgImage from "@assets/generated_images/Professional_bike_workshop_scene_2f400594.png";

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
        confirmation: "التأكيد",
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
        confirmation: "Confirmation",
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
    t[language].steps.confirmation,
    t[language].steps.payment,
  ];

  const services = [
    { id: "maintenance", name: t[language].services.maintenance, icon: <Settings className="w-5 h-5" />, price: t[language].prices.maintenance },
    { id: "repair", name: t[language].services.repair, icon: <Wrench className="w-5 h-5" />, price: t[language].prices.repair },
    { id: "parts", name: t[language].services.parts, icon: <Package className="w-5 h-5" />, price: t[language].prices.parts },
  ];

  // Fetch user bikes
  const { data: bikes } = useQuery<BikeType[]>({
    queryKey: ["/api/bikes"],
  });

  // Fetch available technicians
  const { data: technicians, isLoading: loadingTechnicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
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

  // Create service request mutation
  const createServiceRequest = useMutation({
    mutationFn: async (data: any) => {
      console.log("Sending request to API:", data);
      const response = await apiRequest("/api/service-requests", "POST", data);
      console.log("API response:", response);
      return response;
    },
    onSuccess: (data) => {
      console.log("Service request created successfully:", data);
      setCreatedServiceRequestId(data.id);
      nextStep(); // Move to payment step
    },
    onError: (error: Error) => {
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
      toast({
        title: t[language].toast.error,
        description: `${t[language].toast.requestFailed} ${error.message}`,
        variant: "destructive",
      });
    },
  });

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
    const selectedBike = bikes?.[0]; // Use first bike for now
    
    const requestData: any = {
      serviceType: selectedService,
      technicianId: selectedTechnicianId,
      notes,
      latitude: location.lat.toString(),
      longitude: location.lng.toString(),
      location: locationText,
      status: "pending",
    };

    // Only include bikeId if a bike exists
    if (selectedBike?.id) {
      requestData.bikeId = selectedBike.id;
    }
    
    console.log("Creating service request with data:", requestData);
    createServiceRequest.mutate(requestData);
  };

  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    
    if (!createdServiceRequestId) {
      toast({
        title: t[language].toast.error,
        description: t[language].toast.serviceRequestNotFound,
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Update service request with payment method (store as note for now)
      await apiRequest(`/api/service-requests/${createdServiceRequestId}`, "PATCH", {
        notes: `${notes}\n\n${t[language].payment.preferredMethod} ${getPaymentMethodName(method)}`
      });
      
      // Show success with instructions
      toast({
        title: t[language].toast.paymentMethodSelected,
        description: getPaymentInstructions(method),
      });

      // Wait a bit then complete booking
      setTimeout(() => {
        toast({
          title: t[language].toast.bookingSuccess,
          description: t[language].toast.technicianWillContact,
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
        
        // Reset form
        setCurrentStep(0);
        setSelectedService("");
        setSelectedTechnicianId("");
        setNotes("");
        setCreatedServiceRequestId(null);
        setSelectedPaymentMethod(null);
      }, 2000);
    } catch (error) {
      console.error("Failed to update payment method:", error);
      toast({
        title: t[language].toast.error,
        description: t[language].toast.paymentSaveFailed,
        variant: "destructive",
      });
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

  return (
    <div 
      className="min-h-screen p-4 relative bg-cover bg-center"
      style={{ backgroundImage: `url(${bookingBgImage})` }}
    >
      {/* Subtle overlay for better readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background/95"></div>
      
      <div className="max-w-2xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t[language].title}</h1>
          <div className="flex items-center gap-2 mt-4">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  idx <= currentStep ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}>
                  {idx < currentStep ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 ${
                    idx < currentStep ? 'bg-primary' : 'bg-muted'
                  }`}></div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step, idx) => (
              <span 
                key={idx} 
                className={`text-xs ${idx <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>

        <Card>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t[language].confirmation.serviceType}</span>
                    <span className="font-semibold">{selectedServiceData?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t[language].confirmation.technician}</span>
                    <span className="font-semibold">
                      {selectedTechnician ? t[language].technician.certifiedTechnician : t[language].technician.notSelected}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t[language].confirmation.location}</span>
                    <span className="font-semibold">{locationText}</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between">
                    <span className="text-muted-foreground">{t[language].confirmation.estimatedCost}</span>
                    <span className="text-xl font-bold text-primary">{selectedServiceData?.price}</span>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && createdServiceRequestId && (
              <PaymentOptions
                amount={150}
                serviceRequestId={createdServiceRequestId}
                onSelectMethod={handlePaymentMethodSelect}
                onCancel={prevStep}
                isProcessing={false}
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
                    disabled={createServiceRequest.isPending || !selectedTechnicianId || !selectedService}
                    data-testid="button-confirm"
                  >
                    {createServiceRequest.isPending ? t[language].buttons.confirming : t[language].buttons.confirm}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
