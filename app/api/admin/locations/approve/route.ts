import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'

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
const db = getFirestore(app)

export async function POST(request: NextRequest) {
  try {
    const { locationId, approvedBy } = await request.json()

    if (!locationId) {
      return NextResponse.json(
        { error: 'Location ID is required' },
        { status: 400 }
      )
    }

    // Get the location document
    const locationRef = doc(db, 'locations', locationId)
    const locationSnap = await getDoc(locationRef)

    if (!locationSnap.exists()) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      )
    }

    const locationData = locationSnap.data()

    if (locationData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Location is not pending approval' },
        { status: 400 }
      )
    }

    // Update location status to approved
    await updateDoc(locationRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: approvedBy || 'admin@heyspruce.com',
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Location approved successfully'
    })

  } catch (error) {
    console.error('Location approval error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
