import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore'
import { Quote, QuoteFormData } from '@/lib/types'

// Create a new quote
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
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
      adminId,
      adminName,
      adminEmail
    } = data

    // Validate required fields
    if (!workOrderId || !adminId) {
      return NextResponse.json(
        { error: 'Work order ID and admin ID are required' },
        { status: 400 }
      )
    }

    // Get work order details
    const workOrdersRef = collection(db, 'workorders')
    const workOrderQuery = query(workOrdersRef, where('__name__', '==', workOrderId))
    const workOrderSnapshot = await getDocs(workOrderQuery)
    
    if (workOrderSnapshot.empty) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const workOrder = workOrderSnapshot.docs[0].data()

    // Calculate totals
    const laborCostNum = parseFloat(laborCost) || 0
    const materialCostNum = parseFloat(materialCost) || 0
    const additionalCostsNum = parseFloat(additionalCosts) || 0
    const discountAmountNum = parseFloat(discountAmount || '0') || 0
    const taxRateNum = parseFloat(taxRate) || 0

    const lineItemsWithTotals = lineItems.map((item: any) => ({
      ...item,
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      totalPrice: item.quantity * item.unitPrice
    }))

    const lineItemsTotal = lineItemsWithTotals.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    const subtotal = laborCostNum + materialCostNum + additionalCostsNum + lineItemsTotal - discountAmountNum
    const taxAmount = subtotal * (taxRateNum / 100)
    const totalAmount = subtotal + taxAmount

    // Create quote data
    const quoteData: Omit<Quote, 'id'> = {
      workOrderId,
      workOrderTitle: workOrder.title,
      workOrderDescription: workOrder.description,
      workOrderLocation: workOrder.location,
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
      discountAmount: discountAmountNum > 0 ? discountAmountNum : undefined,
      validUntil,
      lineItems: lineItemsWithTotals,
      notes: notes || undefined,
      terms: terms || undefined,
      createdBy: adminId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Save to Firestore
    const quotesRef = collection(db, 'quotes')
    const docRef = await addDoc(quotesRef, quoteData)

    return NextResponse.json({
      success: true,
      quoteId: docRef.id,
      message: 'Quote created successfully'
    })

  } catch (error) {
    console.error('Error creating quote:', error)
    return NextResponse.json(
      { error: 'Failed to create quote' },
      { status: 500 }
    )
  }
}

// Get all quotes
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workOrderId = searchParams.get('workOrderId')

    const quotesRef = collection(db, 'quotes')
    let q = query(quotesRef, orderBy('createdAt', 'desc'))

    if (workOrderId) {
      q = query(quotesRef, where('workOrderId', '==', workOrderId), orderBy('createdAt', 'desc'))
    }

    const snapshot = await getDocs(q)
    const quotes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({
      success: true,
      quotes
    })

  } catch (error) {
    console.error('Error fetching quotes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    )
  }
}
