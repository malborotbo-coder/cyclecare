// Shared booking/pricing/role data contracts (frontend + backend)

export type AppRole = "customer" | "technician" | "admin";

export type TechnicianStatus = "online" | "offline";

export interface TechnicianLocation {
  technicianId: string;
  latitude: number;
  longitude: number;
  lastUpdated: string;
  status: TechnicianStatus;
  distanceKm?: number;
  etaMinutes?: number;
}

export interface PricingBreakdown {
  service: {
    id?: string;
    name?: string;
    base: number;
  };
  parts: {
    items: Array<{ id?: string; name: string; quantity: number; unitPrice: number; total: number }>;
    total: number;
  };
  install: {
    accessoryFee: number;
    sparePartFee: number;
    total: number;
  };
  delivery: {
    base: number;
    perKm: number;
    distanceKm: number;
    total: number;
    min: number;
    max: number;
  };
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  breakdownVersion?: string;
}

export interface OrderRecord {
  id: string;
  userId: string;
  technicianId?: string;
  serviceRequestId?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  commissionRate?: number;
  appCommissionAmount?: number;
  technicianNetAmount?: number;
  breakdownJson?: PricingBreakdown;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  metadata?: Record<string, any>;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  userId: string;
  serviceRequestId?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: "draft" | "issued" | "paid" | "cancelled";
  pdfUrl?: string;
  metadata?: Record<string, any>;
  items?: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
}
