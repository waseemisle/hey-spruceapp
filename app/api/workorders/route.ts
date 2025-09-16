import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { db } from '@/lib/firebase'

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
    const workOrderData = await request.json()
    console.log('Received work order data:', workOrderData)

    const requiredFields = [
      'title', 'description', 'priority', 'category', 'location',
      'clientId', 'clientName', 'clientEmail', 'createdBy'
    ]

    const missingFields = requiredFields.filter(field => !workOrderData[field])
    
    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields)
      return NextResponse.json(
        { 
          error: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields 
        },
        { status: 400 }
      )
    }

    const workOrderRecord = {
      title: workOrderData.title,
      description: workOrderData.description,
      priority: workOrderData.priority,
      category: workOrderData.category,
      status: 'pending', // New work orders need admin approval
      location: workOrderData.location,
      clientId: workOrderData.clientId,
      clientName: workOrderData.clientName,
      clientEmail: workOrderData.clientEmail,
      createdBy: workOrderData.createdBy,
      estimatedCost: workOrderData.estimatedCost ? parseFloat(workOrderData.estimatedCost) : 0,
      estimatedDuration: workOrderData.estimatedDuration ? parseFloat(workOrderData.estimatedDuration) : 0,
      scheduledDate: workOrderData.scheduledDate || '',
      notes: workOrderData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const docRef = await addDoc(collection(db, 'workorders'), workOrderRecord)

    return NextResponse.json({
      success: true,
      workOrderId: docRef.id,
      message: 'Work order submitted for approval'
    })

  } catch (error) {
    console.error('Work order creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const role = searchParams.get('role')

    let q
    if (role === 'admin') {
      // Admin can see all work orders
      q = query(collection(db, 'workorders'), orderBy('createdAt', 'desc'))
    } else if (role === 'client' && userId) {
      // Client can only see their own work orders
      q = query(
        collection(db, 'workorders'),
        where('clientId', '==', userId),
        orderBy('createdAt', 'desc')
      )
    } else if (role === 'subcontractor' && userId) {
      // Subcontractor can only see work orders assigned to them
      q = query(
        collection(db, 'workorders'),
        where('assignedTo', '==', userId),
        orderBy('createdAt', 'desc')
      )
    } else {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
    }

    const querySnapshot = await getDocs(q)
    const workOrders = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ success: true, workOrders })
  } catch (error) {
    console.error('Error fetching work orders:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
