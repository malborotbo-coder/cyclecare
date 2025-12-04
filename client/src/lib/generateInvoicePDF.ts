import jsPDF from 'jspdf';
import type { Invoice, User } from '@shared/schema';
import logoImage from '@assets/IMG_2446_1763409377235.png';

export async function generateInvoicePDF(invoice: Invoice, user: User | undefined, language: 'ar' | 'en' = 'ar') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Note: jsPDF's default fonts don't support Arabic characters well.
  // For production, consider using html2canvas for full RTL/Arabic support.
  // For now, we'll use English labels with Arabic transliteration where needed.
  const isArabic = language === 'ar';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Add logo at the top center
  try {
    const img = new Image();
    img.src = logoImage;
    await new Promise((resolve) => {
      img.onload = resolve;
    });
    const logoWidth = 40;
    const logoHeight = 40;
    doc.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, 15, logoWidth, logoHeight);
  } catch (error) {
    console.error('Error loading logo:', error);
  }

  let yPos = 65;

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  // Always use English in PDF to avoid font rendering issues
  const title = 'TAX INVOICE / FATOORAH';
  doc.text(title, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Invoice number and date
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  const invoiceNumLabel = 'Invoice Number';
  const dateLabel = 'Issued Date';
  
  doc.text(`${invoiceNumLabel}: ${invoice.invoiceNumber}`, 20, yPos);
  if (invoice.issuedDate) {
    const dateStr = new Date(invoice.issuedDate).toLocaleDateString('en-US');
    doc.text(`${dateLabel}: ${dateStr}`, 20, yPos + 7);
  }
  yPos += 20;

  // Customer info
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  const customerLabel = 'Bill To / Customer';
  doc.text(customerLabel, 20, yPos);
  yPos += 8;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  if (user) {
    doc.text(`${user.firstName} ${user.lastName}`, 20, yPos);
    yPos += 6;
    if (user.email) {
      doc.text(user.email, 20, yPos);
      yPos += 6;
    }
  }
  yPos += 10;

  // Items table header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(255, 105, 180); // Pink color matching brand
  doc.rect(20, yPos, pageWidth - 40, 10, 'F');
  doc.setTextColor(255, 255, 255);
  
  const descLabel = 'Description';
  const amountLabel = 'Amount (SAR)';
  
  doc.text(descLabel, 25, yPos + 7);
  doc.text(amountLabel, pageWidth - 55, yPos + 7);
  yPos += 15;

  // Items
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  if (invoice.items && Array.isArray(invoice.items)) {
    const items = invoice.items as any[];
    items.forEach((item: any, index: number) => {
      doc.text(item.name || item.description || `Item ${index + 1}`, 25, yPos);
      doc.text(`${item.total || item.price || 0} SAR`, pageWidth - 45, yPos);
      yPos += 7;
    });
  }
  
  yPos += 5;

  // Totals section
  doc.setDrawColor(200, 200, 200);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  doc.setFont('helvetica', 'normal');
  const subtotalLabel = 'Subtotal';
  const taxRateLabel = `VAT (${invoice.taxRate}%)`;
  const totalLabel = 'Total Amount';

  doc.text(subtotalLabel, 120, yPos);
  doc.text(`${invoice.subtotal} SAR`, pageWidth - 45, yPos);
  yPos += 8;

  doc.text(taxRateLabel, 120, yPos);
  doc.text(`${invoice.taxAmount} SAR`, pageWidth - 45, yPos);
  yPos += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setDrawColor(255, 105, 180);
  doc.setLineWidth(0.5);
  doc.line(115, yPos - 2, pageWidth - 20, yPos - 2);
  
  doc.text(totalLabel, 120, yPos + 5);
  doc.text(`${invoice.total} SAR`, pageWidth - 45, yPos + 5);

  // Footer
  yPos = pageHeight - 30;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 100, 100);
  const footer = 'Thank you for your business - Cycle Care';
  doc.text(footer, pageWidth / 2, yPos, { align: 'center' });

  const companyInfo = 'Kingdom of Saudi Arabia - Riyadh';
  doc.text(companyInfo, pageWidth / 2, yPos + 5, { align: 'center' });
  
  // VAT notice
  doc.setFontSize(8);
  doc.text('VAT No: [Tax Registration Number]', pageWidth / 2, yPos + 10, { align: 'center' });

  // Download the PDF
  doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
}
