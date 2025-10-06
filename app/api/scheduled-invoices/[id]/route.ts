// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id
    const data = await request.json()

    const {
      clientId,
      clientName,
      clientEmail,
      title,
      description,
      amount,
      categoryId,
      categoryName,
      frequency,
      dayOfWeek,
      dayOfMonth,
      time,
      timezone,
      notes
    } = data

    // Calculate next execution time
    const nextExecution = calculateNextExecution(frequency, dayOfWeek, dayOfMonth, time, timezone)

    const updateData = {
      clientId,
      clientName,
      clientEmail,
      title,
      description,
      amount,
      categoryId,
      categoryName,
      frequency,
      dayOfWeek: dayOfWeek || null,
      dayOfMonth: dayOfMonth || null,
      time,
      timezone,
      nextExecution: nextExecution.toISOString(),
      updatedAt: new Date().toISOString(),
      notes
    }

    await db.collection(COLLECTIONS.SCHEDULED_INVOICES).doc(scheduledInvoiceId).update(updateData)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Scheduled invoice updated successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error updating scheduled invoice:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update scheduled invoice' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledInvoiceId = params.id

    const scheduledInvoiceRef = db.collection(COLLECTIONS.SCHEDULED_INVOICES).doc(scheduledInvoiceId)
    await scheduledInvoiceRef.delete()

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Scheduled invoice deleted successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error deleting scheduled invoice:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to delete scheduled invoice' }),
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
