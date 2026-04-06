import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  Star,
} from "lucide-react";
import { generateInvoicePDF } from "@/lib/generateInvoicePDF";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import OrderTrackingTimeline from "@/components/OrderTrackingTimeline";
import type { Order, ServiceRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { parseTimestamp } from "@/lib/date";
import { hasStoredAuthTokenSync } from "@/lib/authSession";

type ServiceOrderItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type ServiceOrderSummary = {
  id: string;
  serviceRequestId?: string | null;
  orderNumber: string;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  status: string;
  serviceType?: string | null;
  technicianName?: string | null;
  technicianRating?: number | null;
  notes?: string | null;
  locationText?: string | null;
  location?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  paymentMethod?: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  items: ServiceOrderItem[];
  trackingSteps: any[];
  route?: any;
  createdAt: string;
};

type NearbyTechnician = {
  id: string;
  name?: string | null;
  rating?: number | string | null;
  reviewCount?: number | string | null;
  distanceKm?: number | string | null;
  etaMinutes?: number | string | null;
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
  const { toast } = useToast();
  const { user, isGuest, authReady } = useFirebaseAuth();
  const { lang } = useLanguage();
  const canCallProtectedEndpoints =
    authReady && Boolean(user) && !isGuest && hasStoredAuthTokenSync();
  const { data: serviceOrdersData, isLoading: serviceOrdersLoading } = useQuery<ServiceOrderSummary[]>({
    queryKey: ["/api/orders"],
    enabled: canCallProtectedEndpoints,
  });
  const rawServiceOrders = Array.isArray(serviceOrdersData) ? serviceOrdersData : [];
  const { data: shopOrdersData, isLoading: shopOrdersLoading } = useQuery<Order[]>({
    queryKey: ["/api/shop/orders"],
    enabled: canCallProtectedEndpoints,
  });
  const shopOrders = Array.isArray(shopOrdersData) ? shopOrdersData : [];
  const { data: serviceRequestsData } = useQuery<ServiceRequest[]>({
    queryKey: ["/api/service-requests"],
    enabled: canCallProtectedEndpoints,
  });
  const serviceRequests = Array.isArray(serviceRequestsData) ? serviceRequestsData : [];
  const { data: reviewsData, refetch: refetchReviews } = useQuery<any[]>({
    queryKey: ["/api/technician-reviews"],
    enabled: canCallProtectedEndpoints,
  });
  const reviews = Array.isArray(reviewsData) ? reviewsData : [];
  const reviewedOrderIds = useMemo(
    () => new Set(reviews.map((review) => review.order_id ?? review.orderId).filter(Boolean)),
    [reviews],
  );
  const [reviewTarget, setReviewTarget] = useState<ServiceRequest | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<ServiceOrderSummary | null>(null);
  const [nearbyTechnicians, setNearbyTechnicians] = useState<NearbyTechnician[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [assigningTechnicianId, setAssigningTechnicianId] = useState<string | null>(null);
  const [reassignError, setReassignError] = useState<string | null>(null);

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

  const parseJsonObject = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
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

  const normalizeServiceOrder = (order: any): ServiceOrderSummary => {
    const invoice = order?.invoice ?? {};
    const createdAt =
      order?.createdAt ?? order?.created_at ?? order?.serviceRequest?.created_at ?? new Date().toISOString();
    const orderNumber =
      order?.orderNumber ?? order?.order_number ?? order?.serviceRequest?.order_number ?? order?.id ?? "-";
    const invoiceNumber =
      order?.invoiceNumber ?? order?.invoice_number ?? invoice?.invoiceNumber ?? invoice?.invoice_number ?? null;
    const items = parseJsonArray(order?.items ?? invoice?.items ?? []);
    const subtotal = Number(order?.subtotal ?? invoice?.subtotal ?? 0);
    const taxRate = Number(order?.taxRate ?? invoice?.tax_rate ?? invoice?.taxRate ?? 15);
    const taxAmount = Number(order?.taxAmount ?? invoice?.tax_amount ?? invoice?.taxAmount ?? 0);
    const total = Number(order?.total ?? invoice?.total ?? 0);
    const trackingSteps = normalizeTrackingSteps(
      order?.trackingSteps ?? order?.tracking_steps ?? order?.serviceRequest?.tracking_steps,
    );
    const route = parseJsonObject(order?.route ?? order?.route_data ?? order?.routeData ?? order?.serviceRequest?.route);
    const locationText = order?.locationText ?? order?.location ?? order?.serviceRequest?.location ?? null;
    const resolvedId =
      order?.id ?? order?.serviceRequestId ?? order?.service_request_id ?? order?.orderNumber ?? "unknown";
    const ratingValue = Number(order?.technicianRating ?? order?.technician_rating ?? NaN);
    return {
      id: resolvedId,
      serviceRequestId: order?.serviceRequestId ?? order?.service_request_id ?? order?.id ?? null,
      orderNumber,
      invoiceNumber,
      invoiceStatus: order?.invoiceStatus ?? invoice?.status ?? null,
      status: order?.status ?? order?.serviceRequest?.status ?? "pending",
      serviceType: order?.serviceType ?? order?.service_type ?? order?.serviceRequest?.service_type ?? null,
      technicianName: order?.technicianName ?? order?.technician ?? null,
      technicianRating: Number.isFinite(ratingValue) ? ratingValue : null,
      notes: order?.notes ?? null,
      locationText,
      location: order?.location ?? order?.serviceRequest?.location ?? null,
      latitude: order?.latitude ?? order?.serviceRequest?.latitude ?? null,
      longitude: order?.longitude ?? order?.serviceRequest?.longitude ?? null,
      paymentMethod: order?.paymentMethod ?? null,
      subtotal,
      taxRate,
      taxAmount,
      total,
      items,
      trackingSteps,
      route,
      createdAt,
    };
  };

  const normalizedServiceOrders = useMemo(
    () => rawServiceOrders.map((order) => normalizeServiceOrder(order)),
    [rawServiceOrders],
  );

  const totals = useMemo(() => {
    const serviceTotal = normalizedServiceOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const shopTotal = shopOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const activeCount =
      normalizedServiceOrders.filter((order) => order.status !== "completed").length +
      shopOrders.filter((order) => order.status !== "completed").length;
    return { totalSpent: serviceTotal + shopTotal, activeCount };
  }, [normalizedServiceOrders, shopOrders]);

  useEffect(() => {
    if (!reassignTarget) return;
    const lat = Number(reassignTarget.latitude ?? reassignTarget.location?.split(",")?.[0]);
    const lng = Number(reassignTarget.longitude ?? reassignTarget.location?.split(",")?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setNearbyTechnicians([]);
      setReassignError(lang === "ar" ? "تعذر تحديد موقع الطلب." : "Order location is unavailable.");
      return;
    }
    setReassignError(null);
    setLoadingTechnicians(true);
    apiRequest(`/api/technicians/nearby?lat=${lat}&lng=${lng}`, "GET")
      .then((data) => {
        setNearbyTechnicians(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setNearbyTechnicians([]);
        setReassignError(lang === "ar" ? "تعذر تحميل الفنيين المتاحين." : "Failed to load technicians.");
      })
      .finally(() => {
        setLoadingTechnicians(false);
      });
  }, [lang, reassignTarget]);

  const submitReview = async () => {
    if (!canCallProtectedEndpoints) return;
    if (!reviewTarget) return;
    setReviewSubmitting(true);
    try {
      await apiRequest("/api/technician-reviews", "POST", {
        orderId: reviewTarget.id,
        rating: reviewRating,
        comment: reviewComment,
      });
      await refetchReviews();
      setReviewTarget(null);
      setReviewComment("");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleOpenReassign = (order: ServiceOrderSummary) => {
    setReassignTarget(order);
  };

  const handleReassign = async (technicianId: string) => {
    if (!canCallProtectedEndpoints) return;
    if (!reassignTarget) return;
    const requestId = reassignTarget.serviceRequestId || reassignTarget.id;
    if (!requestId) return;
    if (reassignTarget.invoiceStatus !== "paid") {
      toast({
        title: lang === "ar" ? "الدفع مطلوب" : "Payment required",
        description: lang === "ar" ? "يرجى إتمام الدفع قبل إسناد الفني." : "Complete payment before assigning a technician.",
        variant: "destructive",
      });
      return;
    }
    setAssigningTechnicianId(technicianId);
    try {
      await apiRequest(`/api/service-requests/${requestId}`, "PATCH", {
        technicianId,
        status: "assigned_to_technician",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      toast({
        title: lang === "ar" ? "تم إرسال الطلب" : "Request sent",
        description: lang === "ar" ? "سيتم إشعار الفني الجديد بالطلب." : "The technician has been notified.",
      });
      setReassignTarget(null);
    } catch (error: any) {
      toast({
        title: lang === "ar" ? "تعذر إسناد الفني" : "Assignment failed",
        description: error?.message || (lang === "ar" ? "يرجى المحاولة لاحقاً" : "Please try again later."),
        variant: "destructive",
      });
    } finally {
      setAssigningTechnicianId(null);
    }
  };

  const downloadInvoice = (order: ServiceOrderSummary) => {
    const paymentLabel = order.paymentMethod
      ? paymentMethodLabels[order.paymentMethod] || order.paymentMethod
      : lang === "ar"
      ? "غير محدد"
      : "Not available";
    const invoice = {
      invoiceNumber: order.invoiceNumber || "-",
      subtotal: order.subtotal,
      taxRate: order.taxRate,
      taxAmount: order.taxAmount,
      total: order.total,
      issuedDate: order.createdAt,
      status: order.invoiceStatus === "paid" ? "PAID" : "ISSUED",
      items: order.items,
    };

    const meta = {
      orderId: order.orderNumber,
      serviceName: order.serviceType ?? undefined,
      technicianName: order.technicianName ?? undefined,
      paymentMethod: paymentLabel,
      bookingDate: order.createdAt,
      location: order.locationText ?? undefined,
      routeFrom: order.route?.fromLabel ?? undefined,
      routeTo: order.route?.toLabel ?? undefined,
      distanceKm: order.route?.distanceKm,
      etaMinutes: order.route?.etaMinutes,
      notes: order.notes ?? undefined,
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

  const downloadShopInvoice = (order: Order) => {
    const invoiceNumber = (order as any).invoiceNumber ?? (order as any).invoice_number;
    if (!invoiceNumber) return;
    const items = parseJsonArray((order as any).items ?? []);
    const subtotal = Number((order as any).subtotal ?? 0);
    const taxRate = Number((order as any).taxRate ?? (order as any).tax_rate ?? 15);
    const taxAmount = Number((order as any).taxAmount ?? (order as any).tax_amount ?? 0);
    const total = Number(order.total ?? 0);

    const invoice = {
      invoiceNumber,
      subtotal,
      taxRate,
      taxAmount,
      total,
      issuedDate: (order as any).createdAt ?? (order as any).created_at ?? new Date().toISOString(),
      status: "PAID",
      items,
    };

    const meta = {
      orderId: order.orderNumber,
      serviceName: lang === "ar" ? "طلب متجر" : "Shop Order",
      paymentMethod: paymentMethodLabels[(order as any).paymentMethod || "mock"] || (order as any).paymentMethod,
      bookingDate: (order as any).createdAt ?? (order as any).created_at,
      location: (order as any).deliveryAddress ?? (order as any).delivery_address,
      notes: (order as any).notes,
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

  const formatDate = (value: string) => {
    const date = parseTimestamp(value);
    return date ? date.toLocaleString(lang === "ar" ? "ar-SA" : "en-US") : value;
  };

  const resolveItemName = (item: any) => {
    if (item?.feeType === "delivery") {
      return lang === "ar" ? "رسوم التوصيل" : "Delivery fee";
    }
    if (item?.feeType === "installation") {
      return lang === "ar" ? "رسوم التركيب" : "Installation fee";
    }
    return item?.name || "-";
  };

  const resolveStatusConfig = (status: string) => {
    const map = {
      pending: {
        label: lang === "ar" ? "بانتظار الفني" : "Pending",
        className: "bg-slate-500/15 text-slate-700 border-slate-200",
      },
      created: {
        label: lang === "ar" ? "بانتظار الفني" : "Pending",
        className: "bg-slate-500/15 text-slate-700 border-slate-200",
      },
      awaiting_payment: {
        label: lang === "ar" ? "بانتظار الدفع" : "Awaiting payment",
        className: "bg-amber-500/15 text-amber-700 border-amber-200",
      },
      payment_completed: {
        label: lang === "ar" ? "تم الدفع" : "Payment received",
        className: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
      },
      assigned: {
        label: lang === "ar" ? "تم الإسناد" : "Assigned",
        className: "bg-blue-500/15 text-blue-700 border-blue-200",
      },
      assigned_to_technician: {
        label: lang === "ar" ? "تم الإسناد" : "Assigned",
        className: "bg-blue-500/15 text-blue-700 border-blue-200",
      },
      accepted: {
        label: lang === "ar" ? "تم قبول الطلب" : "Accepted",
        className: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
      },
      on_the_way: {
        label: lang === "ar" ? "الفني في الطريق" : "On the way",
        className: "bg-amber-500/15 text-amber-700 border-amber-200",
      },
      arrived: {
        label: lang === "ar" ? "تم الوصول" : "Arrived",
        className: "bg-indigo-500/15 text-indigo-700 border-indigo-200",
      },
      working: {
        label: lang === "ar" ? "جاري تنفيذ الصيانة" : "Working",
        className: "bg-indigo-500/15 text-indigo-700 border-indigo-200",
      },
      in_progress: {
        label: lang === "ar" ? "قيد التنفيذ" : "In progress",
        className: "bg-indigo-500/15 text-indigo-700 border-indigo-200",
      },
      completed: {
        label: lang === "ar" ? "مكتمل" : "Completed",
        className: "bg-slate-500/15 text-slate-700 border-slate-200",
      },
      rejected_by_technician: {
        label: lang === "ar" ? "مرفوض من الفني" : "Rejected",
        className: "bg-red-500/15 text-red-700 border-red-200",
      },
      cancelled: {
        label: lang === "ar" ? "ملغي" : "Cancelled",
        className: "bg-slate-500/15 text-slate-700 border-slate-200",
      },
      paid: {
        label: lang === "ar" ? "مدفوع" : "Paid",
        className: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
      },
    };
    const resolvedStatus = status || "pending";
    return map[resolvedStatus as keyof typeof map] || {
      label: resolvedStatus,
      className: "bg-slate-500/15 text-slate-700 border-slate-200",
    };
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
    <>
      <Dialog
        open={!!reassignTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReassignTarget(null);
            setNearbyTechnicians([]);
            setReassignError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "اختيار فني آخر" : "Choose another technician"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {reassignError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {reassignError}
              </div>
            )}
            {loadingTechnicians ? (
              <div className="text-center text-muted-foreground">
                {lang === "ar" ? "جارٍ تحميل الفنيين..." : "Loading technicians..."}
              </div>
            ) : nearbyTechnicians.length === 0 ? (
              <div className="text-center text-muted-foreground">
                {lang === "ar" ? "لا يوجد فنيون متاحون حالياً" : "No technicians available right now"}
              </div>
            ) : (
              <div className="space-y-2">
                {nearbyTechnicians.map((tech) => {
                  const rating = Number(tech.rating ?? 0);
                  const distance = Number(tech.distanceKm ?? 0);
                  const eta = Number(tech.etaMinutes ?? 0);
                  return (
                    <div
                      key={tech.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-semibold">{tech.name || (lang === "ar" ? "فني معتمد" : "Certified technician")}</div>
                        <div className="text-xs text-muted-foreground">
                          {rating ? `${rating.toFixed(1)} ⭐` : "-"}
                          {distance ? ` • ${distance.toFixed(1)} ${lang === "ar" ? "كم" : "km"}` : ""}
                          {eta ? ` • ${Math.round(eta)} ${lang === "ar" ? "دقيقة" : "min"}` : ""}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReassign(tech.id)}
                        disabled={assigningTechnicianId === tech.id}
                      >
                        {assigningTechnicianId === tech.id
                          ? lang === "ar"
                            ? "جارٍ الإسناد..."
                            : "Assigning..."
                          : lang === "ar"
                          ? "اختيار"
                          : "Select"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
            <p className="text-2xl font-bold">{normalizedServiceOrders.length + shopOrders.length}</p>
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

      {normalizedServiceOrders.length === 0 && shopOrders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {serviceOrdersLoading || shopOrdersLoading
              ? lang === "ar"
                ? "جاري تحميل الطلبات..."
                : "Loading orders..."
              : lang === "ar"
              ? "لا توجد طلبات حتى الآن"
              : "No orders yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {normalizedServiceOrders.map((order) => {
            const statusStyle = resolveStatusConfig(order.status);
            const paymentLabel = order.paymentMethod
              ? paymentMethodLabels[order.paymentMethod] || order.paymentMethod
              : lang === "ar"
              ? "غير محدد"
              : "Not available";
            const isRejected = order.status === "rejected_by_technician";
            const canReview = order.status === "completed" && !reviewedOrderIds.has(order.id);
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
                        فاتورة رقم {order.invoiceNumber || "-"}
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
                  {isRejected && (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="text-sm text-destructive">
                        {lang === "ar"
                          ? "تم رفض الطلب من الفني. يمكنك اختيار فني آخر لإكمال الخدمة."
                          : "The technician rejected this request. Choose another technician to continue."}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReassign(order)}
                      >
                        {lang === "ar" ? "ابحث عن فني آخر" : "Find another technician"}
                      </Button>
                    </div>
                  )}
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
                              <span>{order.serviceType || (lang === "ar" ? "خدمة" : "Service")}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الفني</span>
                              <span>{order.technicianName || "غير محدد"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">التقييم</span>
                              <span>{order.technicianRating ? order.technicianRating.toFixed(1) : "-" } ⭐</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الموقع</span>
                              <span>{order.locationText || order.location || "الرياض"}</span>
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
                              <span>{paymentLabel}</span>
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
                          <div className="text-xs text-muted-foreground text-right">
                            <div>{order.invoiceNumber || "-"}</div>
                            {order.invoiceStatus && (
                              <div>
                                {lang === "ar" ? "الحالة: " : "Status: "}
                                {order.invoiceStatus}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2 text-sm">
                          {order.items.map((item, index) => (
                            <div key={`${order.id}-item-${index}`} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{resolveItemName(item)}</span>
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

                      {canReview && (
                        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Star className="w-4 h-4 text-primary" />
                              {lang === "ar" ? "قيّم الفني" : "Rate the technician"}
                            </div>
                            {reviewTarget?.id !== order.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setReviewTarget(order as unknown as ServiceRequest);
                                  setReviewRating(5);
                                  setReviewComment("");
                                }}
                                data-testid={`button-rate-${order.id}`}
                              >
                                {lang === "ar" ? "بدء التقييم" : "Start rating"}
                              </Button>
                            )}
                          </div>
                          {reviewTarget?.id === order.id && (
                            <div className="space-y-3">
                              <div className="flex items-center justify-center gap-2">
                                {[1, 2, 3, 4, 5].map((value) => (
                                  <Button
                                    key={value}
                                    type="button"
                                    variant={reviewRating >= value ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setReviewRating(value)}
                                  >
                                    ★
                                  </Button>
                                ))}
                              </div>
                              <Textarea
                                placeholder={lang === "ar" ? "ملاحظات إضافية (اختياري)" : "Optional comment"}
                                value={reviewComment}
                                onChange={(event) => setReviewComment(event.target.value)}
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  className="flex-1"
                                  onClick={submitReview}
                                  disabled={reviewSubmitting}
                                >
                                  {reviewSubmitting
                                    ? lang === "ar"
                                      ? "جارٍ الإرسال..."
                                      : "Submitting..."
                                    : lang === "ar"
                                    ? "إرسال التقييم"
                                    : "Submit"}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setReviewTarget(null)}
                                  disabled={reviewSubmitting}
                                >
                                  {lang === "ar" ? "إلغاء" : "Cancel"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

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
              const invoiceNumber = (order as any).invoiceNumber ?? (order as any).invoice_number;
              return (
                <Card key={order.id} className="bg-white/85 dark:bg-slate-950/70 backdrop-blur border border-white/20">
                  <CardHeader className="space-y-2">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-semibold">
                          {lang === "ar" ? "طلب متجر" : "Shop Order"} {order.orderNumber}
                        </CardTitle>
                        {invoiceNumber ? (
                          <p className="text-sm text-muted-foreground">
                            {lang === "ar" ? "فاتورة" : "Invoice"} {invoiceNumber}
                          </p>
                        ) : null}
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
                    {invoiceNumber ? (
                      <Button
                        variant="outline"
                        onClick={() => downloadShopInvoice(order)}
                        data-testid={`button-download-shop-${order.id}`}
                      >
                        <Download className="w-4 h-4 ml-2" />
                        {lang === "ar" ? "تحميل فاتورة المتجر" : "Download Shop Invoice"}
                      </Button>
                    ) : null}
                    <div className="rounded-lg border border-border/60 bg-white/90 dark:bg-white/5 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">{lang === "ar" ? "تفاصيل الطلب" : "Order Details"}</h3>
                      </div>
                      <div className="space-y-2 text-sm">
                        {Array.isArray(items) && items.length > 0 ? (
                          items.map((item: any, index: number) => (
                            <div key={`${order.id}-shop-item-${index}`} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{resolveItemName(item)}</span>
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
    </>
  );
}
