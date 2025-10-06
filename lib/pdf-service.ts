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

  // Set up modern color scheme - Green theme to match Spruce branding
  const primaryGreen = [76, 175, 80] // #4CAF50 - Fresh green
  const darkGreen = [56, 142, 60] // #388E3C - Dark green
  const lightGreen = [232, 245, 233] // #E8F5E9 - Light green background
  const textDark = [33, 33, 33] // #212121 - Almost black
  const textGray = [117, 117, 117] // #757575 - Medium gray
  const accentOrange = [255, 152, 0] // #FF9800 - Accent color

  // Clean white background with subtle green accent bar
  doc.setFillColor(...lightGreen)
  doc.rect(0, 0, 210, 40, 'F')

  // Green accent stripe at top
  doc.setFillColor(...primaryGreen)
  doc.rect(0, 0, 210, 3, 'F')

  // Add logo if available
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 15, 10, 50, 20)
    } catch (err) {
      console.error('Error adding logo to PDF:', err)
    }
  }

  // Invoice title and number on right side with modern styling
  doc.setTextColor(...textDark)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('INVOICE', 210, 18, { align: 'right' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)
  doc.text(`#${data.invoiceNumber}`, 210, 26, { align: 'right' })

  // Date and due date with icons-like labels
  doc.setFontSize(9)
  doc.setTextColor(...textGray)
  doc.text(`Issue Date: ${new Date(data.createdAt).toLocaleDateString()}`, 210, 33, { align: 'right' })
  doc.text(`Due Date: ${new Date(data.dueDate).toLocaleDateString()}`, 210, 38, { align: 'right' })
  
  // Client information box with modern card design
  let currentY = 50
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...primaryGreen)
  doc.setLineWidth(0.5)
  doc.roundedRect(15, currentY, 85, 30, 2, 2, 'FD')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryGreen)
  doc.text('BILL TO', 20, currentY + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...textDark)
  doc.text(data.clientName, 20, currentY + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...textGray)
  doc.text(data.clientEmail, 20, currentY + 19)

  // Project Details box
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...primaryGreen)
  doc.roundedRect(110, currentY, 85, 30, 2, 2, 'FD')

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryGreen)
  doc.text('PROJECT DETAILS', 115, currentY + 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...textDark)
  doc.text(data.workOrderTitle.substring(0, 30), 115, currentY + 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...textGray)
  const descLines = doc.splitTextToSize(data.workOrderDescription, 70)
  doc.text(descLines.slice(0, 2), 115, currentY + 19)

  // Line items table with modern design
  const startY = 100
  const tableWidth = 180

  // Table header with gradient-like effect
  doc.setFillColor(...primaryGreen)
  doc.roundedRect(15, startY, tableWidth, 10, 1, 1, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('DESCRIPTION', 20, startY + 6.5)
  doc.text('QTY', 115, startY + 6.5)
  doc.text('RATE', 135, startY + 6.5)
  doc.text('AMOUNT', 160, startY + 6.5)
  doc.text('CATEGORY', 175, startY + 6.5, { align: 'right' })

  // Table rows with clean design
  currentY = startY + 10
  doc.setFont('helvetica', 'normal')

  data.lineItems.forEach((item, index) => {
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }

    // Subtle alternating row background
    if (index % 2 === 0) {
      doc.setFillColor(...lightGreen)
      doc.rect(15, currentY, tableWidth, 9, 'F')
    }

    // Row border
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.1)
    doc.line(15, currentY + 9, 195, currentY + 9)

    doc.setFontSize(9)
    doc.setTextColor(...textDark)
    doc.text(item.description.substring(0, 45), 20, currentY + 6)

    doc.setTextColor(...textGray)
    doc.text(item.quantity.toString(), 115, currentY + 6)
    doc.text(`$${item.unitPrice.toFixed(2)}`, 135, currentY + 6)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...textDark)
    doc.text(`$${item.totalPrice.toFixed(2)}`, 160, currentY + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...primaryGreen)
    doc.text(item.category.toUpperCase(), 175, currentY + 6, { align: 'right' })

    currentY += 9
  })
  
  // Summary section with modern card design
  const summaryY = Math.max(currentY + 15, 200)
  const summaryX = 120

  // Summary box background
  doc.setFillColor(250, 250, 250)
  doc.setDrawColor(230, 230, 230)
  doc.setLineWidth(0.3)
  doc.roundedRect(summaryX - 5, summaryY - 5, 75, 50, 2, 2, 'FD')

  let lineY = summaryY

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)

  // Labor cost
  if (data.laborCost > 0) {
    doc.text('Labor Cost:', summaryX, lineY)
    doc.text(`$${data.laborCost.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
    lineY += 5
  }

  // Material cost
  if (data.materialCost > 0) {
    doc.text('Material Cost:', summaryX, lineY)
    doc.text(`$${data.materialCost.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
    lineY += 5
  }

  // Additional costs
  if (data.additionalCosts > 0) {
    doc.text('Additional Costs:', summaryX, lineY)
    doc.text(`$${data.additionalCosts.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
    lineY += 5
  }

  // Discount
  if (data.discountAmount && data.discountAmount > 0) {
    doc.setTextColor(220, 53, 69) // Red for discount
    doc.text('Discount:', summaryX, lineY)
    doc.text(`-$${data.discountAmount.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
    lineY += 5
    doc.setTextColor(...textGray)
  }

  // Divider line
  doc.setDrawColor(...primaryGreen)
  doc.setLineWidth(0.5)
  doc.line(summaryX, lineY + 1, summaryX + 65, lineY + 1)
  lineY += 6

  // Subtotal
  const subtotal = data.laborCost + data.materialCost + data.additionalCosts - (data.discountAmount || 0)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...textDark)
  doc.text('Subtotal:', summaryX, lineY)
  doc.text(`$${subtotal.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
  lineY += 5

  // Tax
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...textGray)
  doc.text(`Tax (${data.taxRate}%):`, summaryX, lineY)
  doc.text(`$${data.taxAmount.toFixed(2)}`, summaryX + 65, lineY, { align: 'right' })
  lineY += 7

  // Total amount box - standout design
  doc.setFillColor(...primaryGreen)
  doc.roundedRect(summaryX - 5, lineY - 3, 75, 12, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL DUE:', summaryX, lineY + 4)
  doc.setFontSize(13)
  doc.text(`$${data.totalAmount.toFixed(2)}`, summaryX + 65, lineY + 4, { align: 'right' })
  
  // Notes and terms section with modern styling
  const notesStartY = lineY + 15

  if (data.notes) {
    doc.setFillColor(...lightGreen)
    doc.roundedRect(15, notesStartY, 90, 25, 2, 2, 'F')

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryGreen)
    doc.text('NOTES', 20, notesStartY + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textDark)
    const notesLines = doc.splitTextToSize(data.notes, 80)
    doc.text(notesLines.slice(0, 3), 20, notesStartY + 12)
  }

  if (data.terms) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...primaryGreen)
    doc.text('TERMS & CONDITIONS', 20, notesStartY + 40)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...textGray)
    const termsLines = doc.splitTextToSize(data.terms, 170)
    doc.text(termsLines.slice(0, 2), 20, notesStartY + 46)
  }

  // Modern footer with green accent
  const pageHeight = doc.internal.pageSize.height

  // Footer background
  doc.setFillColor(...lightGreen)
  doc.rect(0, pageHeight - 25, 210, 25, 'F')

  // Green accent line
  doc.setFillColor(...primaryGreen)
  doc.rect(0, pageHeight - 25, 210, 2, 'F')

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...primaryGreen)
  doc.text('Thank you for your business!', 105, pageHeight - 16, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...textGray)
  doc.text('For questions, contact us at support@heyspruceapp.com', 105, pageHeight - 10, { align: 'center' })
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, 105, pageHeight - 5, { align: 'center' })
  
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
