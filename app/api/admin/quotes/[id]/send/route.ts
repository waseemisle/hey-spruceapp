// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { sendQuoteEmail } from '@/lib/sendgrid-service'

// Send quote to client via email
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('=== SEND QUOTE API START ===')
    
    const quoteId = params.id
    const data = await request.json()
    const { adminId } = data

    console.log('Sending quote:', quoteId)

    // Validate required fields
    if (!adminId) {
      return new Response(
        JSON.stringify({ error: 'Admin ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get current quote
    const quoteRef = doc(db, 'quotes', quoteId)
    const quoteDoc = await getDoc(quoteRef)
    
    if (!quoteDoc.exists()) {
      return new Response(
        JSON.stringify({ error: 'Quote not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const quote = quoteDoc.data()
    console.log('Current quote:', quote)

    if (!quote) {
      return new Response(
        JSON.stringify({ error: 'Quote data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate quote status
    if (quote.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Only draft quotes can be sent' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update quote status to sent
    const updateData = {
      status: 'sent',
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await updateDoc(quoteRef, updateData)
    console.log('Quote status updated to sent')

    // Send email to client
    try {
      console.log('Sending quote email to client...')
      const emailResult = await sendQuoteEmail({
        quoteId: quoteId,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        workOrderTitle: quote.workOrderTitle,
        totalAmount: quote.totalAmount,
        validUntil: quote.validUntil,
        quoteData: quote
      })

      if (emailResult.success) {
        console.log('Quote email sent successfully')
      } else {
        console.error('Failed to send quote email:', emailResult.error)
        // Don't fail the entire operation if email fails
      }
    } catch (emailError) {
      console.error('Error sending quote email:', emailError)
      // Don't fail the entire operation if email fails
    }

    console.log('=== SEND QUOTE API SUCCESS ===')

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Quote sent to client successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== SEND QUOTE API ERROR ===')
    console.error('Error sending quote:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      quoteId: params.id
    })
    console.error('=== END ERROR LOG ===')
    
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to send quote',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
