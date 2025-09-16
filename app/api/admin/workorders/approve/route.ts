import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore'
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

    await updateDoc(workOrderRef, {
      status: 'approved',
      approvedBy: adminId,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({ success: true, message: 'Work order approved successfully' })

  } catch (error) {
    console.error('Error approving work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
