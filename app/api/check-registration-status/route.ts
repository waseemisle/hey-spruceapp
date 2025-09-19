import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore'
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
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Check if there's a pending registration for this email
    const registrationsRef = collection(db, 'client_registrations')
    const q = query(registrationsRef, where('email', '==', email))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      return NextResponse.json({
        status: 'not_found',
        message: 'No registration found for this email'
      })
    }

    const registration = querySnapshot.docs[0].data()
    const registrationId = querySnapshot.docs[0].id

    return NextResponse.json({
      status: registration.status,
      registrationId,
      message: getStatusMessage(registration.status)
    })

  } catch (error) {
    console.error('Registration status check error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Your registration is pending admin approval. Please wait for approval before logging in.'
    case 'approved':
      return 'Your registration has been approved. You can now log in.'
    case 'rejected':
      return 'Your registration has been rejected. Please contact support for more information.'
    default:
      return 'Unknown registration status.'
  }
}
