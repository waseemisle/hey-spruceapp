import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    const workOrderData = await request.json()
    
    console.log('Updating work order:', workOrderId, workOrderData)

    // Check if work order exists
    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData = {
      title: workOrderData.title,
      description: workOrderData.description,
      priority: workOrderData.priority,
      category: workOrderData.category,
      status: workOrderData.status,
      location: workOrderData.location,
      estimatedCost: workOrderData.estimatedCost ? parseFloat(workOrderData.estimatedCost) : 0,
      estimatedDuration: workOrderData.estimatedDuration || 0,
      scheduledDate: workOrderData.scheduledDate || '',
      notes: workOrderData.notes || '',
      updatedAt: new Date().toISOString()
    }

    // Update the work order
    await updateDoc(workOrderRef, updateData)

    return NextResponse.json({
      success: true,
      message: 'Work order updated successfully'
    })

  } catch (error) {
    console.error('Work order update error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const workOrderId = params.id
    
    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)
    
    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const workOrderData = {
      id: workOrderSnap.id,
      ...workOrderSnap.data()
    }

    return NextResponse.json({
      success: true,
      workOrder: workOrderData
    })

  } catch (error) {
    console.error('Error fetching work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}