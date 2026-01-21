import type { PricingBreakdown } from "@shared/bookingTypes";

export type OrderTrackingStatus = "done" | "current" | "pending";

export type OrderTrackingStep = {
  id: string;
  title: string;
  description: string;
  status: OrderTrackingStatus;
  timestamp: string;
};

export type OrderRouteSummary = {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
  etaMinutes: number;
  lastUpdated: string;
};

export type StoredOrder = {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  createdAt: string;
  serviceType: string;
  technician?: string;
  technicianRating?: number;
  notes?: string;
  locationText?: string;
  paymentMethod?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: "paid" | "assigned" | "on_the_way" | "arrived" | "completed";
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  trackingSteps: OrderTrackingStep[];
  route: OrderRouteSummary;
};

type CreateMockOrderInput = {
  serviceName: string;
  technicianName: string;
  technicianRating?: number;
  technicianDistanceKm?: number;
  technicianEtaMinutes?: number;
  locationText?: string;
  notes?: string;
  paymentMethod?: string;
  breakdown: PricingBreakdown;
};

const STORAGE_KEY = "mock_orders";

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

const formatNumber = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const generateShortReference = (prefix: string) => {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replace(/-/g, "");
  const randPart = Math.floor(10000 + Math.random() * 90000);
  return `${prefix}-${datePart}-${randPart}`;
};

const generateInvoiceNumber = () => generateShortReference("INV");
const generateOrderNumber = () => generateShortReference("ORD");

const buildTrackingSteps = (createdAt: Date, etaMinutes: number): OrderTrackingStep[] => {
  const paidAt = createdAt;
  const assignedAt = addMinutes(createdAt, 3);
  const onTheWayAt = addMinutes(createdAt, 6);
  const arrivalAt = addMinutes(createdAt, Math.max(etaMinutes, 15));

  return [
    {
      id: "paid",
      title: "تم الدفع",
      description: "تم تأكيد عملية الدفع بنجاح.",
      status: "done",
      timestamp: paidAt.toISOString(),
    },
    {
      id: "assigned",
      title: "تم إسناد الفني",
      description: "جاري تجهيز الفني والتواصل معك.",
      status: "done",
      timestamp: assignedAt.toISOString(),
    },
    {
      id: "on_the_way",
      title: "الفني في الطريق",
      description: `متوقع الوصول خلال ${etaMinutes} دقيقة.`,
      status: "current",
      timestamp: onTheWayAt.toISOString(),
    },
    {
      id: "arrived",
      title: "تم الوصول",
      description: "الفني يصل إلى موقعك ويبدأ الخدمة.",
      status: "pending",
      timestamp: arrivalAt.toISOString(),
    },
  ];
};

const buildItemsFromBreakdown = (serviceName: string, breakdown: PricingBreakdown) => {
  const items: Array<{ name: string; quantity: number; unitPrice: number; total: number }> = [];

  if (breakdown.service?.base) {
    items.push({
      name: breakdown.service.name || serviceName,
      quantity: 1,
      unitPrice: formatNumber(breakdown.service.base),
      total: formatNumber(breakdown.service.base),
    });
  }

  if (breakdown.delivery?.total) {
    items.push({
      name: "رسوم التوصيل",
      quantity: 1,
      unitPrice: formatNumber(breakdown.delivery.total),
      total: formatNumber(breakdown.delivery.total),
    });
  }

  if (Array.isArray(breakdown.parts?.items)) {
    breakdown.parts.items.forEach((part) => {
      items.push({
        name: part.name,
        quantity: formatNumber(part.quantity, 1),
        unitPrice: formatNumber(part.unitPrice),
        total: formatNumber(part.total),
      });
    });
  }

  if (breakdown.install?.total) {
    items.push({
      name: "رسوم التركيب",
      quantity: 1,
      unitPrice: formatNumber(breakdown.install.total),
      total: formatNumber(breakdown.install.total),
    });
  }

  return items;
};

const normalizeOrder = (raw: Partial<StoredOrder>): StoredOrder => {
  const createdAt = raw.createdAt || new Date().toISOString();
  const subtotal = formatNumber(raw.subtotal ?? raw.total ?? 0);
  const taxRate = formatNumber(raw.taxRate ?? 15);
  const taxAmount = formatNumber(
    raw.taxAmount ?? Number((subtotal * (taxRate / 100)).toFixed(2))
  );
  const total = formatNumber(raw.total ?? subtotal + taxAmount);
  const distanceKm = formatNumber(raw.route?.distanceKm ?? 0);
  const etaMinutes = formatNumber(raw.route?.etaMinutes ?? Math.max(15, Math.round(distanceKm * 4)));
  const steps = raw.trackingSteps?.length
    ? raw.trackingSteps
    : buildTrackingSteps(new Date(createdAt), etaMinutes);

  return {
    id: raw.id || crypto.randomUUID(),
    orderNumber: raw.orderNumber || generateOrderNumber(),
    invoiceNumber: raw.invoiceNumber || generateInvoiceNumber(),
    createdAt,
    serviceType: raw.serviceType || "خدمة صيانة",
    technician: raw.technician || "فني معتمد",
    technicianRating: raw.technicianRating ?? 4.8,
    notes: raw.notes,
    locationText: raw.locationText || "الرياض",
    paymentMethod: raw.paymentMethod || "mock",
    subtotal,
    taxRate,
    taxAmount,
    total,
    status: raw.status || "paid",
    items: raw.items?.length
      ? raw.items
      : [
          {
            name: raw.serviceType || "خدمة صيانة",
            quantity: 1,
            unitPrice: subtotal,
            total: subtotal,
          },
        ],
    trackingSteps: steps,
    route: raw.route || {
      fromLabel: "نقطة انطلاق الفني",
      toLabel: raw.locationText || "موقع العميل",
      distanceKm,
      etaMinutes,
      lastUpdated: createdAt,
    },
  };
};

export const loadMockOrders = (): StoredOrder[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedOrders();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedOrders();
    }
    return parsed.map((order) => normalizeOrder(order));
  } catch (error) {
    console.warn("Failed to parse mock orders", error);
    return [];
  }
};

export const saveMockOrder = (order: StoredOrder) => {
  const existing = loadMockOrders();
  const updated = [order, ...existing].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
};

const seedOrders = () => {
  const now = new Date();
  const seed: StoredOrder[] = [
    normalizeOrder({
      id: "demo-order-1",
      orderNumber: "ORD-20260101-103000-1001",
      invoiceNumber: "INV-2026-10001",
      createdAt: now.toISOString(),
      serviceType: "صيانة دورية",
      technician: "فني الموكب - 01",
      technicianRating: 4.9,
      locationText: "الرياض - حي المروج",
      paymentMethod: "mock",
      subtotal: 180,
      taxRate: 15,
      taxAmount: 27,
      total: 207,
      status: "on_the_way",
      items: [
        { name: "صيانة دورية", quantity: 1, unitPrice: 150, total: 150 },
        { name: "رسوم التوصيل", quantity: 1, unitPrice: 30, total: 30 },
      ],
      trackingSteps: [
        {
          id: "paid",
          title: "تم الدفع",
          description: "تم تأكيد عملية الدفع بنجاح.",
          status: "done",
          timestamp: now.toISOString(),
        },
        {
          id: "assigned",
          title: "تم إسناد الفني",
          description: "الفني ضمن الموكب ويتجه إليك.",
          status: "done",
          timestamp: addMinutes(now, 3).toISOString(),
        },
        {
          id: "on_the_way",
          title: "الفني في الطريق",
          description: "متوقع الوصول خلال 18 دقيقة.",
          status: "current",
          timestamp: addMinutes(now, 8).toISOString(),
        },
        {
          id: "arrived",
          title: "تم الوصول",
          description: "الفني وصل موقعك ويبدأ الخدمة.",
          status: "pending",
          timestamp: addMinutes(now, 18).toISOString(),
        },
      ],
      route: {
        fromLabel: "نقطة تجمع الموكب",
        toLabel: "موقع العميل",
        distanceKm: 7.5,
        etaMinutes: 18,
        lastUpdated: now.toISOString(),
      },
    }),
    normalizeOrder({
      id: "demo-order-2",
      orderNumber: "ORD-20260101-094500-1002",
      invoiceNumber: "INV-2026-10002",
      createdAt: addMinutes(now, -90).toISOString(),
      serviceType: "إصلاح عطل",
      technician: "فني الموكب - 07",
      technicianRating: 4.7,
      locationText: "الرياض - حي النرجس",
      paymentMethod: "mock",
      subtotal: 220,
      taxRate: 15,
      taxAmount: 33,
      total: 253,
      status: "completed",
      items: [
        { name: "إصلاح عطل", quantity: 1, unitPrice: 200, total: 200 },
        { name: "رسوم خدمة عاجلة", quantity: 1, unitPrice: 20, total: 20 },
      ],
      trackingSteps: [
        {
          id: "paid",
          title: "تم الدفع",
          description: "تم تأكيد عملية الدفع بنجاح.",
          status: "done",
          timestamp: addMinutes(now, -90).toISOString(),
        },
        {
          id: "assigned",
          title: "تم إسناد الفني",
          description: "الفني في طريقه إليك.",
          status: "done",
          timestamp: addMinutes(now, -80).toISOString(),
        },
        {
          id: "arrived",
          title: "تم الوصول",
          description: "الفني وصل موقعك وبدأ الخدمة.",
          status: "done",
          timestamp: addMinutes(now, -65).toISOString(),
        },
        {
          id: "completed",
          title: "تمت الخدمة",
          description: "تم إنهاء الطلب بنجاح.",
          status: "done",
          timestamp: addMinutes(now, -45).toISOString(),
        },
      ],
      route: {
        fromLabel: "مركز الموكب",
        toLabel: "موقع العميل",
        distanceKm: 5.2,
        etaMinutes: 12,
        lastUpdated: addMinutes(now, -90).toISOString(),
      },
    }),
  ];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
};

export const createMockOrder = (input: CreateMockOrderInput): StoredOrder => {
  const now = new Date();
  const distanceKm = formatNumber(
    input.breakdown.delivery?.distanceKm ?? input.technicianDistanceKm ?? 0
  );
  const etaMinutes = formatNumber(
    input.technicianEtaMinutes ?? Math.max(15, Math.round(distanceKm * 4))
  );

  return normalizeOrder({
    id: crypto.randomUUID(),
    orderNumber: generateOrderNumber(),
    invoiceNumber: generateInvoiceNumber(),
    createdAt: now.toISOString(),
    serviceType: input.serviceName,
    technician: input.technicianName,
    technicianRating: input.technicianRating,
    notes: input.notes,
    locationText: input.locationText,
    paymentMethod: input.paymentMethod,
    subtotal: formatNumber(input.breakdown.subtotal),
    taxRate: formatNumber(input.breakdown.vatRate),
    taxAmount: formatNumber(input.breakdown.vat),
    total: formatNumber(input.breakdown.total),
    status: "paid",
    items: buildItemsFromBreakdown(input.serviceName, input.breakdown),
    trackingSteps: buildTrackingSteps(now, etaMinutes),
    route: {
      fromLabel: "نقطة انطلاق الفني",
      toLabel: input.locationText || "موقع العميل",
      distanceKm,
      etaMinutes,
      lastUpdated: now.toISOString(),
    },
  });
};
