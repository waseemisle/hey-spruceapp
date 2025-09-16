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
    const { registrationId, reason } = await request.json()

    if (!registrationId || !reason) {
      return NextResponse.json(
        { error: 'Registration ID and rejection reason are required' },
        { status: 400 }
      )
    }

    // Get the registration document
    const registrationRef = doc(db, 'client_registrations', registrationId)
    const registrationSnap = await getDoc(registrationRef)

    if (!registrationSnap.exists()) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      )
    }

    const registrationData = registrationSnap.data()

    if (registrationData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Registration is not pending' },
        { status: 400 }
      )
    }

    // Update registration status
    await updateDoc(registrationRef, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'admin@heyspruce.com', // In real app, get from auth context
      rejectionReason: reason
    })

    return NextResponse.json({
      success: true,
      message: 'Client registration rejected'
    })

  } catch (error) {
    console.error('Rejection error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
