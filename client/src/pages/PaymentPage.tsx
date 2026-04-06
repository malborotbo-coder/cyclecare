import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLocation } from "wouter";
import { Apple, CreditCard, Wallet } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

export default function PaymentPage() {
  const { lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { user } = useFirebaseAuth();
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);

  const isArabic = lang === "ar";

  const t = {
    ar: {
      title: "الدفع الآمن",
      selectMethod: "اختر طريقة الدفع",
      applePayLabel: "Apple Pay",
      madaLabel: "Mada",
      tabbyLabel: "Tabby",
      tamaraLabel: "Tamara",
      creditCardLabel: "بطاقة ائتمان",
      bankTransfer: "تحويل بنكي",
      amount: "المبلغ المستحق",
      pay: "ادفع الآن",
      cancel: "إلغاء",
      processing: "جاري المعالجة...",
      success: "تم الدفع بنجاح!",
      successMsg: "شكراً لك! تم استقبال دفعتك وجاري معالجتها.",
      error: "فشل في المعالجة",
      selectPaymentMethod: "يرجى اختيار طريقة دفع",
    },
    en: {
      title: "Secure Payment",
      selectMethod: "Select Payment Method",
      applePayLabel: "Apple Pay",
      madaLabel: "Mada",
      tabbyLabel: "Tabby",
      tamaraLabel: "Tamara",
      creditCardLabel: "Credit Card",
      bankTransfer: "Bank Transfer",
      amount: "Amount Due",
      pay: "Pay Now",
      cancel: "Cancel",
      processing: "Processing...",
      success: "Payment Successful!",
      successMsg: "Thank you! Your payment has been received and is being processed.",
      error: "Processing Failed",
      selectPaymentMethod: "Please select a payment method",
    },
  };

  const labels = t[isArabic ? "ar" : "en"];

  const paymentMethods = [
    { id: "apple_pay", label: labels.applePayLabel, icon: Apple, color: "bg-black dark:bg-white" },
    { id: "mada", label: labels.madaLabel, icon: CreditCard, color: "bg-blue-600" },
    { id: "tabby", label: labels.tabbyLabel, icon: Wallet, color: "bg-amber-400" },
    { id: "tamara", label: labels.tamaraLabel, icon: Wallet, color: "bg-green-600" },
    { id: "credit_card", label: labels.creditCardLabel, icon: CreditCard, color: "bg-gray-700" },
    { id: "bank_transfer", label: labels.bankTransfer, icon: Wallet, color: "bg-purple-600" },
    { id: "mock", label: isArabic ? "دفع تجريبي" : "Mock Payment", icon: Wallet, color: "bg-primary" },
  ];

  const handlePayment = () => {
    if (!selectedMethod) {
      alert(labels.selectPaymentMethod);
      return;
    }
    setShowSuccess(true);
    setTimeout(() => {
      setLocation("/");
    }, 2000);
  };

  if (showSuccess) {
    return (
      <div className="relative z-10">
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-white/85 dark:bg-slate-900/85 backdrop-blur border border-white/20 p-8 text-center shadow-xl">
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <h2 className="text-2xl font-bold mb-2">{labels.success}</h2>
            <p className="text-muted-foreground">{labels.successMsg}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10">
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto">
          <h1 className={`text-3xl font-bold text-white mb-8 ${isArabic ? "text-right" : "text-left"}`}>
            {labels.title}
          </h1>

          {/* Amount Card */}
          <Card className="bg-white/85 dark:bg-slate-900/85 backdrop-blur border border-white/20 p-6 mb-6 shadow-xl">
            <div className={`text-muted-foreground mb-2 ${isArabic ? "text-right" : "text-left"}`}>
              {labels.amount}
            </div>
            <div className={`text-4xl font-bold ${isArabic ? "text-right" : "text-left"}`}>
              150.00 <span className="text-lg">SAR</span>
            </div>
          </Card>

          {/* Payment Methods */}
          <div className="mb-6">
            <h3 className={`text-lg font-semibold text-white mb-4 ${isArabic ? "text-right" : "text-left"}`}>
              {labels.selectMethod}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {paymentMethods.map((method) => {
                const Icon = method.icon;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id)}
                    className={`p-4 rounded-lg border-2 transition-all bg-white/80 dark:bg-slate-900/80 backdrop-blur ${
                      selectedMethod === method.id
                        ? "border-primary"
                        : "border-white/30 hover:border-primary/60"
                    }`}
                    data-testid={`button-payment-${method.id}`}
                  >
                    <Icon className="w-6 h-6 mx-auto mb-2" />
                    <p className="text-sm font-medium">{method.label}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              className="flex-1"
              data-testid="button-cancel-payment"
            >
              {labels.cancel}
            </Button>
            <Button
              onClick={handlePayment}
              className="flex-1 bg-primary hover:bg-primary/90"
              disabled={!selectedMethod}
              data-testid="button-submit-payment"
            >
              {labels.pay}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
