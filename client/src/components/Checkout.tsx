import { useMemo, useState } from "react";
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
import type { PaymentMethod } from "@shared/schema";

type CheckoutStep = "confirm" | "payment" | "success";

export default function Checkout() {
  const { items, subtotal, tax, total, clearCart } = useCart();
  const { lang } = useLanguage();
  const [, setRoute] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<CheckoutStep>("confirm");
  const [deliveryOption, setDeliveryOption] = useState<"pickup" | "delivery_installation">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [geoLocation, setGeoLocation] = useState({ lat: 24.7136, lng: 46.6753 });
  const [locationText, setLocationText] = useState(lang === "ar" ? "الرياض" : "Riyadh");
  const [createdOrder, setCreatedOrder] = useState<any>(null);

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
      empty: "السلة فارغة",
      confirmTitle: "ملخص الطلب",
      paymentTitle: "اختيار طريقة الدفع",
      orderNumber: "رقم الطلب",
      viewProducts: "العودة للمنتجات",
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
      empty: "Cart is empty",
      confirmTitle: "Order Summary",
      paymentTitle: "Choose payment method",
      orderNumber: "Order Number",
      viewProducts: "Back to products",
    },
  };

  const labelsText = labels[lang as keyof typeof labels];

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
        paymentMethod: method,
        items: items.map(item => ({
          partId: item.part.id,
          name: lang === "ar" ? item.part.name : item.part.nameEn,
          quantity: item.quantity,
          unitPrice: item.part.price,
          total: Number(item.part.price) * item.quantity,
        })),
        subtotal: subtotal.toString(),
        taxAmount: tax.toString(),
        taxRate: "15",
        total: total.toString(),
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
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex justify-between">
                      <span>{labelsText.subtotal}</span>
                      <span>{subtotal.toFixed(2)} {labelsText.currency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{labelsText.tax}</span>
                      <span>{tax.toFixed(2)} {labelsText.currency}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                      <span>{labelsText.total}</span>
                      <span>{total.toFixed(2)} {labelsText.currency}</span>
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
                amount={Number(total.toFixed(2))}
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
                    {labelsText.orderNumber}: {createdOrder?.orderNumber || "-"}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {successItems.map((item: any, idx: number) => (
                  <div key={`${item.partId || item.name}-${idx}`} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{item.name}</span>
                    <span>{Number(item.total || 0).toFixed(2)} {labelsText.currency}</span>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span>{labelsText.subtotal}</span>
                  <span>{Number(createdOrder?.subtotal || subtotal).toFixed(2)} {labelsText.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>{labelsText.tax}</span>
                  <span>{Number(createdOrder?.taxAmount || tax).toFixed(2)} {labelsText.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>{labelsText.total}</span>
                  <span>{Number(createdOrder?.total || total).toFixed(2)} {labelsText.currency}</span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <Button className="flex-1" onClick={() => setRoute("/parts")}>
                  {labelsText.viewProducts}
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
