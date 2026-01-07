import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Wrench,
  Package,
  Settings,
  User,
  Navigation,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ApiError } from "@/lib/apiError";
import type { Technician } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import BookingBackgroundLayout from "@/components/layout/BookingBackgroundLayout";
import type { PricingBreakdown } from "@shared/bookingTypes";

export default function ServiceBooking() {
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedService, setSelectedService] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [notes, setNotes] = useState("");

  const [location, setLocation] = useState({ lat: 24.7136, lng: 46.6753 });
  const [locationText, setLocationText] = useState("Riyadh");

  const [costBreakdown, setCostBreakdown] = useState<PricingBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [createdServiceRequestId, setCreatedServiceRequestId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  /* ------------------ DATA ------------------ */

  const services = [
    { id: "maintenance", name: "صيانة دورية", base: 150, icon: <Settings /> },
    { id: "repair", name: "إصلاح عطل", base: 100, icon: <Wrench /> },
    { id: "parts", name: "استبدال قطع", base: 0, icon: <Package /> },
  ];

  const { data: technicians, isLoading: loadingTechnicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians/nearby", location.lat, location.lng],
    enabled: !!location.lat && !!location.lng,
    queryFn: async () => {
      try {
        return await apiRequest(`/api/technicians/nearby?lat=${location.lat}&lng=${location.lng}`, "GET");
      } catch (err) {
        console.error("Technicians fetch failed, using fallback", err);
        return [];
      }
    }
  });

  const techniciansList: Technician[] =
    technicians && technicians.length > 0
      ? technicians
      : [
          {
            id: "mock-tech-1",
            userId: "mock-user",
            name: "فني تجريبي",
            phoneNumber: null,
            location: "Riyadh",
            latitude: 24.7136,
            longitude: 46.6753,
            rating: 4.8,
            reviewCount: 120,
            isAvailable: true,
            is_available: true,
            isApproved: true,
            yearsOfExperience: null,
            commercialRegister: null,
            nationalId: null,
            iban: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            distanceKm: 0,
          } as Technician,
        ];

  useEffect(() => {
    if (!selectedTechnicianId && techniciansList.length > 0) {
      setSelectedTechnicianId(techniciansList[0].id);
    }
  }, [techniciansList, selectedTechnicianId]);

  const selectedTechnician = techniciansList.find((t) => t.id === selectedTechnicianId);

  useEffect(() => {
    const fetchPricing = async () => {
      if (!selectedService || !selectedTechnicianId || !selectedTechnician) return;

      const service = services.find((s) => s.id === selectedService);
      if (!service) return;

      const distanceKm = selectedTechnician.distanceKm ?? 0;

      setLoadingBreakdown(true);

      try {
        const breakdown = await apiRequest("/api/pricing/quote", "POST", {
          serviceId: service.id,
          serviceName: service.name,
          serviceBase: service.base,
          distanceKm,
        });
        setCostBreakdown(breakdown);
      } catch (e) {
        console.error("Pricing error", e);
        toast({
          title: "خطأ",
          description: "فشل حساب التكلفة",
          variant: "destructive",
        });
      } finally {
        setLoadingBreakdown(false);
      }
    };

    fetchPricing();
  }, [selectedService, selectedTechnicianId]);

  /* ------------------ BOOKING ------------------ */

  const submitBooking = async () => {
    if (!selectedService || !selectedTechnicianId || !costBreakdown) {
      toast({
        title: "خطأ",
        description: "الرجاء إكمال جميع الخطوات",
        variant: "destructive",
      });
      return;
    }

    setSubmittingBooking(true);

    try {
      const payload = {
        serviceType: selectedService,
        technicianId: selectedTechnicianId,
        notes,
        latitude: location.lat,
        longitude: location.lng,
        location: locationText,
        status: "pending",
        scheduledAt: new Date().toISOString(),
      };

      console.log("[BOOKING PAYLOAD]", payload);

      const res = await apiRequest("/api/service-requests", "POST", payload);
      setCreatedServiceRequestId(res.id);
      setCurrentStep(4);
    } catch (error) {
      console.error("Booking error", error);

      if (isUnauthorizedError(error)) {
        window.location.href = "/api/login";
        return;
      }

      const msg =
        error instanceof ApiError && error.errors?.length
          ? error.errors.map((e) => e.message).join(" / ")
          : "فشل إنشاء الطلب";

      toast({
        title: "خطأ",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  /* ------------------ UI ------------------ */

  return (
    <BookingBackgroundLayout>
      <div className="max-w-2xl mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>حجز خدمة</CardTitle>
          </CardHeader>

          <CardContent>
            {currentStep === 0 && (
              <RadioGroup value={selectedService} onValueChange={setSelectedService}>
                {services.map((s) => (
                  <Label key={s.id} className="flex gap-3 p-3 border rounded">
                    <RadioGroupItem value={s.id} />
                    {s.icon}
                    {s.name}
                  </Label>
                ))}
              </RadioGroup>
            )}

            {currentStep === 1 && (
              <>
                <p>الموقع: {locationText}</p>
                <Button
                  onClick={() =>
                    navigator.geolocation.getCurrentPosition((p) => {
                      setLocation({
                        lat: p.coords.latitude,
                        lng: p.coords.longitude,
                      });
                      setLocationText(
                        `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`
                      );
                    })
                  }
                >
                  <Navigation className="ml-2" />
                  استخدم موقعي
                </Button>

                <Textarea
                  placeholder="ملاحظات"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </>
            )}

            {currentStep === 2 && (
              <>
                {loadingTechnicians ? (
                  <p>جاري التحميل...</p>
                ) : (
                  <RadioGroup value={selectedTechnicianId} onValueChange={setSelectedTechnicianId}>
                    {techniciansList && techniciansList.length > 0 ? (
                      techniciansList.map((tech, idx) => (
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
                              <div className="font-semibold">{`فني #${idx + 1}`}</div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>⭐ {tech.rating || "0.0"}</span>
                                <span>•</span>
                                <span>{tech.reviewCount || 0} تقييم</span>
                              </div>
                            </div>
                            <Badge>{tech.isAvailable ? "متاح" : "مشغول"}</Badge>
                          </div>
                        </Label>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        لا يوجد فنيون متاحون حالياً
                      </div>
                    )}
                  </RadioGroup>
                )}
              </>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                {loadingBreakdown && (
                  <div className="text-muted-foreground">جاري حساب التكلفة...</div>
                )}
                {costBreakdown && selectedTechnician && (
                  <Card className="border border-border">
                    <CardHeader>
                      <CardTitle className="text-lg">تأكيد الحجز</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground">الخدمة</h4>
                        <div className="flex justify-between text-sm">
                          <span>{services.find((s) => s.id === selectedService)?.name}</span>
                          <span>{costBreakdown.service?.base ?? services.find((s) => s.id === selectedService)?.base ?? 0} ر.س</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground">الفني</h4>
                        <div className="flex flex-col gap-1 text-sm">
                          <span className="font-semibold">
                            {selectedTechnician.name?.trim()
                              ? selectedTechnician.name
                              : `فني #${Math.max(1, techniciansList.findIndex((t) => t.id === selectedTechnicianId) + 1)}`}
                          </span>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <span>⭐ {Number(selectedTechnician.rating ?? 0).toFixed(1)}</span>
                            <span>•</span>
                            <span>{selectedTechnician.reviewCount ?? 0} تقييم</span>
                            <span>•</span>
                            <span>{selectedTechnician.distanceKm ?? 0} كم</span>
                            <span>•</span>
                            <span>{selectedTechnician.etaMinutes ?? 0} دقيقة</span>
                            <span>•</span>
                            <Badge variant="outline">
                              {selectedTechnician.isAvailable || (selectedTechnician as any).is_available ? "متاح" : "مشغول"}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground">التوصيل</h4>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex justify-between"><span>Base</span><span>{costBreakdown.delivery?.base ?? 0}</span></div>
                          <div className="flex justify-between"><span>per Km</span><span>{costBreakdown.delivery?.perKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>Distance (km)</span><span>{costBreakdown.delivery?.distanceKm ?? selectedTechnician.distanceKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>Min / Max</span><span>{costBreakdown.delivery?.min ?? 0} / {costBreakdown.delivery?.max ?? 0}</span></div>
                          <div className="flex justify-between font-semibold text-foreground">
                            <span>إجمالي التوصيل</span>
                            <span>{costBreakdown.delivery?.total ?? 0} ر.س</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground">الفاتورة</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Service</span>
                            <span>{costBreakdown.service?.base ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Delivery</span>
                            <span>{costBreakdown.delivery?.total ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span>{costBreakdown.subtotal ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>VAT ({costBreakdown.vatRate ?? 15}%)</span>
                            <span>{costBreakdown.vat ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between text-base font-bold text-primary pt-2">
                            <span>الإجمالي</span>
                            <span>{costBreakdown.total ?? 0} ر.س</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {currentStep === 4 && createdServiceRequestId && costBreakdown && (
              <PaymentOptions
                amount={costBreakdown.total}
                serviceRequestId={createdServiceRequestId}
                isProcessing={processingPayment}
                onSelectMethod={() => {}}
                onCancel={() => setCurrentStep(3)}
              />
            )}

            {currentStep < 4 && (
              <div className="flex gap-3 mt-4">
                {currentStep > 0 && (
                  <Button onClick={() => setCurrentStep((s) => s - 1)}>
                    <ArrowRight /> السابق
                  </Button>
                )}

                {currentStep < 3 ? (
                  <Button onClick={() => setCurrentStep((s) => s + 1)}>
                    التالي <ArrowLeft />
                  </Button>
                ) : (
                  <Button
                    onClick={submitBooking}
                    disabled={submittingBooking || loadingBreakdown || !costBreakdown || !selectedTechnician}
                  >
                    {submittingBooking ? "جارٍ الحجز..." : "تأكيد الحجز"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BookingBackgroundLayout>
  );
}
