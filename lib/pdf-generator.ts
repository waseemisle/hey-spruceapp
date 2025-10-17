import jsPDF from 'jspdf';

interface InvoiceData {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  dueDate: string;
  notes?: string;
  terms?: string;
}

export function generateInvoicePDF(invoice: InvoiceData): jsPDF {
  const doc = new jsPDF();

  // Set font
  doc.setFont('helvetica');

  // Header - Company Info
  doc.setFontSize(24);
  doc.setTextColor(102, 126, 234); // Purple color
  doc.text('HEY SPRUCE APP', 20, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Property Maintenance Management', 20, 27);
  doc.text('San Francisco, California 94104', 20, 32);
  doc.text('United States', 20, 37);
  doc.text('support@heyspruce.com', 20, 42);
  doc.text('Phone: 877-253-2646', 20, 47);

  // Invoice Title
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text('INVOICE', 150, 20);

  // Invoice Details
  doc.setFontSize(10);
  doc.text(`Invoice Number: ${invoice.invoiceNumber}`, 150, 27);
  doc.text(`Date of Issue: ${new Date().toLocaleDateString()}`, 150, 32);
  doc.text(`Date Due: ${invoice.dueDate}`, 150, 37);

  // Bill To Section
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Bill to:', 20, 65);

  doc.setFontSize(10);
  doc.text(invoice.clientName, 20, 72);
  if (invoice.clientAddress) {
    doc.text(invoice.clientAddress.street, 20, 77);
    doc.text(`${invoice.clientAddress.city}, ${invoice.clientAddress.state} ${invoice.clientAddress.zip}`, 20, 82);
  }
  doc.text(invoice.clientEmail, 20, 87);

  // Line Items Table
  const tableTop = 105;
  let yPosition = tableTop;

  // Table Header
  doc.setFillColor(102, 126, 234);
  doc.rect(20, yPosition, 170, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('Description', 22, yPosition + 5);
  doc.text('Qty', 130, yPosition + 5);
  doc.text('Unit Price', 150, yPosition + 5);
  doc.text('Amount', 175, yPosition + 5);

  yPosition += 10;

  // Table Rows
  doc.setTextColor(0, 0, 0);
  invoice.lineItems.forEach((item) => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.text(item.description, 22, yPosition);
    doc.text(String(item.quantity), 130, yPosition);
    doc.text(`$${item.unitPrice.toFixed(2)}`, 150, yPosition);
    doc.text(`$${item.amount.toFixed(2)}`, 175, yPosition);
    yPosition += 7;
  });

  // Totals Section
  yPosition += 10;
  const totalsX = 130;

  doc.text('Subtotal:', totalsX, yPosition);
  doc.text(`$${invoice.subtotal.toFixed(2)}`, 175, yPosition);
  yPosition += 7;

  if (invoice.discountAmount > 0) {
    doc.text('Discount:', totalsX, yPosition);
    doc.text(`-$${invoice.discountAmount.toFixed(2)}`, 175, yPosition);
    yPosition += 7;
  }

  if (invoice.taxAmount > 0) {
    doc.text(`Tax (${invoice.taxRate}%):`, totalsX, yPosition);
    doc.text(`$${invoice.taxAmount.toFixed(2)}`, 175, yPosition);
    yPosition += 7;
  }

  // Total Amount (highlighted)
  yPosition += 3;
  doc.setFillColor(102, 126, 234);
  doc.rect(totalsX - 5, yPosition - 5, 65, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text('Amount Due:', totalsX, yPosition);
  doc.text(`$${invoice.totalAmount.toFixed(2)} USD`, 175, yPosition);

  // Payment Instructions
  yPosition += 20;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);

  if (yPosition > 250) {
    doc.addPage();
    yPosition = 20;
  }

  doc.text('Payment Methods:', 20, yPosition);
  yPosition += 7;
  doc.setFontSize(9);
  doc.text('• Pay online using the Stripe payment link provided in the email', 20, yPosition);
  yPosition += 7;
  doc.text('• Send check to: Hey Spruce App, P.O. Box 104477, Pasadena, CA 91189-4477', 20, yPosition);

  // Notes/Terms
  if (invoice.notes) {
    yPosition += 10;
    doc.setFontSize(9);
    doc.text('Notes:', 20, yPosition);
    yPosition += 5;
    doc.text(invoice.notes, 20, yPosition);
  }

  if (invoice.terms) {
    yPosition += 10;
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }
    doc.setFontSize(9);
    doc.text('Terms & Conditions:', 20, yPosition);
    yPosition += 5;
    doc.text(invoice.terms, 20, yPosition);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${pageCount} | © ${new Date().getFullYear()} Hey Spruce App. All rights reserved.`,
      105,
      285,
      { align: 'center' }
    );
  }

  return doc;
}

export function downloadInvoicePDF(invoice: InvoiceData) {
  const doc = generateInvoicePDF(invoice);
  doc.save(`invoice_${invoice.invoiceNumber}.pdf`);
}

export function getInvoicePDFBase64(invoice: InvoiceData): string {
  const doc = generateInvoicePDF(invoice);
  return doc.output('dataurlstring').split(',')[1];
}
