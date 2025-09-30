// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { collection, addDoc, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore'
import { Invoice, InvoiceFormData, Quote } from '@/lib/types'
import { sendInvoiceEmail } from '@/lib/sendgrid-service'

// Create a new invoice from an approved quote
export async function POST(request: Request) {
  let data: any = null
  
  try {
    console.log('=== INVOICE CREATE API START ===')
    
    data = await request.json()
    console.log('Received invoice data:', data)
    
    const { 
      quoteId,
      workOrderId,
      dueDate,
      notes,
      terms,
      paymentTerms,
      sendEmail = true,
      adminId,
      adminName,
      adminEmail
    } = data

    // Validate required fields
    if (!quoteId || !workOrderId || !adminId) {
      console.error('Missing required fields:', { quoteId, workOrderId, adminId })
      return new Response(
        JSON.stringify({ error: 'Quote ID, Work Order ID and Admin ID are required' },
        { status: 400 }
      ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get quote details
    console.log('Fetching quote:', quoteId)
    const quoteRef = doc(db, 'quotes', quoteId)
    const quoteDoc = await getDoc(quoteRef)
    
    if (!quoteDoc.exists()) {
      console.error('Quote not found:', quoteId)
      return new Response(
        JSON.stringify({ error: 'Quote not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const quote = quoteDoc.data() as Quote
    console.log('Quote data:', quote)

    // Validate quote status
    if (quote.status !== 'accepted') {
      console.error('Quote not accepted:', quote.status)
      return new Response(
        JSON.stringify({ error: 'Only accepted quotes can be converted to invoices' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work order details
    console.log('Fetching work order:', workOrderId)
    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderDoc = await getDoc(workOrderRef)
    
    if (!workOrderDoc.exists()) {
      console.error('Work order not found:', workOrderId)
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrder = workOrderDoc.data()
    console.log('Work order data:', workOrder)

    // Create invoice data
    const invoiceData: any = {
      quoteId,
      workOrderId,
      workOrderTitle: quote.workOrderTitle,
      workOrderDescription: quote.workOrderDescription,
      workOrderLocation: quote.workOrderLocation,
      clientId: quote.clientId,
      clientName: quote.clientName,
      clientEmail: quote.clientEmail,
      status: 'draft',
      totalAmount: quote.totalAmount,
      laborCost: quote.laborCost,
      materialCost: quote.materialCost,
      additionalCosts: quote.additionalCosts,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      dueDate,
      lineItems: quote.lineItems,
      createdBy: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Only add optional fields if they have values
    if (workOrder.assignedTo) {
      invoiceData.subcontractorId = workOrder.assignedTo
    }
    if (workOrder.assignedToName) {
      invoiceData.subcontractorName = workOrder.assignedToName
    }
    if (workOrder.assignedToEmail) {
      invoiceData.subcontractorEmail = workOrder.assignedToEmail
    }
    if (quote.discountAmount && quote.discountAmount > 0) {
      invoiceData.discountAmount = quote.discountAmount
    }
    if (notes && notes.trim()) {
      invoiceData.notes = notes.trim()
    }
    if (terms && terms.trim()) {
      invoiceData.terms = terms.trim()
    }

    // Clean undefined values from the data
    const cleanInvoiceData = Object.fromEntries(
      Object.entries(invoiceData).filter(([_, value]) => value !== undefined)
    )

    console.log('Creating invoice with data:', cleanInvoiceData)

    // Save to Firestore
    const invoicesRef = collection(db, 'invoices')
    const docRef = await addDoc(invoicesRef, cleanInvoiceData)

    console.log('Invoice created successfully:', docRef.id)

    // Update workflow status
    await updateWorkflowStatus(workOrderId, 'invoice_created', adminId, `Invoice created from quote ${quoteId}`)

    // Send email to client (if requested)
    if (sendEmail) {
      try {
        console.log('Sending invoice email to client...')
        const emailResult = await sendInvoiceEmail({
        invoiceId: docRef.id,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        workOrderTitle: quote.workOrderTitle,
        totalAmount: quote.totalAmount,
        dueDate: dueDate,
        invoiceData: {
          invoiceId: docRef.id,
          invoiceNumber: docRef.id.substring(0, 8).toUpperCase(),
          clientName: quote.clientName,
          clientEmail: quote.clientEmail,
          workOrderTitle: quote.workOrderTitle,
          workOrderDescription: quote.workOrderDescription,
          workOrderLocation: quote.workOrderLocation,
          totalAmount: quote.totalAmount,
          laborCost: quote.laborCost,
          materialCost: quote.materialCost,
          additionalCosts: quote.additionalCosts,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          discountAmount: quote.discountAmount,
          lineItems: quote.lineItems,
          dueDate: dueDate,
          createdAt: new Date().toISOString(),
          notes: notes || quote.notes,
          terms: terms || quote.terms,
          subcontractorName: workOrder.assignedToName
        }
      })

      if (emailResult.success) {
        console.log('Invoice email sent successfully')
        } else {
          console.error('Failed to send invoice email:', emailResult.error)
        }
      } catch (emailError) {
        console.error('Error sending invoice email:', emailError)
      }
    } else {
      console.log('Email sending skipped as requested')
    }

    console.log('=== INVOICE CREATE API SUCCESS ===')

    return new Response(
        JSON.stringify({
      success: true,
      invoiceId: docRef.id,
      message: sendEmail ? 'Invoice created and email sent successfully' : 'Invoice created successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== INVOICE CREATE API ERROR ===')
    console.error('Error creating invoice:', error)
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('Data:', data)
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to create invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// Get all invoices
export async function GET(request: Request) {
  try {
    console.log('=== INVOICES GET API START ===')
    
    const { searchParams } = new URL(request.url)
    const workOrderId = searchParams.get('workOrderId')
    const quoteId = searchParams.get('quoteId')

    console.log('Fetching invoices, workOrderId:', workOrderId, 'quoteId:', quoteId)

    const invoicesRef = collection(db, 'invoices')
    let q

    if (workOrderId) {
      console.log('Filtering invoices by workOrderId:', workOrderId)
      q = query(invoicesRef, where('workOrderId', '==', workOrderId), orderBy('createdAt', 'desc'))
    } else if (quoteId) {
      console.log('Filtering invoices by quoteId:', quoteId)
      q = query(invoicesRef, where('quoteId', '==', quoteId), orderBy('createdAt', 'desc'))
    } else {
      console.log('Getting all invoices')
      q = query(invoicesRef, orderBy('createdAt', 'desc'))
    }

    console.log('Query created successfully, executing...')
    const snapshot = await getDocs(q)
    console.log('Query executed successfully, found', snapshot.docs.length, 'invoices')

    const invoices = snapshot.docs.map(doc => {
      try {
        const data = doc.data()
        console.log('Processing invoice:', { id: doc.id, workOrderId: data.workOrderId, status: data.status })
        return {
          id: doc.id,
          ...data
        }
      } catch (docError) {
        console.error('Error processing invoice document:', doc.id, docError)
        return {
          id: doc.id,
          error: 'Failed to process document'
        }
      }
    })

    console.log('Processed invoices:', invoices.length)
    console.log('=== INVOICES GET API SUCCESS ===')

    return new Response(
        JSON.stringify({
      success: true,
      invoices
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== INVOICES GET API ERROR ===')
    console.error('Error fetching invoices:', error)
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to fetch invoices',
        details: error instanceof Error ? error.message : 'Unknown error',
        invoices: []
      },
      { status: 500 }
    ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// Helper function to update workflow status
async function updateWorkflowStatus(workOrderId: string, step: string, updatedBy: string, notes?: string) {
  try {
    const workflowRef = collection(db, 'workflow_status')
    const workflowData = {
      workOrderId,
      currentStep: step,
      status: step.includes('completed') ? 'completed' : 'in_progress',
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: updatedBy,
      notes
    }
    
    await addDoc(workflowRef, workflowData)
    console.log('Workflow status updated:', workflowData)
  } catch (error) {
    console.error('Error updating workflow status:', error)
  }
}
