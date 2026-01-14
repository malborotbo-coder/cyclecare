import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MapPin, CheckCircle2, ExternalLink, Navigation } from "lucide-react";
import PaymentOptions from "@/components/PaymentOptions";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import type { PaymentMethod } from "@shared/schema";

type CheckoutStep = "confirm" | "payment" | "success";

const STORE_LOCATION = { lat: 24.7136, lng: 46.6753 };
const DELIVERY_CONFIG = { base: 10, perKm: 2, min: 10, max: 60 };
const INSTALL_FEE_PER_ITEM = 30;

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const { lang } = useLanguage();
  const [, setRoute] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<CheckoutStep>("confirm");
  const [deliveryOption, setDeliveryOption] = useState<"pickup" | "delivery_installation">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [geoLocation, setGeoLocation] = useState({ lat: 24.7136, lng: 46.6753 });
  const [locationText, setLocationText] = useState(lang === "ar" ? "الرياض" : "Riyadh");
  const [createdOrder, setCreatedOrder] = useState<any>(null);
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

  const labels = {
    ar: {
      title: "تأكيد الطلب",
      deliveryOptions: "خيارات التوصيل",
      pickup: "استلام من المتجر",
      delivery: "توصيل + تركيب",
      address: "عنوان التوصيل",
      payment: "طرق الدفع",
      continuePayment: "متابعة للدفع",
      backToCart: "العودة للسلة",
      loading: "جاري المعالجة...",
      orderSuccess: "تم تأكيد الدفع بنجاح",
      currency: "ر.س",
      subtotal: "المجموع الفرعي",
      tax: "الضريبة",
      total: "الإجمالي",
      discountCode: "كود الخصم",
      applyDiscount: "تطبيق",
      removeDiscount: "إزالة",
      discountApplied: "تم تطبيق الخصم",
      discountAmount: "الخصم",
      itemsSubtotal: "إجمالي القطع",
      deliveryFee: "رسوم التوصيل",
      installFee: "رسوم التركيب",
      empty: "السلة فارغة",
      confirmTitle: "ملخص الطلب",
      paymentTitle: "اختيار طريقة الدفع",
      orderNumber: "رقم الطلب",
      invoiceNumber: "رقم الفاتورة",
      viewProducts: "العودة للمنتجات",
      viewOrders: "عرض طلباتي",
    },
    en: {
      title: "Order Confirmation",
      deliveryOptions: "Delivery Options",
      pickup: "Store Pickup",
      delivery: "Delivery + Installation",
      address: "Delivery Address",
      payment: "Payment Methods",
      continuePayment: "Continue to payment",
      backToCart: "Back to cart",
      loading: "Processing...",
      orderSuccess: "Payment confirmed successfully",
      currency: "SAR",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
      discountCode: "Discount Code",
      applyDiscount: "Apply",
      removeDiscount: "Remove",
      discountApplied: "Discount applied",
      discountAmount: "Discount",
      itemsSubtotal: "Items subtotal",
      deliveryFee: "Delivery fee",
      installFee: "Installation fee",
      empty: "Cart is empty",
      confirmTitle: "Order Summary",
      paymentTitle: "Choose payment method",
      orderNumber: "Order Number",
      invoiceNumber: "Invoice Number",
      viewProducts: "Back to products",
      viewOrders: "My Orders",
    },
  };

  const labelsText = labels[lang as keyof typeof labels];

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  const deliveryDistanceKm = useMemo(() => {
    if (deliveryOption !== "delivery_installation") return 0;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const lat1 = STORE_LOCATION.lat;
    const lon1 = STORE_LOCATION.lng;
    const lat2 = geoLocation.lat;
    const lon2 = geoLocation.lng;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371 * c;
    return Number.isFinite(distance) ? Number(distance.toFixed(2)) : 0;
  }, [deliveryOption, geoLocation]);

  const deliveryFee = useMemo(() => {
    if (deliveryOption !== "delivery_installation") return 0;
    const raw = DELIVERY_CONFIG.base + deliveryDistanceKm * DELIVERY_CONFIG.perKm;
    const bounded = Math.min(Math.max(raw, DELIVERY_CONFIG.min), DELIVERY_CONFIG.max);
    return Number(bounded.toFixed(2));
  }, [deliveryOption, deliveryDistanceKm]);

  const installFee = useMemo(() => {
    if (deliveryOption !== "delivery_installation") return 0;
    return Number((totalQuantity * INSTALL_FEE_PER_ITEM).toFixed(2));
  }, [deliveryOption, totalQuantity]);

  const computedSubtotal = useMemo(
    () => Number((subtotal + deliveryFee + installFee).toFixed(2)),
    [subtotal, deliveryFee, installFee],
  );
  const computedTax = useMemo(() => Number((computedSubtotal * 0.15).toFixed(2)), [computedSubtotal]);
  const computedTotal = useMemo(
    () => Number((computedSubtotal + computedTax).toFixed(2)),
    [computedSubtotal, computedTax],
  );

  useEffect(() => {
    if (!appliedDiscount) return;
    if (Math.abs(computedSubtotal - appliedDiscount.originalSubtotal) > 0.01) {
      setAppliedDiscount(null);
    }
  }, [appliedDiscount, computedSubtotal]);

  const handleApplyDiscount = async () => {
    const code = discountCode.trim();
    const invalidMessage = lang === "ar" ? "كود الخصم غير صالح" : "Discount code is invalid";
    if (!code) {
      toast({
        title: labelsText.discountCode,
        description: lang === "ar" ? "أدخل كود الخصم" : "Enter a discount code",
        variant: "destructive",
      });
      return;
    }
    setDiscountApplying(true);
    try {
      const response = await apiRequest("/api/discount-codes/validate", "POST", {
        code,
        subtotal: computedSubtotal,
        taxRate: 15,
      });
      setAppliedDiscount(response);
      toast({ title: labelsText.discountApplied });
    } catch (error: any) {
      setAppliedDiscount(null);
      const isInvalid = error?.code === "DISCOUNT_INVALID";
      toast({
        title: labelsText.discountCode,
        description: isInvalid ? invalidMessage : error?.message || (lang === "ar" ? "الكود غير صالح" : "Invalid code"),
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

  const checkoutSubtotal = appliedDiscount ? appliedDiscount.discountedSubtotal : computedSubtotal;
  const checkoutTax = appliedDiscount ? appliedDiscount.taxAmount : computedTax;
  const checkoutTotal = appliedDiscount ? appliedDiscount.total : computedTotal;

  const mapQuery = useMemo(() => {
    if (deliveryAddress.trim()) {
      return encodeURIComponent(deliveryAddress.trim());
    }
    return `${geoLocation.lat},${geoLocation.lng}`;
  }, [deliveryAddress, geoLocation]);

  const successItems = useMemo(() => {
    const raw = createdOrder?.items;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [createdOrder]);

  const successTracking = useMemo(() => {
    const raw = createdOrder?.trackingSteps ?? createdOrder?.tracking_steps;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [createdOrder]);

  const feeSummary = useMemo(() => {
    return successItems.reduce(
      (acc, item: any) => {
        const value = Number(item.total || 0);
        if (item.feeType === "delivery") {
          acc.deliveryFee += value;
        } else if (item.feeType === "installation") {
          acc.installFee += value;
        } else if (item.feeType === "discount") {
          acc.discount += value;
        } else {
          acc.itemsSubtotal += value;
        }
        return acc;
      },
      { itemsSubtotal: 0, deliveryFee: 0, installFee: 0, discount: 0 },
    );
  }, [successItems]);

  const orderQuantity = useMemo(
    () =>
      successItems.reduce((sum: number, item: any) => {
        if (item?.feeType) return sum;
        return sum + (Number(item.quantity) || 0);
      }, 0),
    [successItems],
  );

  const orderSubtotalValue = Number(createdOrder?.subtotal ?? computedSubtotal);
  const orderTaxValue = Number(createdOrder?.taxAmount ?? createdOrder?.tax_amount ?? computedTax);
  const orderTotalValue = Number(createdOrder?.total ?? computedTotal);
  const itemsSubtotalValue =
    feeSummary.itemsSubtotal > 0
      ? feeSummary.itemsSubtotal
      : Number((orderSubtotalValue - feeSummary.deliveryFee - feeSummary.installFee - feeSummary.discount).toFixed(2));

  const createOrderMutation = useMutation({
    mutationFn: async (method: PaymentMethod | "mock") => {
      const isDelivery = deliveryOption === "delivery_installation";
      if (isDelivery && !deliveryAddress.trim()) {
        throw new Error(lang === "ar" ? "يرجى إدخال عنوان التوصيل" : "Please enter delivery address");
      }

      const orderData = {
        deliveryType: isDelivery ? "delivery" : "pickup",
        deliveryOption,
        deliveryAddress: isDelivery ? deliveryAddress : null,
        deliveryLat: isDelivery ? geoLocation.lat : null,
        deliveryLng: isDelivery ? geoLocation.lng : null,
        deliveryDistanceKm: isDelivery ? deliveryDistanceKm : 0,
        paymentMethod: method,
        items: items.map(item => ({
          partId: item.part.id,
          name: lang === "ar" ? item.part.name : item.part.nameEn,
          quantity: item.quantity,
          unitPrice: item.part.price,
          total: Number(item.part.price) * item.quantity,
        })),
        subtotal: checkoutSubtotal.toString(),
        taxAmount: checkoutTax.toString(),
        taxRate: "15",
        total: checkoutTotal.toString(),
        discountCode: appliedDiscount?.code ?? null,
      };

      return await apiRequest("/api/shop/mock-checkout", "POST", orderData);
    },
    onSuccess: (order) => {
      toast({ title: labelsText.orderSuccess });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/shop/orders"] });
      setCreatedOrder(order);
      setStep("success");
    },
    onError: (error: any) => {
      toast({
        title: lang === "ar" ? "فشل الدفع" : "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (items.length === 0 && step !== "success") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{labelsText.empty}</p>
          <Button onClick={() => setRoute("/parts")}>{labelsText.viewProducts}</Button>
        </div>
      </div>
    );
  }

  const canProceed = deliveryOption === "pickup" || deliveryAddress.trim().length > 0;
  const invoiceNumber =
    createdOrder?.invoiceNumber || createdOrder?.invoice_number || createdOrder?.invoiceId || "-";
  const orderNumber = createdOrder?.orderNumber || createdOrder?.order_number || "-";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 pb-32">
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{labelsText.title}</h1>
          {step === "payment" && (
            <Button variant="outline" onClick={() => setStep("confirm")}>
              {labelsText.backToCart}
            </Button>
          )}
        </div>

        {step === "confirm" && (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <Card className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
                <CardHeader>
                  <CardTitle>{labelsText.deliveryOptions}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Label className="flex items-center gap-3 cursor-pointer p-3 border rounded-xl hover-elevate">
                    <input
                      type="radio"
                      name="delivery"
                      value="pickup"
                      checked={deliveryOption === "pickup"}
                      onChange={(e) => setDeliveryOption(e.target.value as "pickup")}
                      data-testid="radio-pickup"
                    />
                    <span>{labelsText.pickup}</span>
                  </Label>
                  <Label className="flex items-center gap-3 cursor-pointer p-3 border rounded-xl hover-elevate">
                    <input
                      type="radio"
                      name="delivery"
                      value="delivery_installation"
                      checked={deliveryOption === "delivery_installation"}
                      onChange={(e) => setDeliveryOption(e.target.value as "delivery_installation")}
                      data-testid="radio-delivery"
                    />
                    <span>{labelsText.delivery}</span>
                  </Label>

                  {deliveryOption === "delivery_installation" && (
                    <div className="space-y-3">
                      <Input
                        placeholder={labelsText.address}
                        value={deliveryAddress}
                        onChange={(e) => {
                          const value = e.target.value;
                          setDeliveryAddress(value);
                          if (value.trim()) {
                            setLocationText(value.trim());
                          }
                        }}
                        data-testid="input-address"
                      />
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4" />
                          <span>{locationText}</span>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={`https://maps.google.com/maps?q=${geoLocation.lat},${geoLocation.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {lang === "ar" ? "فتح في خرائط Google" : "Open in Google Maps"}
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-muted">
                        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs text-foreground shadow-sm dark:bg-black/60 dark:text-white">
                          {locationText}
                        </div>
                        <iframe
                          title="delivery-map"
                          className="w-full h-56 border-0 md:h-72"
                          src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                          loading="lazy"
                          allowFullScreen
                        />
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          navigator.geolocation.getCurrentPosition((p) => {
                            setGeoLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
                            const text = `${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`;
                            setLocationText(text);
                            setDeliveryAddress(text);
                          })
                        }
                      >
                        <Navigation className="ml-2" />
                        {lang === "ar" ? "استخدم موقعي" : "Use my location"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
                <CardHeader>
                  <CardTitle>{labelsText.confirmTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {items.map((item) => (
                    <div key={item.part.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {lang === "ar" ? item.part.name : item.part.nameEn} × {item.quantity}
                      </span>
                      <span>{(Number(item.part.price) * item.quantity).toFixed(2)} {labelsText.currency}</span>
                    </div>
                  ))}
                  <div className="border rounded-lg p-3 space-y-2">
                    <Label className="text-sm font-medium">{labelsText.discountCode}</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value)}
                        placeholder="DISCOUNT2024"
                        className="flex-1 min-w-[200px]"
                        disabled={discountApplying || !!appliedDiscount}
                      />
                      {appliedDiscount ? (
                        <Button variant="outline" onClick={handleClearDiscount}>
                          {labelsText.removeDiscount}
                        </Button>
                      ) : (
                        <Button onClick={handleApplyDiscount} disabled={discountApplying}>
                          {discountApplying ? labelsText.loading : labelsText.applyDiscount}
                        </Button>
                      )}
                    </div>
                    {appliedDiscount && (
                      <div className="text-xs text-emerald-600">
                        {labelsText.discountApplied}: {appliedDiscount.code}
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex justify-between">
                      <span>{labelsText.itemsSubtotal}</span>
                      <span>{subtotal.toFixed(2)} {labelsText.currency}</span>
                    </div>
                    {deliveryOption === "delivery_installation" && (
                      <>
                        <div className="flex justify-between">
                          <span>{labelsText.deliveryFee}</span>
                          <span>{deliveryFee.toFixed(2)} {labelsText.currency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>
                            {labelsText.installFee} ({totalQuantity})
                          </span>
                          <span>{installFee.toFixed(2)} {labelsText.currency}</span>
                        </div>
                      </>
                    )}
                    {appliedDiscount?.discountAmount ? (
                      <div className="flex justify-between text-emerald-600">
                        <span>{labelsText.discountAmount}</span>
                        <span>-{appliedDiscount.discountAmount.toFixed(2)} {labelsText.currency}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <span>{labelsText.tax}</span>
                      <span>{checkoutTax.toFixed(2)} {labelsText.currency}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                      <span>{labelsText.total}</span>
                      <span>{checkoutTotal.toFixed(2)} {labelsText.currency}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
                <CardHeader>
                  <CardTitle>{labelsText.paymentTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {lang === "ar"
                      ? "راجع الطلب ثم انتقل لاختيار طريقة الدفع التجريبية."
                      : "Review your order and continue to mock payment options."}
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setStep("payment")}
                    disabled={!canProceed}
                    data-testid="button-continue-payment"
                  >
                    {labelsText.continuePayment}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === "payment" && (
          <Card className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
            <CardContent className="p-6">
              <PaymentOptions
                amount={Number(checkoutTotal.toFixed(2))}
                serviceRequestId="shop"
                onSelectMethod={(method) => createOrderMutation.mutate(method)}
                onCancel={() => setStep("confirm")}
                isProcessing={createOrderMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        {step === "success" && (
          <Card className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{labelsText.orderSuccess}</h2>
                    <p className="text-sm text-muted-foreground">
                      {labelsText.orderNumber}: {orderNumber}
                    </p>
                    {invoiceNumber && invoiceNumber !== "-" && (
                      <p className="text-sm text-muted-foreground">
                        {labelsText.invoiceNumber}: {invoiceNumber}
                      </p>
                    )}
                  </div>
                </div>

              <div className="space-y-2 text-sm">
                {successItems.map((item: any, idx: number) => (
                  <div key={`${item.partId || item.name}-${idx}`} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {item.feeType === "delivery"
                        ? labelsText.deliveryFee
                        : item.feeType === "installation"
                        ? labelsText.installFee
                        : item.feeType === "discount"
                        ? labelsText.discountAmount
                        : item.name}
                    </span>
                    <span>{Number(item.total || 0).toFixed(2)} {labelsText.currency}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span>{labelsText.itemsSubtotal}</span>
                  <span>{itemsSubtotalValue.toFixed(2)} {labelsText.currency}</span>
                </div>
                {(feeSummary.deliveryFee > 0 || feeSummary.installFee > 0) && (
                  <>
                    <div className="flex justify-between">
                      <span>{labelsText.deliveryFee}</span>
                      <span>{feeSummary.deliveryFee.toFixed(2)} {labelsText.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        {labelsText.installFee} ({orderQuantity || totalQuantity || 1})
                      </span>
                      <span>{feeSummary.installFee.toFixed(2)} {labelsText.currency}</span>
                    </div>
                  </>
                )}
                {feeSummary.discount !== 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>{labelsText.discountAmount}</span>
                    <span>{feeSummary.discount.toFixed(2)} {labelsText.currency}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{labelsText.tax}</span>
                  <span>{orderTaxValue.toFixed(2)} {labelsText.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>{labelsText.total}</span>
                  <span>{orderTotalValue.toFixed(2)} {labelsText.currency}</span>
                </div>
              </div>

              {successTracking.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                  <h3 className="font-semibold">{lang === "ar" ? "تتبع الطلب" : "Order Tracking"}</h3>
                  <OrderTrackingTimeline steps={successTracking} />
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-3">
                <Button className="flex-1" onClick={() => setRoute("/parts")}>
                  {labelsText.viewProducts}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setRoute("/orders")}>
                  {labelsText.viewOrders}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setRoute("/")}>
                  {lang === "ar" ? "الرئيسية" : "Home"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
