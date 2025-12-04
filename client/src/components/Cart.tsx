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
    <div className="min-h-screen bg-background pb-32">
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">{labels_text.title}</h1>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map(item => (
              <Card key={item.part.id} data-testid={`card-cart-item-${item.part.id}`}>
                <CardContent className="p-4 flex gap-4">
                  {item.part.imageUrl && (
                    <img
                      src={item.part.imageUrl}
                      alt={item.part.name}
                      className="w-24 h-24 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold mb-2">
                      {lang === 'ar' ? item.part.name : item.part.nameEn}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {item.part.price} {labels_text.currency} × {item.quantity}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
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
                        className="w-16 text-center"
                        data-testid={`input-quantity-${item.part.id}`}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.part.id, item.quantity + 1)}
                        data-testid={`button-increase-${item.part.id}`}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.part.id)}
                        data-testid={`button-remove-${item.part.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {(Number(item.part.price) * item.quantity).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{labels_text.total}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary */}
          <div>
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle>{labels_text.total}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>{labels_text.subtotal}</span>
                  <span>{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>{labels_text.tax}</span>
                  <span>{tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-3">
                  <span>{labels_text.total}</span>
                  <span>{total.toFixed(2)}</span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/checkout")}
                  data-testid="button-checkout"
                >
                  {labels_text.checkout}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/parts")}
                  data-testid="button-continue-shopping-2"
                >
                  {labels_text.continueShopping}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
