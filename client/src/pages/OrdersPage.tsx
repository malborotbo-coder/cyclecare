import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Download } from "lucide-react";

type StoredOrder = {
  id: string;
  total: number;
  serviceType: string;
  technician?: string;
  createdAt: string;
  invoiceUrl?: string;
};

function loadOrders(): StoredOrder[] {
  try {
    const raw = localStorage.getItem("mock_orders");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    console.warn("Failed to parse mock orders", e);
  }
  return [];
}

export default function OrdersPage() {
  const orders = useMemo(() => loadOrders(), []);

  const downloadInvoice = (order: StoredOrder) => {
    const content = `
فاتورة تجريبية
رقم الطلب: ${order.id}
الخدمة: ${order.serviceType}
الفني: ${order.technician || "غير محدد"}
الإجمالي: ${order.total} ر.س
التاريخ: ${new Date(order.createdAt).toLocaleString("ar-SA")}
`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${order.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">طلباتي</h1>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            لا توجد طلبات حتى الآن
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id} className="bg-white/85 dark:bg-slate-900/80 backdrop-blur border border-white/20">
              <CardHeader>
                <CardTitle className="flex justify-between items-center text-lg">
                  <span>طلب #{order.id.slice(0, 6)}</span>
                  <span className="text-primary font-semibold">{order.total} ر.س</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground dark:text-white/80">
                <div className="flex justify-between">
                  <span>الخدمة</span>
                  <span>{order.serviceType}</span>
                </div>
                <div className="flex justify-between">
                  <span>الفني</span>
                  <span>{order.technician || "غير محدد"}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ</span>
                  <span>{new Date(order.createdAt).toLocaleString("ar-SA")}</span>
                </div>
                <div className="pt-3 flex justify-end">
                  <Button variant="outline" className="gap-2" onClick={() => downloadInvoice(order)} data-testid={`button-download-${order.id}`}>
                    <Download className="w-4 h-4" />
                    تحميل الفاتورة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
