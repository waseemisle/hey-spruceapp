import { Resend } from 'resend'
import { generateInvoicePDF, generateQuotePDF, generateWorkOrderPDF, PDFInvoiceData, PDFWorkOrderData } from './pdf-service'

const resend = new Resend(process.env.RESEND_API_KEY || 're_NsYCRoCF_PvF853LSU2NzZbWz1irsk9Bm')

export interface InvoiceEmailData {
  invoiceId: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  totalAmount: number
  dueDate: string
  invoiceUrl?: string
}

export interface QuoteEmailData {
  quoteId: string
  clientName: string
  clientEmail: string
  workOrderTitle: string
  totalAmount: number
  validUntil: string
  quoteUrl?: string
}

export async function sendInvoiceEmail(data: InvoiceEmailData & { invoiceData?: any }) {
  try {
    // Generate PDF
    let pdfBuffer: Buffer | null = null
    if (data.invoiceData) {
      try {
        pdfBuffer = generateInvoicePDF(data.invoiceData)
        console.log('PDF generated successfully')
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError)
        // Continue without PDF if generation fails
      }
    }

    const emailPayload: any = {
      from: 'Spruce App <noreply@shurehw.com>',
      to: [data.clientEmail],
      subject: `Invoice #${data.invoiceId} - ${data.workOrderTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Spruce App</h1>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Professional Property Management</p>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2c3e50; margin-top: 0;">Invoice #${data.invoiceId}</h2>
            
            <p>Dear ${data.clientName},</p>
            
            <p>Thank you for your business! Please find attached your invoice for the following work:</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #2c3e50;">Work Order Details</h3>
              <p><strong>Project:</strong> ${data.workOrderTitle}</p>
              <p><strong>Total Amount:</strong> $${data.totalAmount.toLocaleString()}</p>
              <p><strong>Due Date:</strong> ${new Date(data.dueDate).toLocaleDateString()}</p>
            </div>
            
            <p>Payment is due within 30 days of the invoice date. You can pay via:</p>
            <ul>
              <li>Bank Transfer</li>
              <li>Check (mail to our office)</li>
              <li>Online Payment Portal (coming soon)</li>
            </ul>
            
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
        </div>
      `
    }

    // Add PDF attachment if available
    if (pdfBuffer) {
      emailPayload.attachments = [
        {
          filename: `Invoice_${data.invoiceId}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf'
        }
      ]
    }

    const { data: emailData, error } = await resend.emails.send(emailPayload)

    if (error) {
      console.error('Error sending invoice email:', error)
      return { success: false, error: error.message }
    }

    console.log('Invoice email sent successfully:', emailData)
    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending invoice email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function sendQuoteEmail(data: QuoteEmailData & { quoteData?: any }) {
  try {
    // Generate PDF
    let pdfBuffer: Buffer | null = null
    if (data.quoteData) {
      try {
        pdfBuffer = generateQuotePDF(data.quoteData)
        console.log('Quote PDF generated successfully')
      } catch (pdfError) {
        console.error('Error generating quote PDF:', pdfError)
        // Continue without PDF if generation fails
      }
    }

    const emailPayload: any = {
      from: 'Spruce App <noreply@shurehw.com>',
      to: [data.clientEmail],
      subject: `Quote #${data.quoteId} - ${data.workOrderTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #2c3e50; margin: 0;">Spruce App</h1>
            <p style="color: #7f8c8d; margin: 5px 0 0 0;">Professional Property Management</p>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2c3e50; margin-top: 0;">Quote #${data.quoteId}</h2>
            
            <p>Dear ${data.clientName},</p>
            
            <p>Thank you for your interest in our services! Please find your quote for the following work:</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #2c3e50;">Project Details</h3>
              <p><strong>Project:</strong> ${data.workOrderTitle}</p>
              <p><strong>Total Amount:</strong> $${data.totalAmount.toLocaleString()}</p>
              <p><strong>Valid Until:</strong> ${new Date(data.validUntil).toLocaleDateString()}</p>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #2c3e50; font-weight: bold;">
                Please review this quote and let us know if you'd like to proceed with the work.
              </p>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #2c3e50; font-weight: bold;">
                📎 Please find the detailed quote PDF attached to this email.
              </p>
            </div>
            
            <p>To approve or reject this quote, please reply to this email or contact us directly.</p>
            
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
        </div>
      `
    }

    // Add PDF attachment if available
    if (pdfBuffer) {
      emailPayload.attachments = [
        {
          filename: `Quote_${data.quoteId}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf'
        }
      ]
    }

    const { data: emailData, error } = await resend.emails.send(emailPayload)

    if (error) {
      console.error('Error sending quote email:', error)
      return { success: false, error: error.message }
    }

    console.log('Quote email sent successfully:', emailData)
    return { success: true, data: emailData }
  } catch (error) {
    console.error('Error sending quote email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
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

    const emailPayload: any = {
      from: 'Spruce App <noreply@shurehw.com>',
      to: [data.clientEmail],
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
      `
    }

    // Add PDF attachment if available
    if (pdfBuffer) {
      emailPayload.attachments = [
        {
          filename: `WorkOrder_${data.workOrderId}.pdf`,
          content: pdfBuffer.toString('base64'),
          type: 'application/pdf'
        }
      ]
    }

    console.log('Sending email via Resend...')
    console.log('Email payload:', {
      from: emailPayload.from,
      to: emailPayload.to,
      subject: emailPayload.subject,
      hasAttachments: !!emailPayload.attachments,
      attachmentCount: emailPayload.attachments?.length || 0
    })
    
    const { data: emailData, error } = await resend.emails.send(emailPayload)

    console.log('Resend response:', { data: emailData, error })

    if (error) {
      console.error('Error sending work order email:', error)
      return { success: false, error: error.message }
    }

    console.log('Work order email sent successfully:', emailData)
    console.log('=== SEND WORK ORDER EMAIL SUCCESS ===')
    return { success: true, data: emailData }
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
