import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore'
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

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const workOrderId = params.id
    const updateData = await request.json()

    const workOrderRef = doc(db, 'workorders', workOrderId)
    const workOrderSnap = await getDoc(workOrderRef)

    if (!workOrderSnap.exists()) {
      return NextResponse.json(
        { error: 'Work order not found' },
        { status: 404 }
      )
    }

    const updatedData = {
      ...updateData,
      updatedAt: new Date().toISOString()
    }

    // If completing the work order, add completion date
    if (updateData.status === 'completed') {
      updatedData.completedDate = new Date().toISOString()
    }

    await updateDoc(workOrderRef, updatedData)

    return NextResponse.json({ success: true, message: 'Work order updated successfully' })

  } catch (error) {
    console.error('Error updating work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
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

    await deleteDoc(workOrderRef)

    return NextResponse.json({ success: true, message: 'Work order deleted successfully' })

  } catch (error) {
    console.error('Error deleting work order:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
