import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { addDoc, collection, doc, getDoc } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await getDocuments(COLLECTIONS.QUOTES)
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch quotes' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Error fetching quotes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    // Calculate totals
    const laborTotal = parseFloat(laborCost) || 0
    const materialTotal = parseFloat(materialCost) || 0
    const additionalTotal = parseFloat(additionalCosts) || 0
    const discount = parseFloat(discountAmount) || 0
    
    const subtotal = laborTotal + materialTotal + additionalTotal - discount
    const taxAmount = subtotal * (parseFloat(taxRate) / 100) || 0
    const totalAmount = subtotal + taxAmount

    // Get work order and subcontractor data for quote
    const workOrderRef = doc(db, COLLECTIONS.WORK_ORDERS, workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return NextResponse.json({ error: 'Work Order not found' }, { status: 404 })
    }
    
    const workOrderData = workOrderSnap.data()
    
    if (!workOrderData) {
      return NextResponse.json({ error: 'Work Order data not found' }, { status: 404 })
    }
    
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)
    
    if (!subcontractorSnap.exists()) {
      return NextResponse.json({ error: 'Subcontractor not found' }, { status: 404 })
    }
    
    const subcontractorData = subcontractorSnap.data()
    
    if (!subcontractorData) {
      return NextResponse.json({ error: 'Subcontractor data not found' }, { status: 404 })
    }

    const quoteData = {
      workOrderId,
      workOrderTitle: workOrderData.title,
      workOrderDescription: workOrderData.description,
      workOrderLocation: workOrderData.location,
      clientId: workOrderData.clientId,
      clientName: workOrderData.clientName,
      clientEmail: workOrderData.clientEmail,
      subcontractorId,
      subcontractorName: subcontractorData.fullName,
      subcontractorEmail: subcontractorData.email,
      laborCost: laborTotal,
      materialCost: materialTotal,
      additionalCosts: additionalTotal,
      taxRate: parseFloat(taxRate) || 0,
      taxAmount,
      discountAmount: discount,
      totalAmount,
      originalAmount: totalAmount, // Original amount before markup
      clientAmount: totalAmount, // Will be updated when shared with client
      markupPercentage: 0, // Will be set when shared with client
      validUntil,
      lineItems: lineItems || [],
      notes,
      terms,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const docRef = await addDoc(collection(db, COLLECTIONS.QUOTES), quoteData)

    return NextResponse.json({
      success: true,
      message: 'Quote created successfully',
      quoteId: docRef.id
    })

  } catch (error: any) {
    console.error('Error creating quote:', error)
    return NextResponse.json(
      { error: 'Failed to create quote' },
      { status: 500 }
    )
  }
}