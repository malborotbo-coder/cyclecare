import { useState, useEffect, useMemo } from "react";
import { useLocation as useRouterLocation } from "wouter";
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
  Wrench,
  Package,
  Settings,
  User,
  Navigation,
  FileText,
  ClipboardCheck,
  MapPin,
  Clock,
  Route,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ApiError } from "@/lib/apiError";
import type { Technician } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import type { PricingBreakdown } from "@shared/bookingTypes";
import type { PaymentMethod } from "@shared/schema";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import { createMockOrder, saveMockOrder, type StoredOrder } from "@/lib/mockOrders";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ServiceBooking() {
  const { toast } = useToast();
  const [, setRouterLocation] = useRouterLocation();
  const { user } = useFirebaseAuth();
  const { lang } = useLanguage();

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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | "mock" | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<StoredOrder | null>(null);

  /* ------------------ DATA ------------------ */

  const services = [
    { id: "maintenance", name: "صيانة دورية", base: 150, icon: <Settings />, subtitle: "تبدأ من سعر 150 ريال" },
    { id: "repair", name: "إصلاح عطل", base: 100, icon: <Wrench />, subtitle: "حدد العطل وخل التصليح علينا" },
    { id: "parts", name: "استبدال قطع", base: 0, icon: <Package />, subtitle: "قريباً سنوفر كل م يحتاجه الدراج", disabled: true },
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

  const fallbackTechnicians = useMemo<Technician[]>(() => {
    const now = new Date().toISOString();
    return [
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
        createdAt: now,
        updatedAt: now,
        distanceKm: 0,
      } as Technician,
    ];
  }, []);

  const techniciansList = useMemo<Technician[]>(
    () => (technicians && technicians.length > 0 ? technicians : fallbackTechnicians),
    [technicians, fallbackTechnicians],
  );

  useEffect(() => {
    if (!selectedTechnicianId && techniciansList.length > 0) {
      setSelectedTechnicianId(techniciansList[0].id);
    }
  }, [techniciansList, selectedTechnicianId]);

  const selectedTechnician = useMemo(
    () => techniciansList.find((t) => t.id === selectedTechnicianId),
    [techniciansList, selectedTechnicianId],
  );

  useEffect(() => {
    const fetchPricing = async () => {
      if (!selectedService || !selectedTechnicianId || !selectedTechnician) return;

      const service = services.find((s) => s.id === selectedService);
      if (!service) return;

      const distanceKm = selectedTechnician.distanceKm ?? 0;
      const fallbackBase = Number(service.base) || 0;
      const fallbackBreakdown = {
        service: { id: service.id, name: service.name, base: fallbackBase },
        parts: { items: [], total: 0 },
        install: { accessoryFee: 0, sparePartFee: 0, total: 0 },
        delivery: { base: 0, perKm: 0, distanceKm, total: 0, min: 0, max: 0 },
        subtotal: fallbackBase,
        vatRate: 15,
        vat: Number((fallbackBase * 0.15).toFixed(2)),
        total: Number((fallbackBase * 1.15).toFixed(2)),
        breakdownVersion: "fallback",
      } as PricingBreakdown;

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
        setCostBreakdown(fallbackBreakdown);
        toast({
          title: "تم استخدام تسعير تقديري",
          description: "لم يتم جلب التسعير اللحظي، تم اعتماد تسعير تقديري مؤقت.",
        });
      } finally {
        setLoadingBreakdown(false);
      }
    };

    fetchPricing();
  }, [selectedService, selectedTechnicianId, selectedTechnician, toast]);

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
        console.warn("[Booking] Unauthorized. Falling back to demo flow.");
        const mockRequestId = `mock-sr-${Date.now()}`;
        setCreatedServiceRequestId(mockRequestId);
        setCurrentStep(4);
        toast({
          title: "تم تفعيل الموكب التجريبي",
          description: "تعذر التحقق من الدخول، سيتم المتابعة بموكب تجريبي مؤقت.",
        });
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

  const resetBooking = () => {
    setCurrentStep(0);
    setSelectedService("");
    setSelectedTechnicianId("");
    setNotes("");
    setCostBreakdown(null);
    setCreatedServiceRequestId(null);
    setProcessingPayment(false);
    setSelectedPaymentMethod(null);
    setConfirmedOrder(null);
  };

  const paymentMethodLabels: Record<string, string> = {
    stripe_apple_pay: "Apple Pay",
    stripe_card: "بطاقة ائتمان",
    stc_pay: "STC Pay",
    bank_transfer: "حوالة بنكية",
    mock: "دفع تجريبي",
  };

  const downloadInvoice = (order: StoredOrder) => {
    const invoice = {
      invoiceNumber: order.invoiceNumber,
      subtotal: order.subtotal,
      taxRate: order.taxRate,
      taxAmount: order.taxAmount,
      total: order.total,
      issuedDate: order.createdAt,
      status: "PAID",
      items: order.items,
    };

    const meta = {
      orderId: order.orderNumber,
      serviceName: order.serviceType,
      technicianName: order.technician,
      paymentMethod: paymentMethodLabels[order.paymentMethod || "mock"],
      bookingDate: order.createdAt,
      location: order.locationText,
      routeFrom: order.route?.fromLabel,
      routeTo: order.route?.toLabel,
      distanceKm: order.route?.distanceKm,
      etaMinutes: order.route?.etaMinutes,
      notes: order.notes,
    };

    const pdfUser = user
      ? {
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
        }
      : undefined;

    void generateInvoicePDF(invoice, pdfUser, lang as "ar" | "en", meta);
  };

  /* ------------------ UI ------------------ */

  return (
    <div className="relative z-10">
      <div className="max-w-2xl mx-auto p-4 mt-6 md:mt-10">
        <Card className="bg-white/85 dark:bg-black/70 text-foreground dark:text-white border-border/20 backdrop-blur-md shadow-xl">
          <CardHeader>
            <CardTitle>حجز خدمة</CardTitle>
          </CardHeader>

          <CardContent>
            {currentStep === 5 && confirmedOrder && (
              <div className="space-y-5">
                <div className="rounded-xl border border-primary/20 bg-white/90 dark:bg-white/5 p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <ClipboardCheck className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">تم تأكيد الدفع</h3>
                      <p className="text-sm text-muted-foreground">
                        رقم الطلب {confirmedOrder.orderNumber}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">الخدمة</span>
                        <span>{confirmedOrder.serviceType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">الفني</span>
                        <span>{confirmedOrder.technician}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">طريقة الدفع</span>
                        <span>{paymentMethodLabels[confirmedOrder.paymentMethod || "mock"]}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">الموقع</span>
                        <span>{confirmedOrder.locationText || "الرياض"}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4 text-primary" />
                        <span>ملخص الفاتورة</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">المجموع الفرعي</span>
                        <span>{confirmedOrder.subtotal.toFixed(2)} ر.س</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">الضريبة</span>
                        <span>{confirmedOrder.taxAmount.toFixed(2)} ر.س</span>
                      </div>
                      <div className="flex items-center justify-between text-base font-bold text-primary">
                        <span>الإجمالي</span>
                        <span>{confirmedOrder.total.toFixed(2)} ر.س</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <Route className="h-4 w-4 text-primary" />
                      <span>ملخص المسار</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">من</span>
                      <span>{confirmedOrder.route?.fromLabel || "نقطة انطلاق الفني"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">إلى</span>
                      <span>{confirmedOrder.route?.toLabel || "موقع العميل"}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {confirmedOrder.route?.distanceKm ?? 0} كم
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {confirmedOrder.route?.etaMinutes ?? 0} دقيقة
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                  <h4 className="font-semibold">تتبع الطلب</h4>
                  <OrderTrackingTimeline steps={confirmedOrder.trackingSteps} />
                </div>

                <div className="flex flex-col gap-3 md:flex-row">
                  <Button className="flex-1" onClick={() => downloadInvoice(confirmedOrder)}>
                    تحميل الفاتورة PDF
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRouterLocation("/orders")}
                  >
                    عرض طلباتي
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={resetBooking}>
                    حجز جديد
                  </Button>
                </div>
              </div>
            )}

            {currentStep === 0 && (
              <RadioGroup value={selectedService} onValueChange={setSelectedService} className="space-y-3">
                {services.map((s, idx) => (
                  <Label
                    key={s.id}
                    className={`flex gap-3 p-3 border rounded-md bg-white/90 dark:bg-white/5 ${
                      s.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-white/95 dark:hover:bg-white/10"
                    }`}
                  >
                    <RadioGroupItem value={s.id} disabled={s.disabled} />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {s.icon}
                        <span className="font-semibold">{s.name}</span>
                        {s.disabled && <Badge variant="secondary">قريباً</Badge>}
                      </div>
                      {s.subtitle && <span className="text-sm text-muted-foreground dark:text-white/70">{s.subtitle}</span>}
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            )}

            {currentStep === 1 && (
              <>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-lg font-semibold">خريطة الموقع</h4>
                      <p className="text-sm text-muted-foreground">
                        يمكنك التكبير والتحريك لتحديد موقعك بدقة.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://maps.google.com/maps?q=${location.lat},${location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        فتح في خرائط Google
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/80 shadow-xl dark:border-white/10 dark:bg-white/5">
                    <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs text-foreground shadow-sm dark:bg-black/60 dark:text-white">
                      {locationText}
                    </div>
                    <iframe
                      title="client-location"
                      src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                      className="h-[360px] w-full border-0 md:h-[420px]"
                      loading="lazy"
                      allowFullScreen
                    />
                  </div>
                </div>
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
                  className="bg-white/75 text-foreground placeholder:text-muted-foreground dark:bg-white/5 dark:text-white dark:placeholder:text-white/50 border border-white/20"
                />
              </>
            )}

            {currentStep === 2 && (
              <>
                {loadingTechnicians ? (
                  <p>جاري التحميل...</p>
                ) : (
                  <RadioGroup value={selectedTechnicianId} onValueChange={setSelectedTechnicianId} className="space-y-3">
                    {techniciansList && techniciansList.length > 0 ? (
                      techniciansList.map((tech, idx) => (
                        <Label
                          key={tech.id}
                          htmlFor={tech.id}
                          className="flex items-center gap-4 p-4 rounded-md border-2 cursor-pointer hover-elevate bg-white/85 text-foreground dark:bg-white/5 dark:text-white border-white/30 dark:border-white/10"
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
                  <Card className="border border-white/30 bg-white/90 text-foreground dark:border-white/10 dark:bg-white/5 dark:text-white backdrop-blur-md shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-lg">تأكيد الحجز</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">الخدمة</h4>
                        <div className="flex justify-between text-sm text-foreground dark:text-white">
                          <span>{services.find((s) => s.id === selectedService)?.name}</span>
                          <span>{costBreakdown.service?.base ?? services.find((s) => s.id === selectedService)?.base ?? 0} ر.س</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">الفني</h4>
                        <div className="flex flex-col gap-1 text-sm text-foreground dark:text-white">
                          <span className="font-semibold">
                            {selectedTechnician.name?.trim()
                              ? selectedTechnician.name
                              : `فني #${Math.max(1, techniciansList.findIndex((t) => t.id === selectedTechnicianId) + 1)}`}
                          </span>
                          <div className="flex items-center gap-2 text-muted-foreground dark:text-white/70">
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
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">التوصيل</h4>
                        <div className="space-y-1 text-sm text-muted-foreground dark:text-white/70">
                          <div className="flex justify-between"><span>Base</span><span>{costBreakdown.delivery?.base ?? 0}</span></div>
                          <div className="flex justify-between"><span>per Km</span><span>{costBreakdown.delivery?.perKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>Distance (km)</span><span>{costBreakdown.delivery?.distanceKm ?? selectedTechnician.distanceKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>Min / Max</span><span>{costBreakdown.delivery?.min ?? 0} / {costBreakdown.delivery?.max ?? 0}</span></div>
                          <div className="flex justify-between font-semibold text-foreground dark:text-white">
                            <span>إجمالي التوصيل</span>
                            <span>{costBreakdown.delivery?.total ?? 0} ر.س</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">الفاتورة</h4>
                        <div className="space-y-1 text-sm text-foreground dark:text-white/80">
                          <div className="flex justify-between">
                            <span>Service</span>
                            <span>{costBreakdown.service?.base ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Delivery</span>
                            <span>{costBreakdown.delivery?.total ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>{costBreakdown.subtotal ?? 0} ر.س</span>
                          </div>
                          <div className="flex justify-between">
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
                onSelectMethod={(method) => {
                  setSelectedPaymentMethod(method);

                  if (!costBreakdown || !selectedTechnician) return;

                  const order = createMockOrder({
                    serviceName: services.find((s) => s.id === selectedService)?.name || "خدمة",
                    technicianName:
                      selectedTechnician?.name ||
                      `فني #${Math.max(1, techniciansList.findIndex((t) => t.id === selectedTechnicianId) + 1)}`,
                    technicianRating: Number(selectedTechnician.rating ?? 0),
                    technicianDistanceKm: selectedTechnician.distanceKm ?? 0,
                    technicianEtaMinutes: selectedTechnician.etaMinutes ?? 25,
                    locationText,
                    notes,
                    paymentMethod: method,
                    breakdown: costBreakdown,
                  });

                  saveMockOrder(order);
                  setConfirmedOrder(order);
                  setCurrentStep(5);
                }}
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
    </div>
  );
}
