import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import JsBarcode from "jsbarcode";
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

const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (base64) {
        resolve(base64);
      } else {
        reject(new Error("Empty base64 output"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });

const buildBarcodeDataUrl = (value: string | undefined | null) => {
  if (!value) return null;
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      height: 50,
      width: 1.6,
      margin: 0,
    });
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("[Invoice PDF] Failed to generate barcode:", error);
    return null;
  }
};

const saveAndOpenPdf = async (blob: Blob, fileName: string) => {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const base64Data = await blobToBase64(blob);
    const safeName = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;

    await Filesystem.writeFile({
      path: safeName,
      data: base64Data,
      directory: Directory.Documents,
      recursive: true,
    });

    const uriResult = await Filesystem.getUri({
      directory: Directory.Documents,
      path: safeName,
    });

    const fileUri = uriResult?.uri;
    if (!fileUri) {
      console.warn("[Invoice PDF] Missing file URI after write.");
      return;
    }
    if (fileUri.startsWith("blob:")) {
      console.warn("[Invoice PDF] Refusing to open blob URL on native:", fileUri);
      return;
    }

    if (isNativePlatform()) {
      console.log("[Invoice PDF] Opening native share sheet");
      await Share.share({
        title: "Invoice PDF",
        url: fileUri,
        dialogTitle: "فتح الفاتورة",
      });
      return;
    }

    await Browser.open({ url: fileUri });
  } catch (error) {
    console.warn("[Invoice PDF] Failed to save/open PDF on native:", error);
  }
};

const handlePdfOutput = async (pdf: jsPDF, fileName: string) => {
  if (isNativePlatform()) {
    console.log("[Invoice PDF] Native handler executed");
    try {
      const blob = pdf.output("blob");
      await saveAndOpenPdf(blob, fileName);
    } catch (error) {
      console.warn("[Invoice PDF] Native save/open failed:", error);
    }
    return;
  }

  pdf.save(fileName);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const hasArabic = (value: string) => /[\u0600-\u06FF]/.test(value);

const collectTextSnapshot = (
  invoice: InvoiceLike,
  user?: InvoiceUser,
  meta?: InvoicePdfMeta
) => {
  const pieces: Array<string | number | null | undefined> = [
    invoice.invoiceNumber,
    invoice.status,
    invoice.description,
    user?.firstName,
    user?.lastName,
    user?.email,
    user?.phone,
    user?.phoneNumber,
    meta?.orderId,
    meta?.serviceName,
    meta?.technicianName,
    meta?.paymentMethod,
    meta?.location,
    meta?.routeFrom,
    meta?.routeTo,
    meta?.notes,
  ];

  if (Array.isArray(invoice.items)) {
    invoice.items.forEach((item) => {
      pieces.push(item.name, item.description);
    });
  }

  return pieces.filter(Boolean).join(" ");
};

const renderInvoiceHtmlToPdf = async (
  invoice: InvoiceLike,
  user: InvoiceUser | undefined,
  meta: InvoicePdfMeta | undefined,
  fileName: string,
  isArabic: boolean,
  barcodeDataUrl?: string | null
) => {
  if (typeof document === "undefined") {
    throw new Error("HTML rendering requires document access.");
  }

  const wrapper = document.createElement("div");
  const direction = isArabic ? "rtl" : "ltr";
  const customerName = getCustomerName(user);
  const contactLines = getCustomerContact(user);

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
  ].filter((row) => row.value);

  const items = Array.isArray(invoice.items)
    ? invoice.items
    : invoice.description
    ? [{ name: invoice.description, quantity: 1, unitPrice: invoice.total, total: invoice.total }]
    : [];

  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "794px";
  wrapper.style.background = "#ffffff";
  wrapper.style.color = "#111111";
  wrapper.style.direction = direction;
  wrapper.style.fontFamily = "'Tajawal','Inter',sans-serif";
  const barcodeBlock = barcodeDataUrl
    ? `<img src="${barcodeDataUrl}" alt="barcode" style="width:180px; height:48px; object-fit:contain; margin-top:8px;" />`
    : "";

  wrapper.innerHTML = `
    <div style="padding:32px 36px;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:24px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="${logoImage}" alt="Cycle Care" style="width:56px; height:56px; object-fit:contain;" />
          <div>
            <div style="font-size:18px; font-weight:700;">Cycle Care</div>
            <div style="font-size:12px; color:#6b7280;">Tax Invoice</div>
          </div>
        </div>
        <div style="text-align:${isArabic ? "left" : "right"}; font-size:12px; color:#111111;">
          <div style="font-weight:700; color:rgb(${brandPrimary.join(",")}); font-size:13px;">
            Invoice: ${escapeHtml(invoice.invoiceNumber)}
          </div>
          ${invoice.status ? `<div style="margin-top:4px; color:#6b7280;">Status: ${escapeHtml(String(invoice.status))}</div>` : ""}
          ${invoice.issuedDate ? `<div style="margin-top:4px; color:#6b7280;">Issued: ${escapeHtml(formatDate(invoice.issuedDate))}</div>` : ""}
          ${barcodeBlock}
        </div>
      </div>

      <div style="display:flex; gap:24px; margin-top:24px;">
        <div style="flex:1;">
          <div style="font-size:11px; color:#6b7280; letter-spacing:0.08em;">BILL TO</div>
          <div style="margin-top:8px; font-size:13px; font-weight:600;">${escapeHtml(customerName)}</div>
          ${contactLines
            .map((line) => `<div style="margin-top:4px; font-size:12px; color:#374151;">${escapeHtml(line)}</div>`)
            .join("")}
        </div>
        <div style="flex:1;">
          <div style="font-size:11px; color:#6b7280; letter-spacing:0.08em;">BOOKING DETAILS</div>
          <div style="margin-top:8px; font-size:12px; color:#111111;">
            ${detailRows
              .map(
                (row) => `
                <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:6px;">
                  <span style="color:#6b7280;">${escapeHtml(row.label)}</span>
                  <span style="font-weight:600;">${escapeHtml(String(row.value))}</span>
                </div>
              `
              )
              .join("")}
          </div>
        </div>
      </div>

      ${
        meta?.notes
          ? `
        <div style="margin-top:20px; background:#f3f4f6; padding:12px 14px; border-radius:10px;">
          <div style="font-size:11px; color:#6b7280; letter-spacing:0.08em;">NOTES</div>
          <div style="margin-top:6px; font-size:12px; color:#111111;">${escapeHtml(meta.notes)}</div>
        </div>
      `
          : ""
      }

      <table style="width:100%; border-collapse:collapse; margin-top:24px; font-size:12px;">
        <thead>
          <tr style="background:rgb(${brandPrimary.join(",")}); color:#ffffff;">
            <th style="text-align:left; padding:8px 10px;">Item</th>
            <th style="text-align:center; padding:8px 10px;">Qty</th>
            <th style="text-align:center; padding:8px 10px;">Unit</th>
            <th style="text-align:right; padding:8px 10px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((item, index) => {
              const name = item.name || item.description || `Item ${index + 1}`;
              const quantity = item.quantity ?? 1;
              const unitPrice = item.unitPrice ?? item.price ?? item.total ?? 0;
              const total = item.total ?? Number(unitPrice) * quantity;
              return `
                <tr style="border-bottom:1px solid #e5e7eb;">
                  <td style="padding:8px 10px;">${escapeHtml(String(name))}</td>
                  <td style="padding:8px 10px; text-align:center;">${escapeHtml(String(quantity))}</td>
                  <td style="padding:8px 10px; text-align:center;">${escapeHtml(formatAmount(unitPrice))}</td>
                  <td style="padding:8px 10px; text-align:right;">${escapeHtml(formatAmount(total))}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>

      <div style="display:flex; justify-content:flex-end; margin-top:16px;">
        <div style="min-width:220px; font-size:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:#6b7280;">Subtotal</span>
            <span>${escapeHtml(formatCurrency(invoice.subtotal))}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <span style="color:#6b7280;">VAT (${escapeHtml(String(invoice.taxRate))}%)</span>
            <span>${escapeHtml(formatCurrency(invoice.taxAmount))}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; color:rgb(${brandAccent.join(",")});">
            <span>Total</span>
            <span>${escapeHtml(formatCurrency(invoice.total))}</span>
          </div>
        </div>
      </div>

      <div style="margin-top:28px; text-align:center; font-size:10px; color:#9ca3af; font-style:italic;">
        Thank you for your business - Cycle Care
      </div>
      <div style="text-align:center; font-size:10px; color:#9ca3af;">
        Riyadh, Kingdom of Saudi Arabia
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = await html2canvas(wrapper, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
  });

  wrapper.remove();

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const imgData = canvas.toDataURL("image/png");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
  heightLeft -= pdfHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, imgHeight);
    heightLeft -= pdfHeight;
  }

  await handlePdfOutput(pdf, fileName);
};

export async function generateInvoicePDF(
  invoice: InvoiceLike,
  user: InvoiceUser | undefined,
  language: "ar" | "en" = "ar",
  meta?: InvoicePdfMeta
) {
  const textSnapshot = collectTextSnapshot(invoice, user, meta);
  const isArabic = language === "ar" || hasArabic(textSnapshot);
  const fileName = `Invoice-${invoice.invoiceNumber}.pdf`;
  const barcodeDataUrl = buildBarcodeDataUrl(invoice.invoiceNumber);

  if (isArabic) {
    try {
      await renderInvoiceHtmlToPdf(invoice, user, meta, fileName, isArabic, barcodeDataUrl);
      return;
    } catch (error) {
      console.error("HTML invoice rendering failed, falling back to vector PDF:", error);
    }
  }

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
  if (barcodeDataUrl) {
    doc.addImage(barcodeDataUrl, "PNG", pageWidth - margin - 55, 36, 55, 16);
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

  await handlePdfOutput(doc, fileName);
}
