import { useState } from "react";
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
import { Loader2 } from "lucide-react";

export default function Checkout() {
  const { items, subtotal, tax, total, clearCart } = useCart();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("apple_pay");

  const labels = {
    ar: {
      title: "إتمام الشراء",
      deliveryOptions: "خيارات التسليم",
      pickup: "استلام من الفرع",
      delivery: "توصيل",
      address: "عنوان التوصيل",
      payment: "طريقة الدفع",
      applePay: "Apple Pay",
      mada: "Mada",
      creditCard: "بطاقة ائتمان",
      bankTransfer: "تحويل بنكي",
      placeOrder: "إتمام الطلب",
      loading: "جاري المعالجة...",
      orderSuccess: "تم إتمام الطلب بنجاح",
      currency: "ر.س",
      subtotal: "المجموع الفرعي",
      tax: "الضريبة",
      total: "الإجمالي",
    },
    en: {
      title: "Checkout",
      deliveryOptions: "Delivery Options",
      pickup: "Pickup from Branch",
      delivery: "Delivery",
      address: "Delivery Address",
      payment: "Payment Method",
      applePay: "Apple Pay",
      mada: "Mada",
      creditCard: "Credit Card",
      bankTransfer: "Bank Transfer",
      placeOrder: "Place Order",
      loading: "Processing...",
      orderSuccess: "Order placed successfully",
      currency: "SAR",
      subtotal: "Subtotal",
      tax: "Tax",
      total: "Total",
    },
  };

  const labels_text = labels[lang as keyof typeof labels];

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (deliveryType === "delivery" && !deliveryAddress) {
        throw new Error("Please enter delivery address");
      }
      
      const orderData = {
        deliveryType,
        deliveryAddress: deliveryType === "delivery" ? deliveryAddress : null,
        paymentMethod,
        items: items.map(item => ({
          partId: item.part.id,
          name: lang === 'ar' ? item.part.name : item.part.nameEn,
          quantity: item.quantity,
          unitPrice: item.part.price,
          total: Number(item.part.price) * item.quantity,
        })),
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        taxRate: "15",
        total: total.toString(),
      };

      return await apiRequest("POST", "/api/orders", orderData);
    },
    onSuccess: () => {
      toast({ title: labels_text.orderSuccess });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No items in cart</p>
          <Button onClick={() => setLocation("/parts")}>Continue Shopping</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">{labels_text.title}</h1>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Delivery Options */}
          <Card>
            <CardHeader>
              <CardTitle>{labels_text.deliveryOptions}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Label className="flex items-center gap-3 cursor-pointer p-3 border rounded hover-elevate">
                <input
                  type="radio"
                  name="delivery"
                  value="pickup"
                  checked={deliveryType === "pickup"}
                  onChange={(e) => setDeliveryType(e.target.value as "pickup")}
                  data-testid="radio-pickup"
                />
                <span>{labels_text.pickup}</span>
              </Label>
              <Label className="flex items-center gap-3 cursor-pointer p-3 border rounded hover-elevate">
                <input
                  type="radio"
                  name="delivery"
                  value="delivery"
                  checked={deliveryType === "delivery"}
                  onChange={(e) => setDeliveryType(e.target.value as "delivery")}
                  data-testid="radio-delivery"
                />
                <span>{labels_text.delivery}</span>
              </Label>

              {deliveryType === "delivery" && (
                <Input
                  placeholder={labels_text.address}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  data-testid="input-address"
                />
              )}
            </CardContent>
          </Card>

          {/* Payment Method */}
          <Card>
            <CardHeader>
              <CardTitle>{labels_text.payment}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { value: "apple_pay", label: labels_text.applePay },
                { value: "mada", label: labels_text.mada },
                { value: "credit_card", label: labels_text.creditCard },
                { value: "bank_transfer", label: labels_text.bankTransfer },
              ].map(method => (
                <Label key={method.value} className="flex items-center gap-3 cursor-pointer p-3 border rounded hover-elevate">
                  <input
                    type="radio"
                    name="payment"
                    value={method.value}
                    checked={paymentMethod === method.value}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    data-testid={`radio-payment-${method.value}`}
                  />
                  <span>{method.label}</span>
                </Label>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{labels_text.total}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span>{labels_text.subtotal}</span>
              <span>{subtotal.toFixed(2)} {labels_text.currency}</span>
            </div>
            <div className="flex justify-between">
              <span>{labels_text.tax}</span>
              <span>{tax.toFixed(2)} {labels_text.currency}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-3">
              <span>{labels_text.total}</span>
              <span>{total.toFixed(2)} {labels_text.currency}</span>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full mt-6"
          size="lg"
          onClick={() => createOrderMutation.mutate()}
          disabled={createOrderMutation.isPending}
          data-testid="button-place-order"
        >
          {createOrderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {createOrderMutation.isPending ? labels_text.loading : labels_text.placeOrder}
        </Button>
      </div>
    </div>
  );
}
