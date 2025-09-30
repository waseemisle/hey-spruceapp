// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { collection, addDoc, query, orderBy, getDocs, doc, updateDoc, deleteDoc, where } from 'firebase/firestore'
import { ScheduledInvoice, ScheduledInvoiceFormData } from '@/lib/types'

// Create a new scheduled invoice
export async function POST(request: Request) {
  try {
    console.log('=== SCHEDULED INVOICE CREATE API START ===')
    
    const data = await request.json()
    console.log('Received scheduled invoice data:', data)
    
    const { 
      clientId,
      title,
      description,
      amount,
      frequency,
      dayOfWeek,
      dayOfMonth,
      time,
      timezone,
      notes,
      adminId,
      adminName,
      adminEmail
    } = data as ScheduledInvoiceFormData & { adminId: string; adminName: string; adminEmail: string }

    // Validate required fields
    if (!clientId || !title || !amount || !frequency || !time || !timezone || !adminId) {
      console.error('Missing required fields:', { clientId, title, amount, frequency, time, timezone, adminId })
      return new Response(
        JSON.stringify({ error: 'Client ID, title, amount, frequency, time, timezone, and admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate frequency
    const validFrequencies = ['weekly', 'monthly', 'quarterly', 'yearly']
    if (!validFrequencies.includes(frequency)) {
      console.error('Invalid frequency:', frequency)
      return new Response(
        JSON.stringify({ error: 'Invalid frequency. Must be one of: weekly, monthly, quarterly, yearly' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate amount
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error('Invalid amount:', amount)
      return new Response(
        JSON.stringify({ error: 'Amount must be a valid positive number' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get client details from client_registrations collection
    console.log('Looking for client with ID:', clientId)
    const clientQuery = query(
      collection(db, 'client_registrations'),
      where('userId', '==', clientId),
      where('status', '==', 'approved')
    )
    const clientSnapshot = await getDocs(clientQuery)
    
    console.log('Client query results:', clientSnapshot.docs.length, 'documents found')
    
    if (clientSnapshot.empty) {
      console.error('Client not found:', clientId)
      console.error('Available clients in database:')
      
      // Debug: Get all clients to see what's available
      const allClientsQuery = query(collection(db, 'client_registrations'))
      const allClientsSnapshot = await getDocs(allClientsQuery)
      allClientsSnapshot.docs.forEach(doc => {
        const data = doc.data()
        if (data) {
          console.error('  - ID:', data.userId, 'Email:', data.email, 'Status:', data.status)
        }
      })
      
      return new Response(
        JSON.stringify({ error: 'Client not found or not approved' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const clientData = clientSnapshot.docs[0].data()
    console.log('Client data found:', clientData)

    if (!clientData) {
      return new Response(
        JSON.stringify({ error: 'Client data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Calculate next execution time
    let nextExecution
    try {
      nextExecution = calculateNextExecution(frequency, dayOfWeek, dayOfMonth, time, timezone)
      console.log('Next execution calculated:', nextExecution)
    } catch (dateError) {
      console.error('Error calculating next execution:', dateError)
      return new Response(
        JSON.stringify({ error: 'Invalid date/time configuration' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create scheduled invoice data
    const scheduledInvoiceData: Omit<ScheduledInvoice, 'id'> = {
      clientId,
      clientName: clientData.contactPerson || 'Unknown Client',
      clientEmail: clientData.email || '',
      title,
      description: description || '',
      amount: parseFloat(amount),
      frequency,
      dayOfWeek: frequency === 'weekly' ? parseInt(dayOfWeek || '1') : null,
      dayOfMonth: (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') ? parseInt(dayOfMonth || '1') : null,
      time,
      timezone,
      isActive: true,
      nextExecution,
      createdBy: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes || ''
    }

    console.log('Creating scheduled invoice with data:', scheduledInvoiceData)

    // Save to Firestore
    let docRef
    try {
      const scheduledInvoicesRef = collection(db, 'scheduled_invoices')
      docRef = await addDoc(scheduledInvoicesRef, scheduledInvoiceData)
      console.log('Scheduled invoice created successfully:', docRef.id)
    } catch (firestoreError) {
      console.error('Error saving to Firestore:', firestoreError)
      return new Response(
        JSON.stringify({ error: 'Failed to save scheduled invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify({
      success: true,
      scheduledInvoiceId: docRef.id,
      message: 'Scheduled invoice created successfully',
      nextExecution
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== SCHEDULED INVOICE CREATE API ERROR ===')
    console.error('Error creating scheduled invoice:', error)
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('Request data not available in error context')
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to create scheduled invoice',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Get all scheduled invoices
export async function GET(request: Request) {
  try {
    console.log('=== SCHEDULED INVOICES GET API START ===')
    
    const scheduledInvoicesRef = collection(db, 'scheduled_invoices')
    const q = query(scheduledInvoicesRef, orderBy('createdAt', 'desc'))
    
    const snapshot = await getDocs(q)
    console.log('Query executed successfully, found', snapshot.docs.length, 'scheduled invoices')

    const scheduledInvoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ScheduledInvoice[]

    console.log('Processed scheduled invoices:', scheduledInvoices.length)
    console.log('=== SCHEDULED INVOICES GET API SUCCESS ===')

    return new Response(
        JSON.stringify({
      success: true,
      scheduledInvoices
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== SCHEDULED INVOICES GET API ERROR ===')
    console.error('Error fetching scheduled invoices:', error)
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to fetch scheduled invoices',
        details: error instanceof Error ? error.message : 'Unknown error',
        scheduledInvoices: []
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
      const currentDay = now.getDay()
      const daysUntilTarget = (targetDay - currentDay + 7) % 7
      
      if (daysUntilTarget === 0) {
        // If it's the same day, check if time has passed
        nextExecution.setHours(hours, minutes, 0, 0)
        if (nextExecution <= now) {
          nextExecution.setDate(nextExecution.getDate() + 7)
        }
      } else {
        nextExecution.setDate(nextExecution.getDate() + daysUntilTarget)
        nextExecution.setHours(hours, minutes, 0, 0)
      }
      break
      
    case 'monthly':
      const targetDayOfMonth = parseInt(dayOfMonth || '1')
      nextExecution.setDate(targetDayOfMonth)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setMonth(nextExecution.getMonth() + 1)
      }
      break
      
    case 'quarterly':
      const targetDayQuarterly = parseInt(dayOfMonth || '1')
      nextExecution.setDate(targetDayQuarterly)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setMonth(nextExecution.getMonth() + 3)
      }
      break
      
    case 'yearly':
      const targetDayYearly = parseInt(dayOfMonth || '1')
      nextExecution.setMonth(0) // January
      nextExecution.setDate(targetDayYearly)
      nextExecution.setHours(hours, minutes, 0, 0)
      
      if (nextExecution <= now) {
        nextExecution.setFullYear(nextExecution.getFullYear() + 1)
      }
      break
  }
  
  return nextExecution.toISOString()
}
