import jsPDF from 'jspdf';
import { SPRUCE_LOGO_BASE64 } from './logo-base64';

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
  workOrderName?: string;
  vendorName?: string;
  serviceDescription?: string;
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

// Brand colors matching heyspruce.com
const COLORS = {
  primary: [100, 116, 139] as [number, number, number], // Green #16a34a
  secondary: [8, 145, 178] as [number, number, number], // Teal #0891b2
  dark: [30, 41, 59] as [number, number, number], // Dark slate #1e293b
  gray: [100, 116, 139] as [number, number, number], // Gray #64748b
  lightGray: [226, 232, 240] as [number, number, number], // Light gray #e2e8f0
  white: [255, 255, 255] as [number, number, number],
  text: [51, 65, 85] as [number, number, number], // Slate #334155
};

export function generateInvoicePDF(invoice: InvoiceData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Logo - Embedded as base64
  try {
    doc.addImage(SPRUCE_LOGO_BASE64, 'PNG', 20, 12, 55, 16);
  } catch (error) {
    // Fallback to styled text if logo fails
    doc.setFontSize(18);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('HEY', 20, 22);
    doc.setTextColor(...COLORS.secondary);
    doc.text('SPRUCE', 35, 22);

    // Decorative underline for brand
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.8);
    doc.line(20, 24, 60, 24);
  }

  // Company Info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.gray);
  doc.text('Cleaning & Maintenance', 20, 35);
  doc.text('1972 E 20th St, Los Angeles, CA 90058', 20, 39);
  doc.text('info@heyspruce.com | 1-877-253-26464', 20, 43);

  // Invoice Title - Right aligned
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('INVOICE', pageWidth - 20, 22, { align: 'right' });

  // Invoice Details - Right aligned box with background
  const detailsBoxX = pageWidth - 75;
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(detailsBoxX, 28, 55, 22, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('Invoice Number:', detailsBoxX + 3, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoiceNumber, detailsBoxX + 3, 38);

  doc.setFont('helvetica', 'bold');
  doc.text('Issue Date:', detailsBoxX + 3, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), detailsBoxX + 3, 48);

  // Decorative line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(20, 55, pageWidth - 20, 55);

  // Bill To Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('BILL TO:', 20, 63);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text(invoice.clientName, 20, 70);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  if (invoice.clientAddress) {
    doc.text(invoice.clientAddress.street, 20, 75);
    doc.text(`${invoice.clientAddress.city}, ${invoice.clientAddress.state} ${invoice.clientAddress.zip}`, 20, 80);
  }
  doc.text(invoice.clientEmail, 20, 85);

  // Due Date Box - Right side
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(pageWidth - 65, 60, 45, 15, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('DUE DATE:', pageWidth - 62, 66);
  doc.setFontSize(11);
  doc.text(invoice.dueDate, pageWidth - 62, 72);

  // Service Information Section - Added after Bill To section
  let yPosition = 95;
  if (invoice.workOrderName || invoice.vendorName || invoice.serviceDescription) {
    const startY = yPosition;
    
    // Calculate height needed for content
    let contentHeight = 8; // Header
    if (invoice.workOrderName) {
      const splitWorkOrderName = doc.splitTextToSize(invoice.workOrderName, pageWidth - 80);
      contentHeight += Math.max(6, splitWorkOrderName.length * 5) + 2;
    }
    if (invoice.vendorName) {
      contentHeight += 6;
    }
    if (invoice.serviceDescription) {
      const splitServiceDesc = doc.splitTextToSize(invoice.serviceDescription, pageWidth - 50);
      contentHeight += 5 + Math.max(6, splitServiceDesc.length * 5) + 3;
    }
    
    // Draw background box
    doc.setFillColor(248, 250, 252); // Very light gray
    doc.roundedRect(20, startY - 3, pageWidth - 40, contentHeight + 5, 2, 2, 'F');
    
    // Draw content
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('SERVICE INFORMATION', 25, yPosition + 3);
    
    yPosition += 8;
    
    // Work Order Name
    if (invoice.workOrderName) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.dark);
      doc.text('Work Order:', 25, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.text);
      const splitWorkOrderName = doc.splitTextToSize(invoice.workOrderName, pageWidth - 80);
      doc.text(splitWorkOrderName, 70, yPosition);
      yPosition += Math.max(6, splitWorkOrderName.length * 5) + 2;
    }
    
    // Vendor Name
    if (invoice.vendorName) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.dark);
      doc.text('Vendor:', 25, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.text);
      doc.text(invoice.vendorName, 70, yPosition);
      yPosition += 6;
    }
    
    // Service Description
    if (invoice.serviceDescription) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.dark);
      doc.text('Service:', 25, yPosition);
      yPosition += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.text);
      const splitServiceDesc = doc.splitTextToSize(invoice.serviceDescription, pageWidth - 50);
      doc.text(splitServiceDesc, 25, yPosition);
      yPosition += Math.max(6, splitServiceDesc.length * 5) + 3;
    }
    
    yPosition += 5; // Extra spacing before table
  }

  // Line Items Table
  const tableTop = yPosition;
  yPosition = tableTop;

  // Modern Table Header with gradient effect
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(20, yPosition, pageWidth - 40, 10, 2, 2, 'F');

  doc.setTextColor(...COLORS.white);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', 25, yPosition + 6.5);
  doc.text('QTY', pageWidth - 85, yPosition + 6.5, { align: 'center' });
  doc.text('UNIT PRICE', pageWidth - 55, yPosition + 6.5, { align: 'right' });
  doc.text('AMOUNT', pageWidth - 25, yPosition + 6.5, { align: 'right' });

  yPosition += 12;

  // Table Rows with alternating backgrounds
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let rowIndex = 0;

  invoice.lineItems.forEach((item) => {
    // Split description text to fit within column width (adaptive width for description column)
    const descriptionMaxWidth = pageWidth - 115;
    const splitDescription = doc.splitTextToSize(item.description, descriptionMaxWidth);
    const lineHeight = 5;
    const rowHeight = Math.max(8, splitDescription.length * lineHeight + 2);

    // Check if we need a new page
    if (yPosition + rowHeight > 240) {
      doc.addPage();
      yPosition = 20;
      

      // Redraw header on new page
      doc.setFillColor(...COLORS.primary);
      doc.roundedRect(20, yPosition, pageWidth - 40, 10, 2, 2, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DESCRIPTION', 25, yPosition + 6.5);
      doc.text('QTY', pageWidth - 85, yPosition + 6.5, { align: 'center' });
      doc.text('UNIT PRICE', pageWidth - 55, yPosition + 6.5, { align: 'right' });
      doc.text('AMOUNT', pageWidth - 25, yPosition + 6.5, { align: 'right' });
      yPosition += 12;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      rowIndex = 0;
    }

    // Alternating row colors with dynamic height
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252); // Very light gray
      doc.rect(20, yPosition - 4, pageWidth - 40, rowHeight, 'F');
    }

    doc.setTextColor(...COLORS.text);
    // Draw wrapped description text
    doc.text(splitDescription, 25, yPosition);

    // Position other columns at the vertical center of the row
    const centerY = yPosition + (splitDescription.length > 1 ? ((splitDescription.length - 1) * lineHeight) / 2 : 0);

    doc.text(String(item.quantity), pageWidth - 85, centerY, { align: 'center' });
    doc.text(`$${item.unitPrice.toFixed(2)}`, pageWidth - 55, centerY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(`$${item.amount.toFixed(2)}`, pageWidth - 25, centerY, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    yPosition += rowHeight;
    rowIndex++;
  });

  // Totals Section
  yPosition += 8;
  const totalsX = pageWidth - 90;

  // Totals box background
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(totalsX - 5, yPosition - 5, 75, 40, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);

  doc.text('Subtotal:', totalsX, yPosition);
  doc.text(`$${invoice.subtotal.toFixed(2)}`, pageWidth - 25, yPosition, { align: 'right' });
  yPosition += 6;

  if (invoice.discountAmount > 0) {
    doc.setTextColor(...COLORS.secondary);
    doc.text('Discount:', totalsX, yPosition);
    doc.text(`-$${invoice.discountAmount.toFixed(2)}`, pageWidth - 25, yPosition, { align: 'right' });
    yPosition += 6;
    doc.setTextColor(...COLORS.text);
  }

  if (invoice.taxAmount > 0) {
    doc.text(`Tax (${invoice.taxRate}%):`, totalsX, yPosition);
    doc.text(`$${invoice.taxAmount.toFixed(2)}`, pageWidth - 25, yPosition, { align: 'right' });
    yPosition += 6;
  }

  // Separator line
  doc.setDrawColor(...COLORS.gray);
  doc.setLineWidth(0.3);
  doc.line(totalsX, yPosition, pageWidth - 25, yPosition);
  yPosition += 5;

  // Total Amount (highlighted)
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(totalsX - 5, yPosition - 4, 75, 12, 2, 2, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('AMOUNT DUE:', totalsX, yPosition + 2);
  doc.setFontSize(14);
  doc.text(`$${invoice.totalAmount.toFixed(2)} USD`, pageWidth - 25, yPosition + 2, { align: 'right' });

  // Payment Instructions Section
  yPosition += 18;

  if (yPosition > 230) {
    doc.addPage();
    yPosition = 20;
  }

  // Payment box with icon-style design
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(20, yPosition - 3, pageWidth - 40, 28, 2, 2, 'F');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('PAYMENT METHODS', 25, yPosition + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text('• Pay securely online using the Stripe payment link provided in your email', 25, yPosition + 10);
  doc.text('• Mail check payable to: Cleaning & Maintenance', 25, yPosition + 16);
  doc.text('  1972 E 20th St, Los Angeles, CA 90058', 25, yPosition + 21);

  yPosition += 32;

  // Notes Section
  if (invoice.notes) {
    if (yPosition > 230) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFillColor(248, 250, 252);
    const notesHeight = 20;
    doc.roundedRect(20, yPosition - 3, pageWidth - 40, notesHeight, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('NOTES', 25, yPosition + 3);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const splitNotes = doc.splitTextToSize(invoice.notes, pageWidth - 50);
    doc.text(splitNotes, 25, yPosition + 10);

    yPosition += notesHeight + 5;
  }

  // Terms & Conditions
  if (invoice.terms) {
    if (yPosition > 230) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text('TERMS & CONDITIONS', 20, yPosition);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    const splitTerms = doc.splitTextToSize(invoice.terms, pageWidth - 40);
    doc.text(splitTerms, 20, yPosition + 6);
  }

  // Footer with modern design
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);

    // Footer text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    doc.text(
      `Page ${i} of ${pageCount}`,
      20,
      pageHeight - 10
    );
    doc.text(
      `© ${new Date().getFullYear()} Cleaning & Maintenance. All rights reserved.`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    doc.text(
      'info@heyspruce.com | 1-877-253-26464',
      pageWidth - 20,
      pageHeight - 10,
      { align: 'right' }
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

// Work Order PDF Generator
interface WorkOrderData {
  workOrderNumber: string;
  clientName: string;
  clientEmail: string;
  clientAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  locationName: string;
  locationAddress?: string;
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimateBudget?: number;
  dueDate: string;
  notes?: string;
  terms?: string;
}

export function generateWorkOrderPDF(workOrder: WorkOrderData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Logo - Embedded as base64
  try {
    doc.addImage(SPRUCE_LOGO_BASE64, 'PNG', 20, 12, 55, 16);
  } catch (error) {
    // Fallback to styled text if logo fails
    doc.setFontSize(18);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('HEY', 20, 22);
    doc.setTextColor(...COLORS.secondary);
    doc.text('SPRUCE', 35, 22);

    // Decorative underline for brand
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(0.8);
    doc.line(20, 24, 60, 24);
  }

  // Company Info
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.gray);
  doc.text('Cleaning & Maintenance', 20, 35);
  doc.text('1972 E 20th St, Los Angeles, CA 90058', 20, 39);
  doc.text('info@heyspruce.com | 1-877-253-26464', 20, 43);

  // Work Order Title - Right aligned
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('WORK ORDER', pageWidth - 20, 22, { align: 'right' });

  // Work Order Details - Right aligned box with background
  const detailsBoxX = pageWidth - 75;
  doc.setFillColor(...COLORS.lightGray);
  doc.roundedRect(detailsBoxX, 28, 55, 22, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('Work Order #:', detailsBoxX + 3, 33);
  doc.setFont('helvetica', 'normal');
  doc.text(workOrder.workOrderNumber, detailsBoxX + 3, 38);

  doc.setFont('helvetica', 'bold');
  doc.text('Issue Date:', detailsBoxX + 3, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), detailsBoxX + 3, 48);

  // Decorative line
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.5);
  doc.line(20, 55, pageWidth - 20, 55);

  // Client Information Section
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('CLIENT INFORMATION:', 20, 63);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text(workOrder.clientName, 20, 70);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  if (workOrder.clientAddress) {
    doc.text(workOrder.clientAddress.street, 20, 75);
    doc.text(`${workOrder.clientAddress.city}, ${workOrder.clientAddress.state} ${workOrder.clientAddress.zip}`, 20, 80);
  }
  doc.text(workOrder.clientEmail, 20, 85);

  // Due Date Box - Right side
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(pageWidth - 65, 60, 45, 15, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text('DUE DATE:', pageWidth - 62, 66);
  doc.setFontSize(11);
  doc.text(workOrder.dueDate, pageWidth - 62, 72);

  // Work Order Details Section
  let yPosition = 100;

  // Work Order Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text('WORK ORDER DETAILS', 20, yPosition);
  yPosition += 8;

  // Priority and Category
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('Priority:', 20, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(workOrder.priority.toUpperCase(), 50, yPosition);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('Category:', 100, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(workOrder.category, 130, yPosition);
  yPosition += 8;

  // Work Order Title
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('Title:', 20, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  const splitTitle = doc.splitTextToSize(workOrder.title, pageWidth - 50);
  doc.text(splitTitle, 50, yPosition);
  yPosition += splitTitle.length * 5 + 5;

  // Description
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('Description:', 20, yPosition);
  yPosition += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  const splitDescription = doc.splitTextToSize(workOrder.description, pageWidth - 40);
  doc.text(splitDescription, 20, yPosition);
  yPosition += splitDescription.length * 5 + 8;

  // Location Information
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('LOCATION:', 20, yPosition);
  yPosition += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.text);
  doc.text(workOrder.locationName, 20, yPosition);
  if (workOrder.locationAddress) {
    yPosition += 5;
    doc.text(workOrder.locationAddress, 20, yPosition);
  }
  yPosition += 10;

  // Budget Information
  if (workOrder.estimateBudget) {
    doc.setFillColor(...COLORS.lightGray);
    doc.roundedRect(20, yPosition - 3, pageWidth - 40, 15, 2, 2, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text('ESTIMATED BUDGET:', 25, yPosition + 3);
    doc.text(`$${workOrder.estimateBudget.toLocaleString()}`, pageWidth - 25, yPosition + 3, { align: 'right' });
    yPosition += 20;
  }

  // Notes Section
  if (workOrder.notes) {
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFillColor(248, 250, 252);
    const notesHeight = 20;
    doc.roundedRect(20, yPosition - 3, pageWidth - 40, notesHeight, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('NOTES', 25, yPosition + 3);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const splitNotes = doc.splitTextToSize(workOrder.notes, pageWidth - 50);
    doc.text(splitNotes, 25, yPosition + 10);

    yPosition += notesHeight + 5;
  }

  // Terms & Conditions
  if (workOrder.terms) {
    if (yPosition > 230) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text('TERMS & CONDITIONS', 20, yPosition);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    const splitTerms = doc.splitTextToSize(workOrder.terms, pageWidth - 40);
    doc.text(splitTerms, 20, yPosition + 6);
  }

  // Footer with modern design
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Footer line
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.5);
    doc.line(20, pageHeight - 15, pageWidth - 20, pageHeight - 15);

    // Footer text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.gray);
    doc.text(
      `Page ${i} of ${pageCount}`,
      20,
      pageHeight - 10
    );
    doc.text(
      `© ${new Date().getFullYear()} Cleaning & Maintenance. All rights reserved.`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    doc.text(
      'info@heyspruce.com | 1-877-253-26464',
      pageWidth - 20,
      pageHeight - 10,
      { align: 'right' }
    );
  }

  return doc;
}

export function downloadWorkOrderPDF(workOrder: WorkOrderData) {
  const doc = generateWorkOrderPDF(workOrder);
  doc.save(`work_order_${workOrder.workOrderNumber}.pdf`);
}

export function getWorkOrderPDFBase64(workOrder: WorkOrderData): string {
  const doc = generateWorkOrderPDF(workOrder);
  return doc.output('dataurlstring').split(',')[1];
}