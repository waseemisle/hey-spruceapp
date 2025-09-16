import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
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
    const { workOrderId, subcontractorId, adminId } = await request.json()

    if (!workOrderId || !subcontractorId || !adminId) {
      return NextResponse.json(
        { error: 'Work Order ID, Subcontractor ID, and Admin ID are required' },
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

    if (workOrderData?.status !== 'approved') {
      return NextResponse.json(
        { error: 'Work order must be approved before assignment' },
        { status: 400 }
      )
    }

    // Get subcontractor details
    const subcontractorRef = doc(db, 'users', subcontractorId)
    const subcontractorSnap = await getDoc(subcontractorRef)

    if (!subcontractorSnap.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    const subcontractorData = subcontractorSnap.data()

    await updateDoc(workOrderRef, {
      assignedTo: subcontractorId,
      assignedToName: subcontractorData?.fullName || 'Unknown',
      assignedBy: adminId,
      assignedAt: new Date().toISOString(),
      status: 'in-progress',
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({ 
      success: true, 
      message: `Work order assigned to ${subcontractorData?.fullName} successfully` 
    })

  } catch (error) {
    console.error('Error assigning work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get all subcontractors for assignment dropdown
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'subcontractor')
    )
    
    const querySnapshot = await getDocs(q)
    const subcontractors = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({ success: true, subcontractors })
  } catch (error) {
    console.error('Error fetching subcontractors:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
