// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'

export async function GET(request: Request) {
  try {
    // Get all quotes using compat API
    const quotesSnapshot = await db.collection(COLLECTIONS.QUOTES).get()
    
    const quotes = quotesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return new Response(
        JSON.stringify(quotes),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching quotes:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch quotes' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    
    const {
      workOrderId,
      subcontractorId,
      laborCost,
      materialCost,
      additionalCosts,
      taxRate,
      discountAmount,
      validUntil,
      lineItems,
      notes,
      terms
    } = data

    // Validate required fields
    if (!workOrderId || !subcontractorId) {
      return new Response(
        JSON.stringify({ error: 'Work Order ID and Subcontractor ID are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Calculate totals
    const laborTotal = parseFloat(laborCost) || 0
    const materialTotal = parseFloat(materialCost) || 0
    const additionalTotal = parseFloat(additionalCosts) || 0
    const discount = parseFloat(discountAmount) || 0
    
    const subtotal = laborTotal + materialTotal + additionalTotal - discount
    const taxAmount = subtotal * (parseFloat(taxRate) / 100) || 0
    const totalAmount = subtotal + taxAmount

    // Get work order data using compat API - check both regular work orders and bidding work orders
    
    // First try regular work orders collection
    let workOrderDoc = await db.collection(COLLECTIONS.WORK_ORDERS).doc(workOrderId).get()
    let workOrderData = null
    let isBiddingWorkOrder = false
    
    if (workOrderDoc.exists) {
      workOrderData = workOrderDoc.data()
    } else {
      // Try bidding work orders collection
      workOrderDoc = await db.collection(COLLECTIONS.BIDDING_WORK_ORDERS).doc(workOrderId).get()
      
      if (workOrderDoc.exists) {
        workOrderData = workOrderDoc.data()
        isBiddingWorkOrder = true
      } else {
        return new Response(
          JSON.stringify({ error: 'Work Order not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
    
    if (!workOrderData) {
      return new Response(
        JSON.stringify({ error: 'Work Order data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Get subcontractor data using compat API
    const subcontractorDoc = await db.collection(COLLECTIONS.SUBCONTRACTORS).doc(subcontractorId).get()
    
    if (!subcontractorDoc.exists) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const subcontractorData = subcontractorDoc.data()

    // Handle different field names for bidding work orders vs regular work orders
    const quoteData = {
      workOrderId,
      workOrderTitle: workOrderData?.title || workOrderData?.workOrderTitle || 'Unknown',
      workOrderDescription: workOrderData?.description || workOrderData?.workOrderDescription || '',
      workOrderLocation: workOrderData?.location || workOrderData?.workOrderLocation || {},
      clientId: workOrderData?.clientId || '',
      clientName: workOrderData?.clientName || '',
      clientEmail: workOrderData?.clientEmail || '',
      subcontractorId,
      subcontractorName: subcontractorData?.fullName || '',
      subcontractorEmail: subcontractorData?.email || '',
      laborCost: laborTotal,
      materialCost: materialTotal,
      additionalCosts: additionalTotal,
      taxRate: parseFloat(taxRate) || 0,
      taxAmount,
      discountAmount: discount,
      totalAmount,
      originalAmount: totalAmount,
      clientAmount: totalAmount,
      markupPercentage: 0,
      validUntil,
      lineItems: lineItems || [],
      notes,
      terms,
      status: 'pending',
      isBiddingWorkOrder: isBiddingWorkOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const docRef = await db.collection(COLLECTIONS.QUOTES).add(quoteData)

    // Update work order status to "quote received"
    const workOrderCollection = isBiddingWorkOrder ? COLLECTIONS.BIDDING_WORK_ORDERS : COLLECTIONS.WORK_ORDERS
    await db.collection(workOrderCollection).doc(workOrderId).update({
      status: 'quote_received',
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Quote created successfully',
      quoteId: docRef.id
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error creating quote:', error)
    return new Response(
        JSON.stringify({ 
          error: 'Failed to create quote',
          details: error.message 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}