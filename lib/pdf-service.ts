import jsPDF from 'jspdf'
import { Invoice } from '@/lib/types'

export interface PDFInvoiceData {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  workOrderDescription: string
  workOrderLocation: {
    name: string
    address: string
  }
  totalAmount: number
  laborCost: number
  materialCost: number
  additionalCosts: number
  taxRate: number
  taxAmount: number
  discountAmount?: number
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
    category: string
  }>
  dueDate: string
  createdAt: string
  notes?: string
  terms?: string
  subcontractorName?: string
}

export function generateInvoicePDF(data: PDFInvoiceData): Buffer {
  const doc = new jsPDF()
  
  // Set up colors
  const primaryColor = '#2c3e50'
  const secondaryColor = '#7f8c8d'
  const accentColor = '#3498db'
  
  // Header
  doc.setFillColor(primaryColor)
  doc.rect(0, 0, 210, 30, 'F')
  
  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Spruce App', 20, 20)
  
  // Tagline
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Professional Property Management', 20, 25)
  
  // Invoice title and number
  doc.setTextColor(primaryColor)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', 150, 20)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`#${data.invoiceNumber}`, 150, 25)
  
  // Date and due date
  doc.setFontSize(10)
  doc.text(`Date: ${new Date(data.createdAt).toLocaleDateString()}`, 150, 35)
  doc.text(`Due: ${new Date(data.dueDate).toLocaleDateString()}`, 150, 40)
  
  // Client information
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', 20, 50)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(data.clientName, 20, 55)
  doc.text(data.clientEmail, 20, 60)
  
  // Work order information
  doc.setFont('helvetica', 'bold')
  doc.text('Project Details:', 20, 70)
  
  doc.setFont('helvetica', 'normal')
  doc.text(data.workOrderTitle, 20, 75)
  doc.text(data.workOrderDescription, 20, 80)
  doc.text(`Location: ${data.workOrderLocation.name}`, 20, 85)
  doc.text(data.workOrderLocation.address, 20, 90)
  
  // Subcontractor info if available
  if (data.subcontractorName) {
    doc.text(`Work completed by: ${data.subcontractorName}`, 20, 95)
  }
  
  // Line items table
  const startY = 105
  const tableWidth = 170
  const colWidths = [80, 20, 25, 25, 20] // Description, Qty, Unit Price, Total, Category
  
  // Table header
  doc.setFillColor(240, 240, 240)
  doc.rect(20, startY, tableWidth, 10, 'F')
  
  doc.setTextColor(primaryColor)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Description', 22, startY + 7)
  doc.text('Qty', 102, startY + 7)
  doc.text('Unit Price', 122, startY + 7)
  doc.text('Total', 147, startY + 7)
  doc.text('Category', 167, startY + 7)
  
  // Table rows
  let currentY = startY + 10
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  
  data.lineItems.forEach((item, index) => {
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }
    
    // Alternate row colors
    if (index % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(20, currentY - 2, tableWidth, 8, 'F')
    }
    
    doc.text(item.description.substring(0, 35), 22, currentY + 5)
    doc.text(item.quantity.toString(), 102, currentY + 5)
    doc.text(`$${item.unitPrice.toFixed(2)}`, 122, currentY + 5)
    doc.text(`$${item.totalPrice.toFixed(2)}`, 147, currentY + 5)
    doc.text(item.category, 167, currentY + 5)
    
    currentY += 8
  })
  
  // Summary section
  const summaryY = Math.max(currentY + 10, 200)
  
  // Labor cost
  doc.setFontSize(10)
  doc.text('Labor Cost:', 120, summaryY)
  doc.text(`$${data.laborCost.toFixed(2)}`, 170, summaryY)
  
  // Material cost
  doc.text('Material Cost:', 120, summaryY + 5)
  doc.text(`$${data.materialCost.toFixed(2)}`, 170, summaryY + 5)
  
  // Additional costs
  if (data.additionalCosts > 0) {
    doc.text('Additional Costs:', 120, summaryY + 10)
    doc.text(`$${data.additionalCosts.toFixed(2)}`, 170, summaryY + 10)
  }
  
  // Discount
  if (data.discountAmount && data.discountAmount > 0) {
    doc.text('Discount:', 120, summaryY + 15)
    doc.text(`-$${data.discountAmount.toFixed(2)}`, 170, summaryY + 15)
  }
  
  // Subtotal
  const subtotal = data.laborCost + data.materialCost + data.additionalCosts - (data.discountAmount || 0)
  doc.setFont('helvetica', 'bold')
  doc.text('Subtotal:', 120, summaryY + 20)
  doc.text(`$${subtotal.toFixed(2)}`, 170, summaryY + 20)
  
  // Tax
  doc.setFont('helvetica', 'normal')
  doc.text(`Tax (${data.taxRate}%):`, 120, summaryY + 25)
  doc.text(`$${data.taxAmount.toFixed(2)}`, 170, summaryY + 25)
  
  // Total
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setFillColor(primaryColor)
  doc.rect(120, summaryY + 28, 70, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL:', 122, summaryY + 34)
  doc.text(`$${data.totalAmount.toFixed(2)}`, 170, summaryY + 34)
  
  // Notes and terms
  const notesY = summaryY + 45
  if (data.notes) {
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 20, notesY)
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(data.notes, 170)
    doc.text(notesLines, 20, notesY + 5)
  }
  
  if (data.terms) {
    const termsY = notesY + (data.notes ? 15 : 0)
    doc.setFont('helvetica', 'bold')
    doc.text('Terms & Conditions:', 20, termsY)
    doc.setFont('helvetica', 'normal')
    const termsLines = doc.splitTextToSize(data.terms, 170)
    doc.text(termsLines, 20, termsY + 5)
  }
  
  // Footer
  const pageHeight = doc.internal.pageSize.height
  doc.setFontSize(8)
  doc.setTextColor(secondaryColor)
  doc.text('Thank you for your business!', 20, pageHeight - 20)
  doc.text('For questions, contact us at support@heyspruceapp.com', 20, pageHeight - 15)
  doc.text(`Invoice generated on ${new Date().toLocaleString()}`, 20, pageHeight - 10)
  
  // Convert to buffer
  const pdfOutput = doc.output('arraybuffer')
  return Buffer.from(pdfOutput)
}

export function generateQuotePDF(data: any): Buffer {
  // Similar implementation for quotes - you can expand this later
  const doc = new jsPDF()
  
  // Basic quote PDF structure (similar to invoice but for quotes)
  doc.setFontSize(20)
  doc.text('QUOTE', 20, 20)
  doc.text(`#${data.quoteId}`, 20, 30)
  
  // Add more quote-specific content here
  
  const pdfOutput = doc.output('arraybuffer')
  return Buffer.from(pdfOutput)
}

export interface PDFWorkOrderData {
  workOrderId: string
  workOrderNumber: string
  clientName: string
  clientEmail: string
  title: string
  description: string
  priority: string
  category: string
  status: string
  location: {
    name: string
    address: string
    city: string
    state: string
    zipCode: string
  }
  estimatedCost?: number
  estimatedDuration?: number
  scheduledDate?: string
  notes?: string
  createdAt: string
  approvedAt?: string
  approvedBy?: string
}

export function generateWorkOrderPDF(data: PDFWorkOrderData): Buffer {
  const doc = new jsPDF()
  
  // Set up colors
  const primaryColor = '#2c3e50'
  const secondaryColor = '#7f8c8d'
  const accentColor = '#3498db'
  
  // Header
  doc.setFillColor(primaryColor)
  doc.rect(0, 0, 210, 30, 'F')
  
  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Spruce App', 20, 20)
  
  // Tagline
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Professional Property Management', 20, 25)
  
  // Work Order title and number
  doc.setTextColor(primaryColor)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('WORK ORDER', 150, 20)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(`#${data.workOrderNumber}`, 150, 25)
  
  // Date and status
  doc.setFontSize(10)
  doc.text(`Created: ${new Date(data.createdAt).toLocaleDateString()}`, 150, 35)
  doc.text(`Status: ${data.status.toUpperCase()}`, 150, 40)
  
  if (data.approvedAt) {
    doc.text(`Approved: ${new Date(data.approvedAt).toLocaleDateString()}`, 150, 45)
  }
  
  // Client information
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Client Information:', 20, 50)
  
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(data.clientName, 20, 55)
  doc.text(data.clientEmail, 20, 60)
  
  // Work order details
  doc.setFont('helvetica', 'bold')
  doc.text('Work Order Details:', 20, 70)
  
  doc.setFont('helvetica', 'normal')
  doc.text(`Title: ${data.title}`, 20, 75)
  doc.text(`Priority: ${data.priority.toUpperCase()}`, 20, 80)
  doc.text(`Category: ${data.category.toUpperCase()}`, 20, 85)
  
  // Location information
  doc.setFont('helvetica', 'bold')
  doc.text('Location:', 20, 95)
  
  doc.setFont('helvetica', 'normal')
  doc.text(data.location.name, 20, 100)
  doc.text(data.location.address, 20, 105)
  doc.text(`${data.location.city}, ${data.location.state} ${data.location.zipCode}`, 20, 110)
  
  // Description
  doc.setFont('helvetica', 'bold')
  doc.text('Description:', 20, 120)
  
  doc.setFont('helvetica', 'normal')
  const descriptionLines = doc.splitTextToSize(data.description, 170)
  doc.text(descriptionLines, 20, 125)
  
  // Cost and duration information
  let currentY = 125 + (descriptionLines.length * 5) + 10
  
  if (data.estimatedCost) {
    doc.setFont('helvetica', 'bold')
    doc.text('Estimated Cost:', 20, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(`$${data.estimatedCost.toFixed(2)}`, 80, currentY)
    currentY += 10
  }
  
  if (data.estimatedDuration) {
    doc.setFont('helvetica', 'bold')
    doc.text('Estimated Duration:', 20, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(`${data.estimatedDuration} hours`, 80, currentY)
    currentY += 10
  }
  
  if (data.scheduledDate) {
    doc.setFont('helvetica', 'bold')
    doc.text('Scheduled Date:', 20, currentY)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date(data.scheduledDate).toLocaleDateString(), 80, currentY)
    currentY += 10
  }
  
  // Notes
  if (data.notes) {
    currentY += 10
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 20, currentY)
    
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(data.notes, 170)
    doc.text(notesLines, 20, currentY + 5)
  }
  
  // Footer
  const pageHeight = doc.internal.pageSize.height
  doc.setFontSize(8)
  doc.setTextColor(secondaryColor)
  doc.text('Thank you for choosing Spruce App!', 20, pageHeight - 20)
  doc.text('For questions, contact us at support@heyspruceapp.com', 20, pageHeight - 15)
  doc.text(`Work order generated on ${new Date().toLocaleString()}`, 20, pageHeight - 10)
  
  // Convert to buffer
  const pdfOutput = doc.output('arraybuffer')
  return Buffer.from(pdfOutput)
}
