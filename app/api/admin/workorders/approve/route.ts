import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { db } from '@/lib/firebase'
import { sendWorkOrderEmail } from '@/lib/sendgrid-service'

const firebaseConfig = {
  apiKey: "AIzaSyDWHE-iFu2JpGgOc57_RxZ_DFLpHxWYDQ8",
  authDomain: "heyspruceappv2.firebaseapp.com",
  projectId: "heyspruceappv2",
  storageBucket: "heyspruceappv2.firebasestorage.app",
  messagingSenderId: "198738285054",
  appId: "1:198738285054:web:6878291b080771623a70af",
  measurementId: "G-82NKE8271G"
}

const app = initializeApp(firebaseConfig)

export async function POST(request: NextRequest) {
  try {
    const { workOrderId, adminId } = await request.json()

    if (!workOrderId || !adminId) {
      return NextResponse.json(
        { error: 'Work Order ID and Admin ID are required' },
        { status: 400 }
      )
    }

    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const workOrderData = workOrderSnap.data()

    if (workOrderData?.status !== 'pending') {
      return NextResponse.json(
        { error: 'Work order is not pending approval' },
        { status: 400 }
      )
    }

    const approvedAt = new Date().toISOString()
    
    await updateDoc(workOrderRef, {
      status: 'approved',
      approvedBy: adminId,
      approvedAt: approvedAt,
      updatedAt: approvedAt
    })

    // Send email to client with PDF attachment
    try {
      console.log('=== WORK ORDER APPROVAL EMAIL START ===')
      console.log('Work order data:', {
        workOrderId: workOrderId,
        clientName: workOrderData.clientName,
        clientEmail: workOrderData.clientEmail,
        workOrderTitle: workOrderData.title,
        workOrderIdField: workOrderData.workOrderId
      })
      
      console.log('Sending work order approval email to client...')
      const emailResult = await sendWorkOrderEmail({
        workOrderId: workOrderData.workOrderId || workOrderId,
        clientName: workOrderData.clientName,
        clientEmail: workOrderData.clientEmail,
        workOrderTitle: workOrderData.title,
        status: 'approved',
        priority: workOrderData.priority,
        category: workOrderData.category,
        locationName: workOrderData.location?.name || 'Unknown Location',
        estimatedCost: workOrderData.estimatedCost,
        estimatedDuration: workOrderData.estimatedDuration,
        scheduledDate: workOrderData.scheduledDate,
        workOrderData: {
          workOrderId: workOrderData.workOrderId || workOrderId,
          workOrderNumber: workOrderData.workOrderId || workOrderId.substring(0, 8).toUpperCase(),
          clientName: workOrderData.clientName,
          clientEmail: workOrderData.clientEmail,
          title: workOrderData.title,
          description: workOrderData.description,
          priority: workOrderData.priority,
          category: workOrderData.category,
          status: 'approved',
          location: workOrderData.location || {
            name: 'Unknown Location',
            address: '',
            city: '',
            state: '',
            zipCode: ''
          },
          estimatedCost: workOrderData.estimatedCost,
          estimatedDuration: workOrderData.estimatedDuration,
          scheduledDate: workOrderData.scheduledDate,
          notes: workOrderData.notes,
          createdAt: workOrderData.createdAt,
          approvedAt: approvedAt,
          approvedBy: adminId
        }
      })

      console.log('Email result:', emailResult)
      
      if (emailResult.success) {
        console.log('Work order approval email sent successfully')
        console.log('Email data:', emailResult.data)
      } else {
        console.error('Failed to send work order approval email:', emailResult.error)
      }
    } catch (emailError) {
      console.error('Error sending work order approval email:', emailError)
      console.error('Email error details:', {
        message: emailError instanceof Error ? emailError.message : 'Unknown error',
        stack: emailError instanceof Error ? emailError.stack : undefined
      })
    }
    
    console.log('=== WORK ORDER APPROVAL EMAIL END ===')

    return NextResponse.json({ 
      success: true, 
      message: 'Work order approved and email sent successfully' 
    })

  } catch (error) {
    console.error('Error approving work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
