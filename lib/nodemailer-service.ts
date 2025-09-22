import nodemailer from 'nodemailer'
import { generateInvoicePDF, generateQuotePDF, generateWorkOrderPDF, PDFInvoiceData, PDFWorkOrderData } from './pdf-service'

// Create transporter using Gmail SMTP with OAuth2
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    type: 'OAuth2',
    user: process.env.SMTP_USER || 'waseemisle@gmail.com',
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    accessToken: process.env.GOOGLE_ACCESS_TOKEN || ''
  },
  tls: {
    rejectUnauthorized: false
  }
})

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error)
  } else {
    console.log('SMTP server is ready to take our messages')
  }
})

export interface InvoiceEmailData {
  invoiceId: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  totalAmount: number
  dueDate: string
  invoiceData?: PDFInvoiceData
}

export interface QuoteEmailData {
  quoteId: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  totalAmount: number
  validUntil: string
  quoteData?: any
}

export interface WorkOrderEmailData {
  workOrderId: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  status: string
  priority: string
  category: string
  locationName: string
  estimatedCost?: number
  estimatedDuration?: number
  scheduledDate?: string
  workOrderData?: PDFWorkOrderData
}

export async function sendInvoiceEmail(data: InvoiceEmailData & { invoiceData?: PDFInvoiceData }) {
  try {
    console.log('=== SEND INVOICE EMAIL START ===')
    console.log('Email data received:', {
      invoiceId: data.invoiceId,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      workOrderTitle: data.workOrderTitle,
      totalAmount: data.totalAmount,
      hasInvoiceData: !!data.invoiceData
    })
    
    // Generate PDF
    let pdfBuffer: Buffer | null = null
    if (data.invoiceData) {
      try {
        console.log('Generating invoice PDF...')
        pdfBuffer = generateInvoicePDF(data.invoiceData)
        console.log('Invoice PDF generated successfully, size:', pdfBuffer.length, 'bytes')
      } catch (pdfError) {
        console.error('Error generating invoice PDF:', pdfError)
        // Continue without PDF if generation fails
      }
    } else {
      console.log('No invoice data provided for PDF generation')
    }

    const mailOptions = {
      from: 'Spruce App <waseemisle@gmail.com>',
      to: data.clientEmail,
      subject: `Invoice #${data.invoiceId} - ${data.workOrderTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Spruce App</h1>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Professional Property Management</p>
          </div>

          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0 0 10px 0;">Invoice Ready</h2>
            <p style="margin: 0; color: #27ae60; font-weight: bold;">
              Your invoice is ready for payment!
            </p>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #2c3e50; margin: 0 0 15px 0;">Invoice Details</h3>
            <div style="margin-bottom: 10px;">
              <strong>Invoice ID:</strong> ${data.invoiceId}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Work Order:</strong> ${data.workOrderTitle}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Total Amount:</strong> $${data.totalAmount.toFixed(2)}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Due Date:</strong> ${new Date(data.dueDate).toLocaleDateString()}
            </div>
          </div>

          <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #2c3e50; font-weight: bold;">
              📎 Please find the detailed invoice PDF attached to this email.
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 14px;">
              If you have any questions about this invoice, please don't hesitate to contact us.
            </p>
            <p style="color: #7f8c8d; font-size: 14px;">
              Best regards,<br>
              The Spruce App Team
            </p>
          </div>
        </div>
      `,
      attachments: pdfBuffer ? [
        {
          filename: `Invoice_${data.invoiceId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ] : []
    }

    console.log('Sending email via Nodemailer...')
    console.log('Email options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasAttachments: !!mailOptions.attachments.length,
      attachmentCount: mailOptions.attachments.length
    })
    
    const result = await transporter.sendMail(mailOptions)
    console.log('Invoice email sent successfully:', result.messageId)
    console.log('=== SEND INVOICE EMAIL SUCCESS ===')
    return { success: true, data: result }
  } catch (error: any) {
    console.error('=== SEND INVOICE EMAIL ERROR ===')
    console.error('Caught error sending invoice email:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    console.log('=== SEND INVOICE EMAIL ERROR END ===')
    return { success: false, error: error.message }
  }
}

export async function sendQuoteEmail(data: QuoteEmailData & { quoteData?: any }) {
  try {
    console.log('=== SEND QUOTE EMAIL START ===')
    console.log('Email data received:', {
      quoteId: data.quoteId,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      workOrderTitle: data.workOrderTitle,
      totalAmount: data.totalAmount,
      hasQuoteData: !!data.quoteData
    })
    
    // Generate PDF
    let pdfBuffer: Buffer | null = null
    if (data.quoteData) {
      try {
        console.log('Generating quote PDF...')
        pdfBuffer = generateQuotePDF(data.quoteData)
        console.log('Quote PDF generated successfully, size:', pdfBuffer.length, 'bytes')
      } catch (pdfError) {
        console.error('Error generating quote PDF:', pdfError)
        // Continue without PDF if generation fails
      }
    } else {
      console.log('No quote data provided for PDF generation')
    }

    const mailOptions = {
      from: 'Spruce App <waseemisle@gmail.com>',
      to: data.clientEmail,
      subject: `Quote #${data.quoteId} - ${data.workOrderTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Spruce App</h1>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Professional Property Management</p>
          </div>

          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0 0 10px 0;">Quote Ready</h2>
            <p style="margin: 0; color: #27ae60; font-weight: bold;">
              Your quote is ready for review!
            </p>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #2c3e50; margin: 0 0 15px 0;">Quote Details</h3>
            <div style="margin-bottom: 10px;">
              <strong>Quote ID:</strong> ${data.quoteId}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Work Order:</strong> ${data.workOrderTitle}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Total Amount:</strong> $${data.totalAmount.toFixed(2)}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Valid Until:</strong> ${new Date(data.validUntil).toLocaleDateString()}
            </div>
          </div>

          <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #2c3e50; font-weight: bold;">
              📎 Please find the detailed quote PDF attached to this email.
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 14px;">
              If you have any questions about this quote, please don't hesitate to contact us.
            </p>
            <p style="color: #7f8c8d; font-size: 14px;">
              Best regards,<br>
              The Spruce App Team
            </p>
          </div>
        </div>
      `,
      attachments: pdfBuffer ? [
        {
          filename: `Quote_${data.quoteId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ] : []
    }

    console.log('Sending email via Nodemailer...')
    console.log('Email options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasAttachments: !!mailOptions.attachments.length,
      attachmentCount: mailOptions.attachments.length
    })
    
    const result = await transporter.sendMail(mailOptions)
    console.log('Quote email sent successfully:', result.messageId)
    console.log('=== SEND QUOTE EMAIL SUCCESS ===')
    return { success: true, data: result }
  } catch (error: any) {
    console.error('=== SEND QUOTE EMAIL ERROR ===')
    console.error('Caught error sending quote email:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    console.log('=== SEND QUOTE EMAIL ERROR END ===')
    return { success: false, error: error.message }
  }
}

export async function sendWorkOrderEmail(data: WorkOrderEmailData & { workOrderData?: PDFWorkOrderData }) {
  try {
    console.log('=== SEND WORK ORDER EMAIL START ===')
    console.log('Email data received:', {
      workOrderId: data.workOrderId,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      workOrderTitle: data.workOrderTitle,
      status: data.status,
      hasWorkOrderData: !!data.workOrderData
    })
    
    // Generate PDF
    let pdfBuffer: Buffer | null = null
    if (data.workOrderData) {
      try {
        console.log('Generating work order PDF...')
        pdfBuffer = generateWorkOrderPDF(data.workOrderData)
        console.log('Work order PDF generated successfully, size:', pdfBuffer.length, 'bytes')
      } catch (pdfError) {
        console.error('Error generating work order PDF:', pdfError)
        // Continue without PDF if generation fails
      }
    } else {
      console.log('No work order data provided for PDF generation')
    }

    const mailOptions = {
      from: 'Spruce App <waseemisle@gmail.com>',
      to: data.clientEmail,
      subject: `Work Order #${data.workOrderId} - ${data.workOrderTitle} - ${data.status.toUpperCase()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Spruce App</h1>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Professional Property Management</p>
          </div>

          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0 0 10px 0;">Work Order ${data.status.toUpperCase()}</h2>
            <p style="margin: 0; color: #27ae60; font-weight: bold;">
              Your work order has been ${data.status.toLowerCase()}!
            </p>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #e1e8ed; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #2c3e50; margin: 0 0 15px 0;">Work Order Details</h3>
            <div style="margin-bottom: 10px;">
              <strong>Work Order ID:</strong> ${data.workOrderId}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Title:</strong> ${data.workOrderTitle}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Status:</strong> <span style="color: #27ae60; font-weight: bold;">${data.status.toUpperCase()}</span>
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Priority:</strong> ${data.priority.toUpperCase()}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Category:</strong> ${data.category.toUpperCase()}
            </div>
            <div style="margin-bottom: 10px;">
              <strong>Location:</strong> ${data.locationName}
            </div>
            ${data.estimatedCost ? `<div style="margin-bottom: 10px;"><strong>Estimated Cost:</strong> $${data.estimatedCost.toFixed(2)}</div>` : ''}
            ${data.estimatedDuration ? `<div style="margin-bottom: 10px;"><strong>Estimated Duration:</strong> ${data.estimatedDuration} hours</div>` : ''}
            ${data.scheduledDate ? `<div style="margin-bottom: 10px;"><strong>Scheduled Date:</strong> ${new Date(data.scheduledDate).toLocaleDateString()}</div>` : ''}
          </div>

          <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #2c3e50; font-weight: bold;">
              📎 Please find the detailed work order PDF attached to this email.
            </p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ecf0f1;">
            <p style="color: #7f8c8d; font-size: 14px;">
              If you have any questions about this work order, please don't hesitate to contact us.
            </p>
            <p style="color: #7f8c8d; font-size: 14px;">
              Best regards,<br>
              The Spruce App Team
            </p>
          </div>
        </div>
      `,
      attachments: pdfBuffer ? [
        {
          filename: `WorkOrder_${data.workOrderId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ] : []
    }

    console.log('Sending email via Nodemailer...')
    console.log('Email options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      hasAttachments: !!mailOptions.attachments.length,
      attachmentCount: mailOptions.attachments.length
    })
    
    const result = await transporter.sendMail(mailOptions)
    console.log('Work order email sent successfully:', result.messageId)
    console.log('=== SEND WORK ORDER EMAIL SUCCESS ===')
    return { success: true, data: result }
  } catch (error: any) {
    console.error('=== SEND WORK ORDER EMAIL ERROR ===')
    console.error('Caught error sending work order email:', error)
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    console.log('=== SEND WORK ORDER EMAIL ERROR END ===')
    return { success: false, error: error.message }
  }
}
