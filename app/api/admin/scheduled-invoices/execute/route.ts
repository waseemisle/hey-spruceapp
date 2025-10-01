// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { sendInvoiceEmail } from '@/lib/sendgrid-service'

// Execute scheduled invoices that are due
export async function POST(request: Request) {
  try {
    console.log('=== EXECUTE SCHEDULED INVOICES START ===')
    
    const now = new Date()
    const nowISO = now.toISOString()
    
    console.log('Current time:', nowISO)
    
    // Get all active scheduled invoices (filter by nextExecution in JavaScript to avoid index requirement)
    const scheduledInvoicesRef = db.collection('scheduled_invoices')
    const q = 
      scheduledInvoicesRef
      .where('isActive', '==', true)
    
    const snapshot = await q.get()
    console.log('Found', snapshot.docs.length, 'active scheduled invoices')
    
    // Filter by nextExecution in JavaScript
    const dueInvoices = snapshot.docs.filter(doc => {
      const data = doc.data()
      return data && data.nextExecution && data.nextExecution <= nowISO
    })
    
    console.log('Found', dueInvoices.length, 'scheduled invoices due for execution')
    
    const results = []
    
    for (const docSnapshot of dueInvoices) {
      const scheduledInvoice = { id: docSnapshot.id, ...docSnapshot.data() } as any
      console.log('Processing scheduled invoice:', scheduledInvoice.id)
      
      try {
        // Create invoice data
        const invoiceData = {
          clientId: scheduledInvoice.clientId,
          clientName: scheduledInvoice.clientName,
          clientEmail: scheduledInvoice.clientEmail,
          title: scheduledInvoice.title,
          description: scheduledInvoice.description,
          totalAmount: scheduledInvoice.amount,
          laborCost: 0,
          materialCost: scheduledInvoice.amount,
          additionalCosts: 0,
          taxRate: 0,
          taxAmount: 0,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          lineItems: [{
            id: '1',
            description: scheduledInvoice.description || scheduledInvoice.title,
            quantity: 1,
            unitPrice: scheduledInvoice.amount,
            totalPrice: scheduledInvoice.amount,
            category: 'other'
          }],
          notes: scheduledInvoice.notes || '',
          terms: 'Payment due within 30 days of invoice date.',
          status: 'sent',
          sentAt: nowISO,
          createdBy: scheduledInvoice.createdBy,
          createdAt: nowISO,
          updatedAt: nowISO
        }
        
        // Create invoice in Firestore
        const invoicesRef = db.collection('invoices')
        const invoiceDocRef = await invoicesRef.add(invoiceData)
        
        console.log('Invoice created:', invoiceDocRef.id)
        
        // Send email to client
        try {
          const emailResult = await sendInvoiceEmail({
            invoiceId: invoiceDocRef.id,
            clientName: scheduledInvoice.clientName,
            clientEmail: scheduledInvoice.clientEmail,
            workOrderTitle: scheduledInvoice.title,
            totalAmount: scheduledInvoice.amount,
            dueDate: invoiceData.dueDate,
            invoiceData: {
              invoiceId: invoiceDocRef.id,
              invoiceNumber: invoiceDocRef.id.substring(0, 8).toUpperCase(),
              clientName: scheduledInvoice.clientName,
              clientEmail: scheduledInvoice.clientEmail,
              workOrderTitle: scheduledInvoice.title,
              workOrderDescription: scheduledInvoice.description,
              workOrderLocation: { name: 'Scheduled Service', address: 'N/A' },
              totalAmount: scheduledInvoice.amount,
              laborCost: 0,
              materialCost: scheduledInvoice.amount,
              additionalCosts: 0,
              taxRate: 0,
              taxAmount: 0,
              discountAmount: 0,
              lineItems: invoiceData.lineItems,
              dueDate: invoiceData.dueDate,
              createdAt: nowISO,
              notes: scheduledInvoice.notes,
              terms: invoiceData.terms,
              subcontractorName: 'Scheduled Service'
            }
          })
          
          console.log('Email sent for invoice:', invoiceDocRef.id, emailResult.success ? 'success' : 'failed')
        } catch (emailError) {
          console.error('Error sending email for invoice:', invoiceDocRef.id, emailError)
        }
        
        // Calculate next execution time
        const nextExecution = calculateNextExecution(
          scheduledInvoice.frequency,
          scheduledInvoice.dayOfWeek?.toString() || undefined,
          scheduledInvoice.dayOfMonth?.toString() || undefined,
          scheduledInvoice.time,
          scheduledInvoice.timezone
        )
        
        // Update scheduled invoice with last execution and next execution
        await db.collection('scheduled_invoices').doc(scheduledInvoice.id).update({
          lastExecuted: nowISO,
          nextExecution,
          updatedAt: nowISO
        })
        
        results.push({
          scheduledInvoiceId: scheduledInvoice.id,
          invoiceId: invoiceDocRef.id,
          success: true,
          nextExecution
        })
        
        console.log('Scheduled invoice updated:', scheduledInvoice.id, 'Next execution:', nextExecution)
        
      } catch (error) {
        console.error('Error processing scheduled invoice:', scheduledInvoice.id, error)
        results.push({
          scheduledInvoiceId: scheduledInvoice.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    console.log('=== EXECUTE SCHEDULED INVOICES COMPLETE ===')
    console.log('Processed', results.length, 'scheduled invoices')
    console.log('Results:', results)
    
    return new Response(
        JSON.stringify({
      success: true,
      message: `Processed ${results.length} scheduled invoices`,
      results
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    
  } catch (error) {
    console.error('=== EXECUTE SCHEDULED INVOICES ERROR ===')
    console.error('Error executing scheduled invoices:', error)
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to execute scheduled invoices',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Helper function to calculate next execution time
function calculateNextExecution(
  frequency: string, 
  dayOfWeek?: string, 
  dayOfMonth?: string, 
  time: string = '09:00', 
  timezone: string = 'America/New_York'
): string {
  const now = new Date()
  const [hours, minutes] = time.split(':').map(Number)
  
  let nextExecution = new Date(now)
  
  switch (frequency) {
    case 'weekly':
      const targetDay = parseInt(dayOfWeek || '1')
      nextExecution.setDate(nextExecution.getDate() + 7)
      nextExecution.setHours(hours, minutes, 0, 0)
      break
      
    case 'monthly':
      const targetDayOfMonth = parseInt(dayOfMonth || '1')
      nextExecution.setMonth(nextExecution.getMonth() + 1)
      nextExecution.setDate(targetDayOfMonth)
      nextExecution.setHours(hours, minutes, 0, 0)
      break
      
    case 'quarterly':
      const targetDayQuarterly = parseInt(dayOfMonth || '1')
      nextExecution.setMonth(nextExecution.getMonth() + 3)
      nextExecution.setDate(targetDayQuarterly)
      nextExecution.setHours(hours, minutes, 0, 0)
      break
      
    case 'yearly':
      const targetDayYearly = parseInt(dayOfMonth || '1')
      nextExecution.setFullYear(nextExecution.getFullYear() + 1)
      nextExecution.setMonth(0) // January
      nextExecution.setDate(targetDayYearly)
      nextExecution.setHours(hours, minutes, 0, 0)
      break
  }
  
  return nextExecution.toISOString()
}
