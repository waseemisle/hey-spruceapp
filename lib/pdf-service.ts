import jsPDF from 'jspdf'
import { Invoice } from '@/lib/types'

const LOGO_URL = 'https://cdn.prod.website-files.com/67edc7c78e3151d3b06686b2/681007b1b7f5a5cc527f1b94_Hey_SPRUCE_logo_font.png'

// Helper function to load image as base64 (Node.js compatible)
async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')

    // Determine the image type from the URL
    const extension = url.split('.').pop()?.toLowerCase()
    let mimeType = 'image/png'
    if (extension === 'jpg' || extension === 'jpeg') {
      mimeType = 'image/jpeg'
    } else if (extension === 'gif') {
      mimeType = 'image/gif'
    }

    return `data:${mimeType};base64,${base64}`
  } catch (error) {
    console.error('Error loading logo:', error)
    return ''
  }
}

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

export async function generateInvoicePDF(data: PDFInvoiceData): Promise<Buffer> {
  const doc = new jsPDF()

  // Load logo
  const logoBase64 = await loadImageAsBase64(LOGO_URL)

  // Professional color scheme
  const primaryColor: [number, number, number] = [31, 41, 55] // #1f2937 - Dark gray/black for text
  const accentColor: [number, number, number] = [59, 130, 246] // #3b82f6 - Blue accent
  const lightGray: [number, number, number] = [249, 250, 251] // #f9fafb - Light background
  const borderGray: [number, number, number] = [229, 231, 235] // #e5e7eb - Borders
  const textGray: [number, number, number] = [107, 114, 128] // #6b7280 - Secondary text

  // White background
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, 210, 297, 'F')

  // Header section - Logo on the left
  if (logoBase64) {
    try {
      // Logo positioned at top-left with good prominence
      doc.addImage(logoBase64, 'PNG', 20, 20, 70, 21)
    } catch (err) {
      console.error('Error adding logo to PDF:', err)
    }
  }

  // Invoice title and details on the right side
  doc.setFontSize(32)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text('INVOICE', 190, 28, { align: 'right' })

  // Invoice number
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)
  doc.text(`Invoice #${data.invoiceNumber}`, 190, 36, { align: 'right' })

  // Dates section
  doc.setFontSize(9)
  doc.setTextColor(...textGray)
  doc.text(`Date Issued: ${new Date(data.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 190, 43, { align: 'right' })
  doc.text(`Due Date: ${new Date(data.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 190, 49, { align: 'right' })
  
  // Divider line after header
  let currentY = 56
  doc.setDrawColor(...borderGray)
  doc.setLineWidth(0.5)
  doc.line(20, currentY, 190, currentY)

  // Bill To section
  currentY = 70
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...textGray)
  doc.text('BILL TO', 20, currentY)

  currentY += 6
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text(data.clientName, 20, currentY)

  currentY += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)
  doc.text(data.clientEmail, 20, currentY)

  if (data.workOrderLocation) {
    currentY += 4
    doc.text(data.workOrderLocation.name, 20, currentY)
    currentY += 4
    doc.text(data.workOrderLocation.address, 20, currentY)
  }

  // Project/Work Order Details on the right
  let rightY = 70
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...textGray)
  doc.text('PROJECT', 190, rightY, { align: 'right' })

  rightY += 6
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  const titleLines = doc.splitTextToSize(data.workOrderTitle, 80)
  doc.text(titleLines[0], 190, rightY, { align: 'right' })

  if (data.subcontractorName) {
    rightY += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...textGray)
    doc.text(`Contractor: ${data.subcontractorName}`, 190, rightY, { align: 'right' })
  }

  // Line items table
  const startY = 110
  currentY = startY

  // Table header with clean professional design
  doc.setFillColor(...lightGray)
  doc.rect(20, currentY, 170, 8, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text('DESCRIPTION', 22, currentY + 5.5)
  doc.text('QTY', 130, currentY + 5.5, { align: 'right' })
  doc.text('RATE', 155, currentY + 5.5, { align: 'right' })
  doc.text('AMOUNT', 188, currentY + 5.5, { align: 'right' })

  currentY += 8

  // Table rows with clean design
  doc.setFont('helvetica', 'normal')

  data.lineItems.forEach((item, index) => {
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }

    // Bottom border for each row
    doc.setDrawColor(...borderGray)
    doc.setLineWidth(0.3)
    doc.line(20, currentY + 7, 190, currentY + 7)

    // Item description
    doc.setFontSize(9)
    doc.setTextColor(...primaryColor)
    const descLines = doc.splitTextToSize(item.description, 100)
    doc.text(descLines[0].substring(0, 60), 22, currentY + 5)

    // Category (smaller, below description)
    doc.setFontSize(7)
    doc.setTextColor(...textGray)
    doc.text(item.category, 22, currentY + 9)

    // Quantity
    doc.setFontSize(9)
    doc.setTextColor(...primaryColor)
    doc.text(item.quantity.toString(), 130, currentY + 5, { align: 'right' })

    // Rate
    doc.text(`$${item.unitPrice.toFixed(2)}`, 155, currentY + 5, { align: 'right' })

    // Amount (bold)
    doc.setFont('helvetica', 'bold')
    doc.text(`$${item.totalPrice.toFixed(2)}`, 188, currentY + 5, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    currentY += 11
  })
  
  // Summary section - professional totals on the right
  currentY += 10
  const summaryX = 130
  let summaryY = currentY

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)

  // Labor cost
  if (data.laborCost > 0) {
    doc.text('Labor Cost', summaryX, summaryY)
    doc.text(`$${data.laborCost.toFixed(2)}`, 188, summaryY, { align: 'right' })
    summaryY += 5
  }

  // Material cost
  if (data.materialCost > 0) {
    doc.text('Material Cost', summaryX, summaryY)
    doc.text(`$${data.materialCost.toFixed(2)}`, 188, summaryY, { align: 'right' })
    summaryY += 5
  }

  // Additional costs
  if (data.additionalCosts > 0) {
    doc.text('Additional Costs', summaryX, summaryY)
    doc.text(`$${data.additionalCosts.toFixed(2)}`, 188, summaryY, { align: 'right' })
    summaryY += 5
  }

  // Discount
  if (data.discountAmount && data.discountAmount > 0) {
    doc.setTextColor(220, 53, 69) // Red for discount
    doc.text('Discount', summaryX, summaryY)
    doc.text(`-$${data.discountAmount.toFixed(2)}`, 188, summaryY, { align: 'right' })
    summaryY += 5
    doc.setTextColor(...textGray)
  }

  // Subtotal
  summaryY += 2
  const subtotal = data.laborCost + data.materialCost + data.additionalCosts - (data.discountAmount || 0)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...primaryColor)
  doc.text('Subtotal', summaryX, summaryY)
  doc.text(`$${subtotal.toFixed(2)}`, 188, summaryY, { align: 'right' })
  summaryY += 5

  // Tax
  doc.text(`Tax (${data.taxRate}%)`, summaryX, summaryY)
  doc.text(`$${data.taxAmount.toFixed(2)}`, 188, summaryY, { align: 'right' })
  summaryY += 8

  // Total amount - highlighted box
  doc.setFillColor(...accentColor)
  doc.rect(130, summaryY - 4, 60, 10, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL DUE', 132, summaryY + 2)
  doc.setFontSize(12)
  doc.text(`$${data.totalAmount.toFixed(2)}`, 188, summaryY + 2, { align: 'right' })
  
  // Notes and terms section
  summaryY += 15

  if (data.notes) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('NOTES', 20, summaryY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textGray)
    const notesLines = doc.splitTextToSize(data.notes, 110)
    doc.text(notesLines.slice(0, 4), 20, summaryY + 5)
    summaryY += (notesLines.slice(0, 4).length * 4) + 10
  }

  if (data.terms) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryColor)
    doc.text('TERMS & CONDITIONS', 20, summaryY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textGray)
    const termsLines = doc.splitTextToSize(data.terms, 170)
    doc.text(termsLines.slice(0, 3), 20, summaryY + 5)
  }

  // Footer with contact info and thank you message
  const pageHeight = doc.internal.pageSize.height

  // Divider line before footer
  doc.setDrawColor(...borderGray)
  doc.setLineWidth(0.5)
  doc.line(20, pageHeight - 30, 190, pageHeight - 30)

  // Thank you message
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryColor)
  doc.text('Thank you for your business!', 105, pageHeight - 22, { align: 'center' })

  // Contact information
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...textGray)
  doc.text('For questions about this invoice, please contact:', 105, pageHeight - 16, { align: 'center' })
  doc.text('support@heyspruceapp.com', 105, pageHeight - 11, { align: 'center' })

  // Generated date (small, bottom right)
  doc.setFontSize(7)
  doc.text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 190, pageHeight - 6, { align: 'right' })
  
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

export async function generateWorkOrderPDF(data: PDFWorkOrderData): Promise<Buffer> {
  const doc = new jsPDF()

  // Load logo
  const logoBase64 = await loadImageAsBase64(LOGO_URL)
  
  // Set up colors
  const primaryColor = '#2c3e50'
  const secondaryColor = '#7f8c8d'
  const accentColor = '#3498db'
  
  // Header
  doc.setFillColor(primaryColor)
  doc.rect(0, 0, 210, 30, 'F')

  // Add logo if available
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 15, 8, 30, 15)
    } catch (err) {
      console.error('Error adding logo to PDF:', err)
    }
  }

  // Company name
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Spruce App', 50, 20)

  // Tagline
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Professional Cleaning & Maintenance Services', 50, 25)

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
