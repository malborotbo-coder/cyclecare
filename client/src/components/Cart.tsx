import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { Trash2, Plus, Minus, ShoppingCart } from "lucide-react";

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, subtotal, tax, total, itemCount } = useCart();
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();

  const labels = {
    ar: {
      title: "سلة التسوق",
      empty: "السلة فارغة",
      continueShopping: "استمرار التسوق",
      checkout: "الذهاب للدفع",
      product: "المنتج",
      quantity: "الكمية",
      price: "السعر",
      total: "الإجمالي",
      subtotal: "المجموع الفرعي",
      tax: "الضريبة",
      currency: "ر.س",
      remove: "حذف",
    },
    en: {
      title: "Shopping Cart",
      empty: "Your cart is empty",
      continueShopping: "Continue Shopping",
      checkout: "Checkout",
      product: "Product",
      quantity: "Quantity",
      price: "Price",
      total: "Total",
      subtotal: "Subtotal",
      tax: "Tax",
      currency: "SAR",
      remove: "Remove",
    },
  };

  const labels_text = labels[lang as keyof typeof labels];

  const handleCheckout = () => {
    setLocation("/checkout");
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center pb-32">
        <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-6">{labels_text.empty}</p>
        <Button onClick={() => setLocation("/parts")} data-testid="button-continue-shopping">
          {labels_text.continueShopping}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 pb-32">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{labels_text.title}</h1>
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? `لديك ${itemCount} منتجات في السلة` : `${itemCount} items in your cart`}
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/parts")} data-testid="button-continue-shopping">
            {labels_text.continueShopping}
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {items.map(item => (
              <Card key={item.part.id} className="border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur" data-testid={`card-cart-item-${item.part.id}`}>
                <CardContent className="p-4 flex flex-col md:flex-row gap-4">
                  <div className="w-full md:w-28 h-28 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                    {item.part.imageUrl || (item.part as any).image_url ? (
                      <img
                        src={item.part.imageUrl || (item.part as any).image_url}
                        alt={item.part.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingCart className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          {lang === 'ar' ? item.part.name : item.part.nameEn}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {item.part.price} {labels_text.currency}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(item.part.id)}
                        data-testid={`button-remove-${item.part.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-2 py-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateQuantity(item.part.id, item.quantity - 1)}
                          data-testid={`button-decrease-${item.part.id}`}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.part.id, parseInt(e.target.value) || 1)}
                          className="w-16 text-center border-0 bg-transparent"
                          data-testid={`input-quantity-${item.part.id}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => updateQuantity(item.part.id, item.quantity + 1)}
                          data-testid={`button-increase-${item.part.id}`}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">{labels_text.total}</p>
                        <p className="text-lg font-semibold text-primary">
                          {(Number(item.part.price) * item.quantity).toFixed(2)} {labels_text.currency}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card className="sticky top-20 border-border/40 bg-white/80 dark:bg-white/5 backdrop-blur">
              <CardHeader>
                <CardTitle>{labels_text.total}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{labels_text.subtotal}</span>
                  <span>{subtotal.toFixed(2)} {labels_text.currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{labels_text.tax}</span>
                  <span>{tax.toFixed(2)} {labels_text.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-3">
                  <span>{labels_text.total}</span>
                  <span>{total.toFixed(2)} {labels_text.currency}</span>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCheckout}
                  data-testid="button-checkout"
                >
                  {lang === "ar" ? "متابعة للتأكيد" : "Continue to confirmation"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={clearCart}
                  data-testid="button-clear-cart"
                >
                  {lang === 'ar' ? 'إفراغ السلة' : 'Clear Cart'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
