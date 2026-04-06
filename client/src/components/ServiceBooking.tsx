import { useState, useEffect, useMemo } from "react";
import { useLocation as useRouterLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { ApiError } from "@/lib/apiError";
import type { Bike, Technician } from "@shared/schema";
import PaymentOptions from "./PaymentOptions";
import type { PricingBreakdown } from "@shared/bookingTypes";
import type { PaymentMethod } from "@shared/schema";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import { createMockOrder, saveMockOrder, type StoredOrder } from "@/lib/mockOrders";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  loadBookingDraft,
  clearBookingDraft,
} from "@/lib/authRedirect";

type TechnicianBookingCompat = Omit<
  Partial<Technician>,
  "createdAt" | "updatedAt" | "latitude" | "longitude" | "rating" | "reviewCount" | "isAvailable"
> & {
  id: string;
  userId?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  location?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  rating?: number | string | null;
  reviewCount?: number | null;
  review_count?: number | null;
  isAvailable?: boolean | null;
  is_available?: boolean | null;
  isApproved?: boolean | null;
  status?: string | null;
  is_active?: boolean | null;
  yearsOfExperience?: number | null;
  years_of_experience?: number | null;
  commercialRegister?: string | null;
  nationalId?: string | null;
  iban?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  pricePreview?: { total?: number | string | null } | null;
  isMock?: boolean;
};

export default function ServiceBooking() {
  const { toast } = useToast();
  const [, setRouterLocation] = useRouterLocation();
  const { user, isGuest } = useFirebaseAuth();
  const { lang } = useLanguage();
  const tr = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const currencyLabel = lang === "ar" ? "ر.س" : "SAR";
  const kmLabel = lang === "ar" ? "كم" : "km";
  const minutesLabel = lang === "ar" ? "دقيقة" : "min";

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedService, setSelectedService] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [selectedBikeId, setSelectedBikeId] = useState("");
  const [notes, setNotes] = useState("");

  const [location, setLocation] = useState({ lat: 24.7136, lng: 46.6753 });
  const [locationText, setLocationText] = useState(tr("الرياض", "Riyadh"));

  const [costBreakdown, setCostBreakdown] = useState<PricingBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [createdServiceRequestId, setCreatedServiceRequestId] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | "mock" | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<StoredOrder | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    discountType?: string | null;
    discountValue?: number | string | null;
    discountAmount: number;
    originalSubtotal: number;
    discountedSubtotal: number;
    taxAmount: number;
    total: number;
    taxRate: number;
  } | null>(null);
  const [discountApplying, setDiscountApplying] = useState(false);

  /* ------------------ DATA ------------------ */

  const services = [
    {
      id: "maintenance",
      name: tr("صيانة دورية", "Regular maintenance"),
      base: 150,
      icon: <Settings />,
      subtitle: tr(`تبدأ من سعر 150 ${currencyLabel}`, `Starting from 150 ${currencyLabel}`),
    },
    {
      id: "repair",
      name: tr("إصلاح عطل", "Repair"),
      base: 100,
      icon: <Wrench />,
      subtitle: tr("حدد العطل وخل التصليح علينا", "Tell us the issue and we'll handle the repair"),
    },
    {
      id: "parts",
      name: tr("استبدال قطع", "Replace parts"),
      base: 0,
      icon: <Package />,
      subtitle: tr("قريباً سنوفر كل م يحتاجه الدراج", "Coming soon with all rider essentials"),
      disabled: true,
    },
  ];

  const { data: technicians, isLoading: loadingTechnicians } = useQuery<TechnicianBookingCompat[]>({
    queryKey: ["/api/technicians/nearby", location.lat, location.lng],
    enabled: !!location.lat && !!location.lng,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    queryFn: async () => {
      try {
        return await apiRequest(`/api/technicians/nearby?lat=${location.lat}&lng=${location.lng}`, "GET");
      } catch (err) {
        console.error("Technicians fetch failed, using fallback", err);
        return [];
      }
    }
  });

  const { data: bikes, isLoading: bikesLoading } = useQuery<Bike[]>({
    queryKey: ["/api/bikes"],
    enabled: !!user && !isGuest,
    queryFn: async () => {
      try {
        return await apiRequest("/api/bikes", "GET");
      } catch (err) {
        console.error("Bikes fetch failed", err);
        return [];
      }
    },
  });

  const bikesList = useMemo(() => (Array.isArray(bikes) ? bikes : []), [bikes]);

  const fallbackTechnicians = useMemo<TechnicianBookingCompat[]>(() => {
    const now = new Date().toISOString();
    return [
      {
        id: "mock-tech-1",
        userId: "mock-user",
        name: tr("فني تجريبي", "Test technician"),
        phoneNumber: null,
        location: tr("الرياض", "Riyadh"),
        latitude: 24.7136,
        longitude: 46.6753,
        rating: 0,
        reviewCount: 0,
        isAvailable: true,
        is_available: true,
        isApproved: true,
        yearsOfExperience: null,
        commercialRegister: null,
        nationalId: null,
        iban: null,
        createdAt: now,
        updatedAt: now,
        distanceKm: 1.2,
        etaMinutes: 12,
        pricePreview: { total: 150 },
        isMock: true,
      },
    ];
  }, []);

  const techniciansList = useMemo<TechnicianBookingCompat[]>(() => {
    const safeTechnicians: TechnicianBookingCompat[] = Array.isArray(technicians) ? technicians : [];
    const liveTechnicians = safeTechnicians.filter((tech: any) => !tech?.isMock);
    const merged = [...liveTechnicians, ...fallbackTechnicians];
    const seen = new Set<string>();
    return merged.filter((tech: any) => {
      const id = tech?.id;
      if (!id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [technicians, fallbackTechnicians]);

  useEffect(() => {
    if (!selectedTechnicianId && techniciansList.length > 0) {
      setSelectedTechnicianId(techniciansList[0].id);
    }
  }, [techniciansList, selectedTechnicianId]);

  useEffect(() => {
    if (!selectedBikeId && bikesList.length > 0) {
      setSelectedBikeId(bikesList[0].id);
    }
  }, [bikesList, selectedBikeId]);

  const selectedBike = useMemo(
    () => bikesList.find((bike) => bike.id === selectedBikeId),
    [bikesList, selectedBikeId],
  );

  const selectedTechnician = useMemo<TechnicianBookingCompat | undefined>(
    () => techniciansList.find((t) => t.id === selectedTechnicianId),
    [techniciansList, selectedTechnicianId],
  );
  const resolvedTechnicianId = useMemo(() => {
    return selectedTechnician?.id || selectedTechnicianId;
  }, [selectedTechnician, selectedTechnicianId]);

  useEffect(() => {
    if (!user) return;
    const draft = loadBookingDraft();
    if (!draft) return;
    if (draft.selectedService) setSelectedService(draft.selectedService);
    if (draft.selectedTechnicianId) setSelectedTechnicianId(draft.selectedTechnicianId);
    if (typeof draft.notes === "string") setNotes(draft.notes);
    if (draft.location) setLocation(draft.location);
    if (draft.locationText) setLocationText(draft.locationText);
    if (typeof draft.step === "number") {
      setCurrentStep(Math.min(Math.max(draft.step, 0), 3));
    } else {
      setCurrentStep(3);
    }
    clearBookingDraft();
  }, [user]);

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
          title: tr("تم استخدام تسعير تقديري", "Using estimated pricing"),
          description: tr(
            "لم يتم جلب التسعير اللحظي، تم اعتماد تسعير تقديري مؤقت.",
            "Live pricing was unavailable, so an estimated price was used.",
          ),
        });
      } finally {
        setLoadingBreakdown(false);
      }
    };

    fetchPricing();
  }, [selectedService, selectedTechnicianId, selectedTechnician, toast]);

  useEffect(() => {
    if (!appliedDiscount || !costBreakdown) return;
    const baseSubtotal = Number(costBreakdown.subtotal ?? 0);
    if (Math.abs(baseSubtotal - appliedDiscount.originalSubtotal) > 0.01) {
      setAppliedDiscount(null);
    }
  }, [appliedDiscount, costBreakdown]);

  const handleApplyDiscount = async () => {
    if (!costBreakdown) return;
    const code = discountCode.trim();
    const invalidMessage = tr("كود الخصم غير صالح", "Discount code is invalid");
    if (!code) {
      toast({
        title: tr("أدخل كود الخصم", "Enter a discount code"),
        variant: "destructive",
      });
      return;
    }
    setDiscountApplying(true);
    try {
      const response = await apiRequest("/api/discount-codes/validate", "POST", {
        code,
        subtotal: costBreakdown.subtotal ?? 0,
        taxRate: costBreakdown.vatRate ?? 15,
      });
      setAppliedDiscount(response);
      toast({ title: tr("تم تطبيق الخصم", "Discount applied") });
    } catch (error: any) {
      setAppliedDiscount(null);
      const isInvalid = error?.code === "DISCOUNT_INVALID";
      toast({
        title: tr("تعذر تطبيق الخصم", "Could not apply discount"),
        description: isInvalid
          ? invalidMessage
          : error?.message || tr("يرجى التحقق من الكود", "Please verify the code"),
        variant: "destructive",
      });
    } finally {
      setDiscountApplying(false);
    }
  };

  const handleClearDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
  };

  const breakdownForPayment = useMemo(() => {
    if (!costBreakdown) return null;
    if (!appliedDiscount) return costBreakdown;
    return {
      ...costBreakdown,
      discount: {
        code: appliedDiscount.code,
        discountType: appliedDiscount.discountType ?? null,
        discountValue: appliedDiscount.discountValue ?? null,
        discountAmount: appliedDiscount.discountAmount,
      },
      subtotal: appliedDiscount.discountedSubtotal,
      vat: appliedDiscount.taxAmount,
      total: appliedDiscount.total,
      vatRate: appliedDiscount.taxRate ?? costBreakdown.vatRate,
    };
  }, [appliedDiscount, costBreakdown]);

  const invoiceSubtotal = appliedDiscount
    ? appliedDiscount.discountedSubtotal
    : costBreakdown?.subtotal ?? 0;
  const invoiceTaxAmount = appliedDiscount
    ? appliedDiscount.taxAmount
    : costBreakdown?.vat ?? 0;
  const invoiceTotal = appliedDiscount
    ? appliedDiscount.total
    : costBreakdown?.total ?? 0;

  /* ------------------ BOOKING ------------------ */

  const submitBooking = async () => {
    if (!selectedService || !resolvedTechnicianId || !costBreakdown) {
      toast({
        title: tr("خطأ", "Error"),
        description: tr("الرجاء إكمال جميع الخطوات", "Please complete all steps"),
        variant: "destructive",
      });
      return;
    }

    setSubmittingBooking(true);

    try {
      const payload = {
        serviceType: selectedService,
        technicianId: resolvedTechnicianId,
        notes,
        latitude: location.lat,
        longitude: location.lng,
        location: locationText,
        status: "awaiting_payment",
        scheduledAt: new Date().toISOString(),
        bikeId: selectedBikeId || undefined,
      };

      console.log("[BOOKING PAYLOAD]", payload);

      const res = await apiRequest("/api/service-requests", "POST", payload);
      clearBookingDraft();
      setCreatedServiceRequestId(res.id);
      setCurrentStep(4);
    } catch (error) {
      console.error("Booking error", error);

      const msg =
        error instanceof ApiError && error.errors?.length
          ? error.errors.map((e) => e.message).join(" / ")
          : tr("فشل إنشاء الطلب", "Failed to create the request");

      toast({
        title: tr("خطأ", "Error"),
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSubmittingBooking(false);
    }
  };

  const resetBooking = () => {
    clearBookingDraft();
    setCurrentStep(0);
    setSelectedService("");
    setSelectedTechnicianId("");
    setSelectedBikeId("");
    setNotes("");
    setCostBreakdown(null);
    setCreatedServiceRequestId(null);
    setProcessingPayment(false);
    setSelectedPaymentMethod(null);
    setConfirmedOrder(null);
  };

  const paymentMethodLabels: Record<string, string> = {
    stripe_apple_pay: "Apple Pay",
    stripe_card: tr("بطاقة ائتمان", "Credit card"),
    stc_pay: "STC Pay",
    bank_transfer: tr("حوالة بنكية", "Bank transfer"),
    mock: tr("دفع تجريبي", "Test payment"),
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
            <CardTitle>{tr("حجز خدمة", "Book a service")}</CardTitle>
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
                      <h3 className="text-xl font-bold">{tr("تم تأكيد الدفع", "Payment confirmed")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {tr("رقم الطلب", "Order number")} {confirmedOrder.orderNumber}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{tr("الخدمة", "Service")}</span>
                        <span>{confirmedOrder.serviceType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{tr("الفني", "Technician")}</span>
                        <span>{confirmedOrder.technician}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{tr("طريقة الدفع", "Payment method")}</span>
                        <span>{paymentMethodLabels[confirmedOrder.paymentMethod || "mock"]}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{tr("الموقع", "Location")}</span>
                        <span>{confirmedOrder.locationText || tr("الرياض", "Riyadh")}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4 text-primary" />
                        <span>{tr("ملخص الفاتورة", "Invoice summary")}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{tr("المجموع الفرعي", "Subtotal")}</span>
                        <span>{confirmedOrder.subtotal.toFixed(2)} {currencyLabel}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{tr("الضريبة", "Tax")}</span>
                        <span>{confirmedOrder.taxAmount.toFixed(2)} {currencyLabel}</span>
                      </div>
                      <div className="flex items-center justify-between text-base font-bold text-primary">
                        <span>{tr("الإجمالي", "Total")}</span>
                        <span>{confirmedOrder.total.toFixed(2)} {currencyLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 font-semibold">
                      <Route className="h-4 w-4 text-primary" />
                      <span>{tr("ملخص المسار", "Route summary")}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{tr("من", "From")}</span>
                      <span>{confirmedOrder.route?.fromLabel || tr("نقطة انطلاق الفني", "Technician start point")}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{tr("إلى", "To")}</span>
                      <span>{confirmedOrder.route?.toLabel || tr("موقع العميل", "Customer location")}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {confirmedOrder.route?.distanceKm ?? 0} {kmLabel}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {confirmedOrder.route?.etaMinutes ?? 0} {minutesLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                  <h4 className="font-semibold">{tr("تتبع الطلب", "Order tracking")}</h4>
                  <OrderTrackingTimeline steps={confirmedOrder.trackingSteps} />
                </div>

                <div className="flex flex-col gap-3 md:flex-row">
                  <Button className="flex-1" onClick={() => downloadInvoice(confirmedOrder)}>
                    {tr("تحميل الفاتورة PDF", "Download invoice PDF")}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRouterLocation("/orders")}
                  >
                    {tr("عرض طلباتي", "View my orders")}
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={resetBooking}>
                    {tr("حجز جديد", "New booking")}
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
                        {s.disabled && <Badge variant="secondary">{tr("قريباً", "Coming soon")}</Badge>}
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
                      <h4 className="text-lg font-semibold">{tr("خريطة الموقع", "Location map")}</h4>
                      <p className="text-sm text-muted-foreground">
                        {tr(
                          "يمكنك التكبير والتحريك لتحديد موقعك بدقة.",
                          "Zoom and pan to set your exact location.",
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://maps.google.com/maps?q=${location.lat},${location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tr("فتح في خرائط Google", "Open in Google Maps")}
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
                  {tr("استخدم موقعي", "Use my location")}
                </Button>

                {!isGuest && (
                  <div className="space-y-3 rounded-2xl border border-border/60 bg-white/90 dark:bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-lg font-semibold">{tr("اختر الدراجة", "Select bike")}</h4>
                        <p className="text-xs text-muted-foreground">
                          {tr("اختر دراجتك ليظهر تفاصيلها للفني.", "Pick your bike so the technician sees its details.")}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRouterLocation("/bikes")}
                      >
                        {tr("إدارة الدراجات", "Manage bikes")}
                      </Button>
                    </div>
                    {bikesLoading ? (
                      <div className="text-sm text-muted-foreground">{tr("جاري تحميل الدراجات...", "Loading bikes...")}</div>
                    ) : bikesList.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {tr("لا توجد دراجات مضافة حتى الآن.", "No bikes added yet.")}
                      </div>
                    ) : (
                      <RadioGroup value={selectedBikeId} onValueChange={setSelectedBikeId} className="space-y-3">
                        {bikesList.map((bike) => {
                          const bikeImage = (bike as any)?.imageUrl ?? (bike as any)?.image_url ?? null;
                          const bikeType = bike.bikeType ?? (bike as any)?.bike_type ?? null;
                          const bikeLabel = [bike.brand, bike.model].filter(Boolean).join(" ");
                          const bikeCode = (bike as any)?.bikeId ?? (bike as any)?.bike_id ?? null;
                          const isSelected = bike.id === selectedBikeId;
                          return (
                            <div
                              key={bike.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedBikeId(bike.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedBikeId(bike.id);
                                }
                              }}
                              className={`flex items-center gap-3 rounded-xl border p-3 transition ${isSelected ? "border-primary bg-white shadow-sm" : "border-white/30 bg-white/80"} text-foreground dark:border-white/10 dark:bg-white/5 dark:text-white`}
                            >
                              <RadioGroupItem value={bike.id} id={`bike-${bike.id}`} className="sr-only" />
                              <div className="h-14 w-14 overflow-hidden rounded-xl bg-muted/50 flex items-center justify-center">
                                {bikeImage ? (
                                  <img src={bikeImage} alt={bikeLabel || "Bike"} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-2xl">🚲</span>
                                )}
                              </div>
                              <div className="flex-1 text-sm">
                                <div className="font-semibold">{bikeLabel || tr("دراجة بدون اسم", "Unnamed bike")}</div>
                                <div className="text-xs text-muted-foreground">
                                  {[bikeType, bike.year ? `${bike.year}` : null].filter(Boolean).join(" • ")}
                                </div>
                                {bikeCode && (
                                  <div className="text-[11px] text-muted-foreground">#{bikeCode}</div>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedBikeId(bike.id);
                                }}
                              >
                                {tr("اختيار", "Select")}
                              </Button>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    )}
                  </div>
                )}

                <Textarea
                  placeholder={tr("ملاحظات", "Notes")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white/75 text-foreground placeholder:text-muted-foreground dark:bg-white/5 dark:text-white dark:placeholder:text-white/50 border border-white/20"
                />
              </>
            )}

            {currentStep === 2 && (
              <>
                {loadingTechnicians ? (
                  <p>{tr("جاري التحميل...", "Loading...")}</p>
                ) : (
                  <RadioGroup value={selectedTechnicianId} onValueChange={setSelectedTechnicianId} className="space-y-4">
                    {techniciansList && techniciansList.length > 0 ? (
                      techniciansList.map((tech, idx) => (
                        (() => {
                          const isMockTech = Boolean((tech as any)?.isMock);
                          const user = (tech as any)?.user;
                          const nameFromUser = user
                            ? [user.first_name, user.last_name].filter(Boolean).join(" ")
                            : "";
                          const ratingValue = Number(tech.rating ?? 0);
                          const reviewCount = Number((tech as any)?.reviewCount ?? (tech as any)?.review_count ?? 0);
                          const displayName = nameFromUser || tr("فني معتمد", "Certified technician");
                          const isAvailable = Boolean(tech.isAvailable ?? (tech as any).is_available);
                          const phoneNumber = (tech as any).phoneNumber ?? (tech as any).phone_number ?? null;
                          const yearsOfExperience =
                            (tech as any).yearsOfExperience ?? (tech as any).years_of_experience ?? null;
                          const locationLabel =
                            (tech as any).location ??
                            (tech as any).national_address ??
                            (tech as any).nationalAddress ??
                            null;
                          const techId = typeof tech.id === "string" ? tech.id : "";
                          const idSuffix = techId ? techId.slice(-6) : "";
                          const distanceKm = Number(tech.distanceKm);
                          const etaMinutes = Number(tech.etaMinutes);
                          const priceTotalRaw = (tech as any)?.pricePreview?.total;
                          const priceTotal = Number(priceTotalRaw);
                          const isSelected = tech.id === selectedTechnicianId;
                          return (
                            <div
                              key={tech.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => setSelectedTechnicianId(tech.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedTechnicianId(tech.id);
                                }
                              }}
                              className={`rounded-2xl border p-4 transition ${isSelected ? "border-primary bg-white shadow-md" : "border-white/30 bg-white/80"} text-foreground dark:border-white/10 dark:bg-white/5 dark:text-white`}
                              data-testid={`card-technician-${idx}`}
                              aria-selected={isSelected}
                            >
                              <RadioGroupItem value={tech.id} id={`tech-${tech.id}`} className="sr-only" />
                              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                                    <User className="h-7 w-7 text-primary" />
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-base font-semibold">{displayName}</span>
                                      {isMockTech ? (
                                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                          {tr("اختبار", "Test")}
                                        </Badge>
                                      ) : (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                                          ● {tr("متصل", "Online")}
                                        </Badge>
                                      )}
                                    </div>
                                    {!isMockTech && idSuffix ? (
                                      <div className="text-xs text-muted-foreground dark:text-white/70">
                                        ID: ••••{idSuffix}
                                      </div>
                                    ) : null}
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground dark:text-white/70">
                                      <span>⭐ {Number.isFinite(ratingValue) ? ratingValue.toFixed(1) : "0.0"}</span>
                                      <span>•</span>
                                      <span>{reviewCount} {tr("تقييم", "reviews")}</span>
                                    </div>
                                    {!isMockTech && (phoneNumber || yearsOfExperience || locationLabel) ? (
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground dark:text-white/70">
                                        {phoneNumber ? <span>📞 {phoneNumber}</span> : null}
                                        {yearsOfExperience
                                          ? <span>{tr("خبرة", "Experience")} {Number(yearsOfExperience)} {tr("سنة", "years")}</span>
                                          : null}
                                        {locationLabel ? <span>📍 {locationLabel}</span> : null}
                                      </div>
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground dark:text-white/70">
                                      <div className="flex items-center gap-1">
                                        <Route className="h-3 w-3" />
                                        <span>{Number.isFinite(distanceKm) ? distanceKm.toFixed(1) : "--"} {kmLabel}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        <span>{Number.isFinite(etaMinutes) ? Math.max(1, Math.round(etaMinutes)) : "--"} {minutesLabel}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span>{isAvailable ? tr("متاح", "Available") : tr("غير متصل", "Offline")}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <FileText className="h-3 w-3" />
                                        <span>
                                          {Number.isFinite(priceTotal)
                                            ? `${priceTotal.toFixed(2)} ${currencyLabel}`
                                            : "--"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  disabled={!isAvailable && !isMockTech}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedTechnicianId(tech.id);
                                  }}
                                >
                                  {tr("اختيار الفني", "Select technician")}
                                </Button>
                              </div>
                            </div>
                          );
                        })()
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        {tr("لا يوجد فنيون متاحون حالياً", "No technicians available right now")}
                      </div>
                    )}
                  </RadioGroup>
                )}
              </>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                {loadingBreakdown && (
                  <div className="text-muted-foreground">{tr("جاري حساب التكلفة...", "Calculating cost...")}</div>
                )}
                {costBreakdown && selectedTechnician && (
                  <Card className="border border-white/30 bg-white/90 text-foreground dark:border-white/10 dark:bg-white/5 dark:text-white backdrop-blur-md shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-lg">{tr("تأكيد الحجز", "Confirm booking")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("الخدمة", "Service")}</h4>
                        <div className="flex justify-between text-sm text-foreground dark:text-white">
                          <span>{services.find((s) => s.id === selectedService)?.name}</span>
                          <span>{costBreakdown.service?.base ?? services.find((s) => s.id === selectedService)?.base ?? 0} {currencyLabel}</span>
                        </div>
                      </div>

                      {selectedBike && (
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("الدراجة", "Bike")}</h4>
                          <div className="flex items-center gap-3 text-sm text-foreground dark:text-white">
                            <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
                              {(selectedBike as any)?.imageUrl || (selectedBike as any)?.image_url ? (
                                <img
                                  src={(selectedBike as any).imageUrl ?? (selectedBike as any).image_url}
                                  alt={selectedBike.brand || tr("دراجة", "Bike")}
                                  className="h-full w-full object-cover rounded-lg"
                                />
                              ) : (
                                <span>🚲</span>
                              )}
                            </div>
                            <div>
                              <div className="font-semibold">
                                {[selectedBike.brand, selectedBike.model].filter(Boolean).join(" ") || tr("دراجة العميل", "Customer bike")}
                              </div>
                              <div className="text-xs text-muted-foreground dark:text-white/70">
                                {[selectedBike.bikeType ?? (selectedBike as any)?.bike_type, selectedBike.year ? `${selectedBike.year}` : null]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("الفني", "Technician")}</h4>
                        <div className="flex flex-col gap-1 text-sm text-foreground dark:text-white">
                          <span className="font-semibold">
                            {selectedTechnician.name?.trim()
                              ? selectedTechnician.name
                              : tr("فني معتمد", "Certified technician")}
                          </span>
                          <div className="flex items-center gap-2 text-muted-foreground dark:text-white/70">
                            <span>⭐ {Number(selectedTechnician.rating ?? 0).toFixed(1)}</span>
                            <span>•</span>
                            <span>{Number((selectedTechnician as any).reviewCount ?? (selectedTechnician as any).review_count ?? 0)} {tr("تقييم", "reviews")}</span>
                            <span>•</span>
                            {Number(
                              selectedTechnician.yearsOfExperience ??
                                (selectedTechnician as any).years_of_experience ??
                                0,
                            ) > 0 && (
                              <>
                                <span>
                                  {Number(
                                    selectedTechnician.yearsOfExperience ??
                                      (selectedTechnician as any).years_of_experience,
                                  )} {tr("سنة خبرة", "years experience")}
                                </span>
                                <span>•</span>
                              </>
                            )}
                            <span>{selectedTechnician.distanceKm ?? 0} {kmLabel}</span>
                            <span>•</span>
                            <span>{selectedTechnician.etaMinutes ?? 0} {minutesLabel}</span>
                            <span>•</span>
                            <Badge variant="outline">
                              {selectedTechnician.isAvailable || (selectedTechnician as any).is_available ? tr("متاح", "Available") : tr("مشغول", "Busy")}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("التوصيل", "Delivery")}</h4>
                        <div className="space-y-1 text-sm text-muted-foreground dark:text-white/70">
                          <div className="flex justify-between"><span>{tr("الأساس", "Base")}</span><span>{costBreakdown.delivery?.base ?? 0}</span></div>
                          <div className="flex justify-between"><span>{tr("لكل كم", "Per km")}</span><span>{costBreakdown.delivery?.perKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>{tr("المسافة", "Distance")} ({kmLabel})</span><span>{costBreakdown.delivery?.distanceKm ?? selectedTechnician.distanceKm ?? 0}</span></div>
                          <div className="flex justify-between"><span>{tr("الحد الأدنى / الحد الأعلى", "Min / Max")}</span><span>{costBreakdown.delivery?.min ?? 0} / {costBreakdown.delivery?.max ?? 0}</span></div>
                          <div className="flex justify-between font-semibold text-foreground dark:text-white">
                            <span>{tr("إجمالي التوصيل", "Delivery total")}</span>
                            <span>{costBreakdown.delivery?.total ?? 0} {currencyLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("كود الخصم", "Discount code")}</h4>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                            placeholder="DISCOUNT2024"
                            className="flex-1 min-w-[200px] bg-white/80 dark:bg-white/5"
                            disabled={discountApplying || !!appliedDiscount}
                          />
                          {appliedDiscount ? (
                            <Button variant="outline" onClick={handleClearDiscount}>
                              {tr("إزالة", "Remove")}
                            </Button>
                          ) : (
                            <Button onClick={handleApplyDiscount} disabled={discountApplying}>
                              {discountApplying ? tr("جارٍ التحقق...", "Checking...") : tr("تطبيق", "Apply")}
                            </Button>
                          )}
                        </div>
                        {appliedDiscount && (
                          <div className="text-xs text-emerald-600">
                            {tr("تم تطبيق الخصم", "Discount applied")} ({appliedDiscount.code})
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-muted-foreground dark:text-white/70">{tr("الفاتورة", "Invoice")}</h4>
                        <div className="space-y-1 text-sm text-foreground dark:text-white/80">
                          <div className="flex justify-between">
                            <span>{tr("الخدمة", "Service")}</span>
                            <span>{costBreakdown.service?.base ?? 0} {currencyLabel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{tr("التوصيل", "Delivery")}</span>
                            <span>{costBreakdown.delivery?.total ?? 0} {currencyLabel}</span>
                          </div>
                          {appliedDiscount?.discountAmount ? (
                            <div className="flex justify-between text-emerald-600">
                              <span>{tr("خصم", "Discount")} ({appliedDiscount.code})</span>
                              <span>-{appliedDiscount.discountAmount.toFixed(2)} {currencyLabel}</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between">
                            <span>{tr("المجموع الفرعي", "Subtotal")}</span>
                            <span>{Number(invoiceSubtotal).toFixed(2)} {currencyLabel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{tr("ضريبة القيمة المضافة", "VAT")} ({appliedDiscount?.taxRate ?? costBreakdown.vatRate ?? 15}%)</span>
                            <span>{Number(invoiceTaxAmount).toFixed(2)} {currencyLabel}</span>
                          </div>
                          <div className="flex justify-between text-base font-bold text-primary pt-2">
                            <span>{tr("الإجمالي", "Total")}</span>
                            <span>{Number(invoiceTotal).toFixed(2)} {currencyLabel}</span>
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
                amount={appliedDiscount?.total ?? costBreakdown.total}
                serviceRequestId={createdServiceRequestId}
                isProcessing={processingPayment}
                onSelectMethod={async (method) => {
                  setSelectedPaymentMethod(method);
                  if (!costBreakdown || !selectedTechnician) return;
                  setProcessingPayment(true);

                  try {
                    const response = await apiRequest("/api/orders/mock-checkout", "POST", {
                      serviceRequestId: createdServiceRequestId,
                      technicianId: resolvedTechnicianId,
                      breakdown: costBreakdown,
                      paymentMethod: method,
                      discountCode: appliedDiscount?.code ?? null,
                    });

                    const order = response?.order || response;
                    const invoice = response?.invoice || {};
                    const baseOrder = createMockOrder({
                      serviceName: services.find((s) => s.id === selectedService)?.name || tr("خدمة", "Service"),
                      technicianName:
                        selectedTechnician?.name ||
                        tr("فني معتمد", "Certified technician"),
                      technicianRating: Number(selectedTechnician.rating ?? 0),
                      technicianDistanceKm: selectedTechnician.distanceKm ?? 0,
                      technicianEtaMinutes: selectedTechnician.etaMinutes ?? 25,
                      locationText,
                      notes,
                      paymentMethod: method,
                      breakdown: breakdownForPayment ?? costBreakdown,
                    });

                    const normalized = {
                      ...baseOrder,
                      id: order?.id || baseOrder.id,
                      orderNumber: order?.orderNumber || order?.order_number || baseOrder.orderNumber,
                      invoiceNumber: invoice?.invoiceNumber || invoice?.invoice_number || baseOrder.invoiceNumber,
                      createdAt: order?.createdAt || order?.created_at || baseOrder.createdAt,
                      subtotal: Number(invoice?.subtotal ?? order?.subtotal ?? baseOrder.subtotal),
                      taxRate: Number(invoice?.taxRate ?? order?.taxRate ?? baseOrder.taxRate),
                      taxAmount: Number(invoice?.taxAmount ?? order?.taxAmount ?? baseOrder.taxAmount),
                      total: Number(invoice?.total ?? order?.total ?? baseOrder.total),
                      paymentMethod: method,
                    };

                    saveMockOrder(normalized);
                    setConfirmedOrder(normalized);
                    setCurrentStep(5);
                  } catch (error: any) {
                    toast({
                      title: tr("خطأ في الدفع", "Payment error"),
                      description: error?.message || tr("فشل إتمام الدفع التجريبي", "Test payment failed"),
                      variant: "destructive",
                    });
                  } finally {
                    setProcessingPayment(false);
                  }
                }}
                onCancel={() => setCurrentStep(3)}
              />
            )}

            {currentStep < 4 && (
              <div className="flex gap-3 mt-4">
                {currentStep > 0 && (
                  <Button onClick={() => setCurrentStep((s) => s - 1)}>
                    <ArrowRight /> {tr("السابق", "Previous")}
                  </Button>
                )}

                {currentStep < 3 ? (
                  <Button onClick={() => setCurrentStep((s) => s + 1)}>
                    {tr("التالي", "Next")} <ArrowLeft />
                  </Button>
                ) : (
                  <Button
                    onClick={submitBooking}
                    disabled={submittingBooking || loadingBreakdown || !costBreakdown || !selectedTechnician}
                  >
                    {submittingBooking ? tr("جارٍ الحجز...", "Booking...") : tr("تأكيد الحجز", "Confirm booking")}
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
