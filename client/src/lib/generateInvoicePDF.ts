import jsPDF from "jspdf";
import logoImage from "@assets/cycle-care-new-logo.png";

export type InvoiceLineItem = {
  name?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  price?: number;
};

export type InvoiceLike = {
  invoiceNumber: string;
  subtotal: number | string;
  taxRate: number | string;
  taxAmount: number | string;
  total: number | string;
  status?: string | null;
  issuedDate?: string | Date | null;
  items?: InvoiceLineItem[] | null;
  description?: string | null;
};

export type InvoiceUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneNumber?: string | null;
};

export type InvoicePdfMeta = {
  orderId?: string;
  serviceName?: string;
  technicianName?: string;
  paymentMethod?: string;
  bookingDate?: string;
  location?: string;
  routeFrom?: string;
  routeTo?: string;
  distanceKm?: number;
  etaMinutes?: number;
  notes?: string;
};

const brandPrimary = [232, 106, 75] as const;
const brandAccent = [59, 155, 155] as const;
const softGray = [245, 247, 250] as const;

const formatAmount = (value: number | string) => {
  if (value === null || value === undefined) return "0.00";
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : String(value);
};

const formatDate = (value?: string | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString("en-US");
};

const formatCurrency = (value: number | string) => `${formatAmount(value)} SAR`;

const getCustomerName = (user?: InvoiceUser) => {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return name || "Customer";
};

const getCustomerContact = (user?: InvoiceUser) => {
  if (!user) return [];
  const contact: string[] = [];
  if (user.email) contact.push(user.email);
  const phone = user.phoneNumber ?? user.phone;
  if (phone) contact.push(phone);
  return contact;
};

export async function generateInvoicePDF(
  invoice: InvoiceLike,
  user: InvoiceUser | undefined,
  language: "ar" | "en" = "ar",
  meta?: InvoicePdfMeta
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;

  doc.setFillColor(...softGray);
  doc.rect(0, 0, pageWidth, 42, "F");

  try {
    const img = new Image();
    img.src = logoImage;
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    doc.addImage(img, "PNG", margin, 10, 26, 26);
  } catch (error) {
    console.error("Error loading logo:", error);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text("Cycle Care", margin + 32, 20);
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text("Tax Invoice", margin + 32, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...brandPrimary);
  doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - margin, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  if (invoice.status) {
    doc.text(`Status: ${invoice.status}`, pageWidth - margin, 25, { align: "right" });
  }
  if (invoice.issuedDate) {
    doc.text(`Issued: ${formatDate(invoice.issuedDate)}`, pageWidth - margin, 32, { align: "right" });
  }

  let yPos = 52;
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text("BILL TO", margin, yPos);
  doc.text("BOOKING DETAILS", pageWidth / 2 + 5, yPos);

  yPos += 6;
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(getCustomerName(user), margin, yPos);

  const contacts = getCustomerContact(user);
  let leftY = yPos;
  contacts.forEach((line) => {
    leftY += 6;
    doc.text(line, margin, leftY);
  });

  const detailRows = [
    { label: "Order ID", value: meta?.orderId },
    { label: "Service", value: meta?.serviceName },
    { label: "Technician", value: meta?.technicianName },
    { label: "Payment", value: meta?.paymentMethod },
    { label: "Booking Date", value: meta?.bookingDate ? formatDate(meta.bookingDate) : undefined },
    { label: "Location", value: meta?.location },
    {
      label: "Route",
      value:
        meta?.routeFrom && meta?.routeTo ? `${meta.routeFrom} -> ${meta.routeTo}` : undefined,
    },
    {
      label: "Distance / ETA",
      value:
        meta?.distanceKm || meta?.etaMinutes
          ? `${meta?.distanceKm ?? "-"} km • ${meta?.etaMinutes ?? "-"} min`
          : undefined,
    },
  ];

  let rightY = yPos;
  detailRows.forEach((row) => {
    if (!row.value) return;
    doc.setFontSize(10.5);
    doc.setTextColor(30, 30, 30);
    doc.text(`${row.label}: ${row.value}`, pageWidth / 2 + 5, rightY);
    rightY += 6;
  });

  yPos = Math.max(leftY, rightY) + 10;

  if (meta?.notes) {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text("Notes", margin, yPos);
    yPos += 6;
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(meta.notes, margin, yPos);
    yPos += 10;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(...brandPrimary);
  doc.setTextColor(255, 255, 255);
  doc.rect(margin, yPos, pageWidth - margin * 2, 9, "F");
  doc.text("Item", margin + 4, yPos + 6);
  doc.text("Qty", pageWidth - margin - 60, yPos + 6);
  doc.text("Unit", pageWidth - margin - 35, yPos + 6);
  doc.text("Total", pageWidth - margin - 5, yPos + 6, { align: "right" });
  yPos += 13;

  const items = Array.isArray(invoice.items)
    ? invoice.items
    : invoice.description
    ? [{ name: invoice.description, quantity: 1, unitPrice: invoice.total, total: invoice.total }]
    : [];

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  items.forEach((item, index) => {
    const name = item.name || item.description || `Item ${index + 1}`;
    const quantity = item.quantity ?? 1;
    const unitPrice = item.unitPrice ?? item.price ?? item.total ?? 0;
    const total = item.total ?? Number(unitPrice) * quantity;

    doc.text(String(name), margin + 4, yPos);
    doc.text(String(quantity), pageWidth - margin - 60, yPos);
    doc.text(formatAmount(unitPrice), pageWidth - margin - 35, yPos);
    doc.text(formatAmount(total), pageWidth - margin - 5, yPos, { align: "right" });
    yPos += 7;
  });

  yPos += 4;
  doc.setDrawColor(210, 210, 210);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  const totalsLabelX = pageWidth - margin - 60;
  const totalsValueX = pageWidth - margin;

  doc.setFont("helvetica", "normal");
  doc.text("Subtotal", totalsLabelX, yPos);
  doc.text(formatCurrency(invoice.subtotal), totalsValueX, yPos, { align: "right" });
  yPos += 7;

  doc.text(`VAT (${invoice.taxRate}%)`, totalsLabelX, yPos);
  doc.text(formatCurrency(invoice.taxAmount), totalsValueX, yPos, { align: "right" });
  yPos += 9;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...brandAccent);
  doc.text("Total", totalsLabelX, yPos);
  doc.text(formatCurrency(invoice.total), totalsValueX, yPos, { align: "right" });

  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.text("Thank you for your business - Cycle Care", pageWidth / 2, pageHeight - 20, {
    align: "center",
  });
  doc.text("Riyadh, Kingdom of Saudi Arabia", pageWidth / 2, pageHeight - 14, {
    align: "center",
  });

  doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
}
