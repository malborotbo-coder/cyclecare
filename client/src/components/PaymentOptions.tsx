import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Smartphone, Building2, Apple } from "lucide-react";
import type { PaymentMethod } from "@shared/schema";

interface PaymentOption {
  id: PaymentMethod;
  name: string;
  nameEn: string;
  icon: React.ReactNode;
  description: string;
}

const paymentMethods: PaymentOption[] = [
  {
    id: "stripe_apple_pay",
    name: "Apple Pay",
    nameEn: "Apple Pay",
    icon: <Apple className="w-6 h-6" />,
    description: "الدفع السريع والآمن عبر Apple Pay",
  },
  {
    id: "stripe_card",
    name: "بطاقة ائتمان",
    nameEn: "Credit Card",
    icon: <CreditCard className="w-6 h-6" />,
    description: "ادفع ببطاقة الائتمان أو الخصم",
  },
  {
    id: "stc_pay",
    name: "STC Pay",
    nameEn: "STC Pay",
    icon: <Smartphone className="w-6 h-6" />,
    description: "الدفع عبر تطبيق STC Pay",
  },
  {
    id: "bank_transfer",
    name: "حوالة بنكية",
    nameEn: "Bank Transfer",
    icon: <Building2 className="w-6 h-6" />,
    description: "التحويل المباشر إلى الحساب البنكي",
  },
];

interface PaymentOptionsProps {
  amount: number;
  serviceRequestId: string;
  onSelectMethod: (method: PaymentMethod) => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export default function PaymentOptions({
  amount,
  serviceRequestId,
  onSelectMethod,
  onCancel,
  isProcessing = false,
}: PaymentOptionsProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | "">("");

  const handleConfirm = () => {
    if (selectedMethod) {
      onSelectMethod(selectedMethod as PaymentMethod);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">اختر طريقة الدفع</h2>
        <p className="text-muted-foreground">
          المبلغ الإجمالي: <span className="text-2xl font-bold text-primary">{amount} ر.س</span>
        </p>
      </div>

      <RadioGroup value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as PaymentMethod | "")}>
        <div className="space-y-3">
          {paymentMethods.map((method) => (
            <Label
              key={method.id}
              htmlFor={method.id}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all hover-elevate ${
                selectedMethod === method.id
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
              data-testid={`option-payment-${method.id}`}
            >
              <RadioGroupItem value={method.id} id={method.id} />
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                {method.icon}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-lg">{method.name}</div>
                <div className="text-sm text-muted-foreground">{method.description}</div>
              </div>
            </Label>
          ))}
        </div>
      </RadioGroup>

      <div className="flex gap-3 pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
          data-testid="button-cancel-payment"
        >
          إلغاء
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!selectedMethod || isProcessing}
          className="flex-1"
          data-testid="button-confirm-payment"
        >
          {isProcessing ? "جارٍ المعالجة..." : "تأكيد الدفع"}
        </Button>
      </div>
    </div>
  );
}
