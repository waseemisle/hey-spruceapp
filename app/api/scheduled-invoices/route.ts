// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { addDoc, collection } from 'firebase/firestore'
import { ScheduledInvoice } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const { data, error } = await getDocuments(COLLECTIONS.SCHEDULED_INVOICES)
    
    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch scheduled invoices' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify(data),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching scheduled invoices:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch scheduled invoices' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const {
      clientId,
      clientName,
      clientEmail,
      title,
      description,
      amount,
      frequency,
      dayOfWeek,
      dayOfMonth,
      time,
      timezone,
      notes,
      createdBy
    } = data

    // Calculate next execution time
    const nextExecution = calculateNextExecution(frequency, dayOfWeek, dayOfMonth, time, timezone)

    const scheduledInvoiceData: Omit<ScheduledInvoice, 'id'> = {
      clientId,
      clientName,
      clientEmail,
      title,
      description,
      amount,
      frequency,
      dayOfWeek: dayOfWeek || null,
      dayOfMonth: dayOfMonth || null,
      time,
      timezone,
      isActive: true,
      nextExecution: nextExecution.toISOString(),
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes
    }

    const docRef = await addDoc(collection(db, COLLECTIONS.SCHEDULED_INVOICES), scheduledInvoiceData)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Scheduled invoice created successfully',
      scheduledInvoiceId: docRef.id
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error creating scheduled invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to create scheduled invoice' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

function calculateNextExecution(frequency: string, dayOfWeek: number | null, dayOfMonth: number | null, time: string, timezone: string): Date {
  const now = new Date()
  const [hours, minutes] = time.split(':').map(Number)
  
  // Create a date for today with the specified time
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes)
  
  // If the time has passed today, start from tomorrow
  if (today <= now) {
    today.setDate(today.getDate() + 1)
  }

  switch (frequency) {
    case 'weekly':
      if (dayOfWeek !== null) {
        const daysUntilTarget = (dayOfWeek - today.getDay() + 7) % 7
        today.setDate(today.getDate() + daysUntilTarget)
      }
      break
      
    case 'monthly':
      if (dayOfMonth !== null) {
        today.setDate(dayOfMonth)
        // If the day has passed this month, go to next month
        if (today <= now) {
          today.setMonth(today.getMonth() + 1)
          today.setDate(dayOfMonth)
        }
      }
      break
      
    case 'quarterly':
      if (dayOfMonth !== null) {
        today.setDate(dayOfMonth)
        // If the day has passed this quarter, go to next quarter
        if (today <= now) {
          today.setMonth(today.getMonth() + 3)
          today.setDate(dayOfMonth)
        }
      }
      break
      
    case 'yearly':
      if (dayOfMonth !== null) {
        today.setDate(dayOfMonth)
        // If the day has passed this year, go to next year
        if (today <= now) {
          today.setFullYear(today.getFullYear() + 1)
          today.setDate(dayOfMonth)
        }
      }
      break
  }

  return today
}
