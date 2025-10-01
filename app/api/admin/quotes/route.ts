// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { Quote, QuoteFormData } from '@/lib/types'
import { sendQuoteEmail } from '@/lib/sendgrid-service'

// Create a new quote
export async function POST(request: Request) {
  let data: any = null
  
  try {
    data = await request.json()
    console.log('Received quote data:', data)
    
    const { 
      workOrderId, 
      laborCost, 
      materialCost, 
      additionalCosts, 
      taxRate, 
      discountAmount, 
      validUntil, 
      lineItems, 
      notes, 
      terms,
      sendEmail = true,
      adminId,
      adminName,
      adminEmail
    } = data

    // Validate required fields
    if (!workOrderId || !adminId) {
      console.error('Missing required fields:', { workOrderId, adminId })
      return new Response(
        JSON.stringify({ error: 'Work order ID and admin ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work order details
    console.log('Fetching work order:', workOrderId)
    const workOrdersRef = db.collection('workorders')
    const workOrderQuery = workOrdersRef.where('__name__', '==', workOrderId)
    const workOrderSnapshot = await workOrderQuery.get()
    
    if (workOrderSnapshot.empty) {
      console.error('Work order not found:', workOrderId)
      return new Response(
        JSON.stringify({ error: 'Work order not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const workOrder = workOrderSnapshot.docs[0].data()
    console.log('Work order data:', workOrder)

    if (!workOrder) {
      return new Response(
        JSON.stringify({ error: 'Work order data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validate work order data structure
    if (!workOrder.title || !workOrder.description || !workOrder.location || !workOrder.clientId) {
      console.error('Invalid work order data:', workOrder)
      return new Response(
        JSON.stringify({ error: 'Invalid work order data structure' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Calculate totals
    const laborCostNum = parseFloat(laborCost) || 0
    const materialCostNum = parseFloat(materialCost) || 0
    const additionalCostsNum = parseFloat(additionalCosts) || 0
    const discountAmountNum = parseFloat(discountAmount || '0') || 0
    const taxRateNum = parseFloat(taxRate) || 0

    const lineItemsWithTotals = (lineItems || []).map((item: any) => ({
      ...item,
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      totalPrice: item.quantity * item.unitPrice
    }))

    const lineItemsTotal = lineItemsWithTotals.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    const subtotal = laborCostNum + materialCostNum + additionalCostsNum + lineItemsTotal - discountAmountNum
    const taxAmount = subtotal * (taxRateNum / 100)
    const totalAmount = subtotal + taxAmount

    // Create quote data
    const quoteData: any = {
      workOrderId,
      workOrderTitle: workOrder.title,
      workOrderDescription: workOrder.description,
      workOrderLocation: {
        id: workOrder.location.id,
        name: workOrder.location.name,
        address: workOrder.location.address
      },
      clientId: workOrder.clientId,
      clientName: workOrder.clientName,
      clientEmail: workOrder.clientEmail,
      status: 'draft',
      totalAmount,
      laborCost: laborCostNum,
      materialCost: materialCostNum,
      additionalCosts: additionalCostsNum,
      taxRate: taxRateNum,
      taxAmount,
      validUntil,
      lineItems: lineItemsWithTotals,
      createdBy: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Only add optional fields if they have values
    if (discountAmountNum > 0) {
      quoteData.discountAmount = discountAmountNum
    }
    if (notes && notes.trim()) {
      quoteData.notes = notes.trim()
    }
    if (terms && terms.trim()) {
      quoteData.terms = terms.trim()
    }

    // Clean undefined values from the data
    const cleanQuoteData = Object.fromEntries(
      Object.entries(quoteData).filter(([_, value]) => value !== undefined)
    )

    console.log('Creating quote with data:', cleanQuoteData)

    // Save to Firestore
    const quotesRef = db.collection('quotes')
    const docRef = await quotesRef.add(cleanQuoteData)

    console.log('Quote created successfully:', docRef.id)

    // Send email to client (if requested)
    if (sendEmail) {
      try {
        console.log('Sending quote email to client...')
        const emailResult = await sendQuoteEmail({
          quoteId: docRef.id,
          clientName: workOrder.clientName,
          clientEmail: workOrder.clientEmail,
          workOrderTitle: workOrder.title,
          totalAmount: totalAmount,
          validUntil: validUntil,
          quoteData: {
            ...quoteData,
            id: docRef.id
          }
        })

        if (emailResult.success) {
          console.log('Quote email sent successfully')
        } else {
          console.error('Failed to send quote email:', emailResult.error)
        }
      } catch (emailError) {
        console.error('Error sending quote email:', emailError)
      }
    } else {
      console.log('Email sending skipped as requested')
    }

    return new Response(
        JSON.stringify({
      success: true,
      quoteId: docRef.id,
      message: sendEmail ? 'Quote created and email sent successfully' : 'Quote created successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error creating quote:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      data: data
    })
    
    // Ensure we always return a valid JSON response
    return new Response(
        JSON.stringify({ 
        error: 'Failed to create quote',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// Get all quotes
export async function GET(request: Request) {
  let workOrderId: string | null = null
  
  try {
    console.log('=== QUOTES GET API START ===')
    
    const { searchParams } = new URL(request.url)
    workOrderId = searchParams.get('workOrderId')

    console.log('Fetching quotes, workOrderId:', workOrderId)

    // Test Firestore connection first
    console.log('Testing Firestore connection...')
    const quotesRef = db.collection('quotes')
    console.log('Collection reference created successfully')

    let q
    if (workOrderId) {
      console.log('Filtering quotes by workOrderId:', workOrderId)
      // Try without orderBy first to see if that's the issue
      q = quotesRef.where('workOrderId', '==', workOrderId)
    } else {
      console.log('Getting all quotes')
      // Try without orderBy first to see if that's the issue
      q = quotesRef
    }

    console.log('Query created successfully, executing...')
    const snapshot = await q.get()
    console.log('Query executed successfully, found', snapshot.docs.length, 'quotes')

    const quotes = snapshot.docs.map(doc => {
      try {
        const data = doc.data()
        if (!data) {
          console.warn('Quote data is undefined for doc:', doc.id)
          return null
        }
        console.log('Processing quote:', { id: doc.id, workOrderId: data.workOrderId, status: data.status })
        return {
          id: doc.id,
          ...data
        }
      } catch (docError) {
        console.error('Error processing document:', doc.id, docError)
        return {
          id: doc.id,
          error: 'Failed to process document'
        }
      }
    })

    console.log('Processed quotes:', quotes.length)
    console.log('=== QUOTES GET API SUCCESS ===')

    const validQuotes = quotes.filter(quote => quote !== null)
    return new Response(
        JSON.stringify({
      success: true,
      quotes: validQuotes
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('=== QUOTES GET API ERROR ===')
    console.error('Error fetching quotes:', error)
    console.error('Error type:', typeof error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    console.error('WorkOrderId:', workOrderId)
    console.error('=== END ERROR LOG ===')
    
    // Always return a valid JSON response
    return new Response(
        JSON.stringify({ 
        success: false,
        error: 'Failed to fetch quotes',
        details: error instanceof Error ? error.message : 'Unknown error',
        quotes: []
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
