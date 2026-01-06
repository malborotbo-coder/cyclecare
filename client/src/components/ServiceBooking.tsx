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
import type { Technician, PaymentMethod } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import { useLanguage } from "@/contexts/LanguageContext";
import BookingBackgroundLayout from "@/components/layout/BookingBackgroundLayout";
import type { PricingBreakdown } from "@shared/bookingTypes";

export default function ServiceBooking() {
  const { lang } = useLanguage();
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

  const { data: technicians = [], isLoading: loadingTechnicians } =
    useQuery<Technician[]>({
      queryKey: ["/api/technicians/nearby", location.lat, location.lng],
      queryFn: () =>
        apiRequest(
          `/api/technicians/nearby?lat=${location.lat}&lng=${location.lng}`,
          "GET"
        ),
    });

  const selectedTechnician = technicians.find(
    (t) => t.id === selectedTechnicianId
  );

  /* ------------------ PRICING (FIXED) ------------------ */

  useEffect(() => {
    const fetchPricing = async () => {
      if (!selectedService || !selectedTechnicianId) return;

      const service = services.find((s) => s.id === selectedService);
      if (!service) return;

      const distanceKm = (selectedTechnician as any)?.distanceKm ?? 0;

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
        latitude: String(location.lat),
        longitude: String(location.lng),
        location: locationText,
        status: "pending",
        scheduledAt: new Date().toISOString(),
      };

      console.log("[BOOKING PAYLOAD]", payload);

      const res = await apiRequest("/api/service-requests", "POST", payload);
      setCreatedServiceRequestId(res.id);
      setCurrentStep(4);
    } catch (error: any) {
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
                  <RadioGroup
                    value={selectedTechnicianId}
                    onValueChange={setSelectedTechnicianId}
                  >
                    {technicians.map((t, i) => (
                      <Label key={t.id} className="flex gap-3 p-3 border rounded">
                        <RadioGroupItem value={t.id} />
                        <User />
                        فني #{i + 1}
                        <Badge>{t.isAvailable ? "متاح" : "مشغول"}</Badge>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              </>
            )}

            {currentStep === 3 && costBreakdown && (
              <div>
                <p>الإجمالي: {costBreakdown.total} ر.س</p>
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
                    disabled={submittingBooking || loadingBreakdown}
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