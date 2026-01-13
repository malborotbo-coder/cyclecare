import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Download,
  MapPin,
  Clock,
  Route,
  User,
  CreditCard,
  FileText,
  Package,
} from "lucide-react";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { loadMockOrders, type StoredOrder } from "@/lib/mockOrders";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import type { Order } from "@shared/schema";

const statusConfig: Record<
  StoredOrder["status"],
  { label: string; className: string }
> = {
  paid: { label: "مدفوع", className: "bg-emerald-500/15 text-emerald-700 border-emerald-200" },
  assigned: { label: "تم الإسناد", className: "bg-blue-500/15 text-blue-700 border-blue-200" },
  on_the_way: { label: "الفني في الطريق", className: "bg-amber-500/15 text-amber-700 border-amber-200" },
  arrived: { label: "تم الوصول", className: "bg-indigo-500/15 text-indigo-700 border-indigo-200" },
  completed: { label: "مكتمل", className: "bg-slate-500/15 text-slate-700 border-slate-200" },
};

const paymentMethodLabels: Record<string, string> = {
  stripe_apple_pay: "Apple Pay",
  stripe_card: "بطاقة ائتمان",
  stc_pay: "STC Pay",
  bank_transfer: "حوالة بنكية",
  mock: "دفع تجريبي",
};

const formatCurrency = (value: number) => `${Number(value).toFixed(2)} ر.س`;

export default function OrdersPage() {
  const serviceOrders = useMemo(() => loadMockOrders(), []);
  const { user } = useFirebaseAuth();
  const { lang } = useLanguage();
  const { data: shopOrdersData, isLoading: shopOrdersLoading } = useQuery<Order[]>({
    queryKey: ["/api/shop/orders"],
  });
  const shopOrders = Array.isArray(shopOrdersData) ? shopOrdersData : [];

  const totals = useMemo(() => {
    const serviceTotal = serviceOrders.reduce((sum, order) => sum + order.total, 0);
    const shopTotal = shopOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const activeCount =
      serviceOrders.filter((order) => order.status !== "completed").length +
      shopOrders.filter((order) => order.status !== "completed").length;
    return { totalSpent: serviceTotal + shopTotal, activeCount };
  }, [serviceOrders, shopOrders]);

  const downloadInvoice = (order: StoredOrder) => {
    const invoice = {
      invoiceNumber: order.invoiceNumber,
      subtotal: order.subtotal,
      taxRate: order.taxRate,
      taxAmount: order.taxAmount,
      total: order.total,
      issuedDate: order.createdAt,
      status: order.status === "paid" ? "PAID" : "ISSUED",
      items: order.items,
    };

    const meta = {
      orderId: order.orderNumber,
      serviceName: order.serviceType,
      technicianName: order.technician,
      paymentMethod: paymentMethodLabels[order.paymentMethod || "mock"] || order.paymentMethod,
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

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(lang === "ar" ? "ar-SA" : "en-US");

  const parseJsonArray = (raw: any) => {
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
  };

  const normalizeTrackingSteps = (raw: any) => {
    if (Array.isArray(raw)) return raw as any[];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const shopStatusLabel = (status: string) => {
    const labels = {
      pending: lang === "ar" ? "قيد الانتظار" : "Pending",
      confirmed: lang === "ar" ? "مؤكد" : "Confirmed",
      processing: lang === "ar" ? "قيد التجهيز" : "Processing",
      completed: lang === "ar" ? "مكتمل" : "Completed",
      cancelled: lang === "ar" ? "ملغي" : "Cancelled",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const shopDeliveryLabel = (option?: string | null) => {
    if (option === "delivery_installation") {
      return lang === "ar" ? "توصيل + تركيب" : "Delivery + Installation";
    }
    return lang === "ar" ? "استلام من المتجر" : "Store pickup";
  };

  return (
    <div className="container max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">طلباتي</h1>
            <p className="text-sm text-muted-foreground">
              تتبع الطلبات والفواتير بشكل احترافي مشابه لأنظمة المتاجر الكبرى.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white/80 dark:bg-slate-900/70 border border-white/30">
          <CardContent className="p-4 space-y-1">
            <p className="text-sm text-muted-foreground">إجمالي الطلبات</p>
            <p className="text-2xl font-bold">{serviceOrders.length + shopOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/80 dark:bg-slate-900/70 border border-white/30">
          <CardContent className="p-4 space-y-1">
            <p className="text-sm text-muted-foreground">طلبات نشطة</p>
            <p className="text-2xl font-bold">{totals.activeCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-white/80 dark:bg-slate-900/70 border border-white/30">
          <CardContent className="p-4 space-y-1">
            <p className="text-sm text-muted-foreground">إجمالي الإنفاق</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totals.totalSpent)}</p>
          </CardContent>
        </Card>
      </div>

      {serviceOrders.length === 0 && shopOrders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد طلبات حتى الآن
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {serviceOrders.map((order) => {
            const statusStyle = statusConfig[order.status];
            return (
              <Card
                key={order.id}
                className="bg-white/85 dark:bg-slate-950/70 backdrop-blur border border-white/20"
              >
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-semibold">
                        طلب {order.orderNumber}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        فاتورة رقم {order.invoiceNumber}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`border ${statusStyle.className}`} variant="outline">
                        {statusStyle.label}
                      </Badge>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">الإجمالي</p>
                        <p className="text-xl font-bold text-primary">{formatCurrency(order.total)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            <h3 className="font-semibold">تفاصيل الخدمة</h3>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الخدمة</span>
                              <span>{order.serviceType}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الفني</span>
                              <span>{order.technician || "غير محدد"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">التقييم</span>
                              <span>{order.technicianRating?.toFixed(1) ?? "4.8"} ⭐</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الموقع</span>
                              <span>{order.locationText || "الرياض"}</span>
                            </div>
                            {order.notes && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">ملاحظات</span>
                                <span className="text-right">{order.notes}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary" />
                            <h3 className="font-semibold">تفاصيل الدفع</h3>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">طريقة الدفع</span>
                              <span>{paymentMethodLabels[order.paymentMethod || "mock"] || "دفع تجريبي"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">المجموع الفرعي</span>
                              <span>{formatCurrency(order.subtotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الضريبة</span>
                              <span>{formatCurrency(order.taxAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between font-semibold text-primary">
                              <span>الإجمالي</span>
                              <span>{formatCurrency(order.total)}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Route className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold">ملخص المسار</h3>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center gap-1 pt-1">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="h-10 w-px bg-primary/30" />
                            <span className="h-2 w-2 rounded-full bg-secondary" />
                          </div>
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{order.route?.fromLabel || "نقطة انطلاق الفني"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{order.route?.toLabel || "موقع العميل"}</span>
                            </div>
                            <div className="flex items-center gap-3 text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Route className="h-4 w-4" />
                                {order.route?.distanceKm ?? 0} كم
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {order.route?.etaMinutes ?? 0} دقيقة
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                        <h3 className="font-semibold">تتبع الطلب</h3>
                        <OrderTrackingTimeline steps={order.trackingSteps} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <h3 className="font-semibold">تفاصيل الفاتورة</h3>
                          </div>
                          <span className="text-xs text-muted-foreground">{order.invoiceNumber}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          {order.items.map((item, index) => (
                            <div key={`${order.id}-item-${index}`} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{item.name}</span>
                              <span>{formatCurrency(item.total)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-border/60 pt-3 space-y-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">المجموع الفرعي</span>
                            <span>{formatCurrency(order.subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">الضريبة</span>
                            <span>{formatCurrency(order.taxAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between text-base font-bold text-primary">
                            <span>الإجمالي</span>
                            <span>{formatCurrency(order.total)}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => downloadInvoice(order)}
                        data-testid={`button-download-${order.id}`}
                      >
                        <Download className="w-4 h-4" />
                        تحميل الفاتورة PDF
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3 pt-4">
          <ClipboardList className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-bold">
            {lang === "ar" ? "طلبات المتجر" : "Shop Orders"}
          </h2>
        </div>

        {shopOrdersLoading ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              {lang === "ar" ? "جارٍ التحميل..." : "Loading..."}
            </CardContent>
          </Card>
        ) : shopOrders.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              {lang === "ar" ? "لا توجد طلبات متجر بعد" : "No shop orders yet"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {shopOrders.map((order) => {
              const tracking = normalizeTrackingSteps((order as any).trackingSteps ?? (order as any).tracking_steps);
              const items = parseJsonArray((order as any).items ?? []);
              return (
                <Card key={order.id} className="bg-white/85 dark:bg-slate-950/70 backdrop-blur border border-white/20">
                  <CardHeader className="space-y-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-semibold">
                          {lang === "ar" ? "طلب متجر" : "Shop Order"} {order.orderNumber}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {shopDeliveryLabel((order as any).deliveryOption ?? (order as any).delivery_option)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">
                          {shopStatusLabel(order.status)}
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {lang === "ar" ? "الإجمالي" : "Total"}
                          </p>
                          <p className="text-xl font-bold text-primary">{formatCurrency(Number(order.total || 0))}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.createdAt ? formatDate(String(order.createdAt)) : ""}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">{lang === "ar" ? "تفاصيل الطلب" : "Order Details"}</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        {Array.isArray(items) && items.length > 0 ? (
                          items.map((item: any, index: number) => (
                            <div key={`${order.id}-shop-item-${index}`} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{item.name}</span>
                              <span>{formatCurrency(Number(item.total || 0))}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-muted-foreground">
                            {lang === "ar" ? "لا توجد عناصر" : "No items"}
                          </p>
                        )}
                      </div>
                    </div>

                    {tracking.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-3">
                        <h3 className="font-semibold">
                          {lang === "ar" ? "تتبع الطلب" : "Order Tracking"}
                        </h3>
                        <OrderTrackingTimeline steps={tracking as any} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
