import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { initializeApp } from 'firebase/app'
import { sendApprovalEmail } from '@/lib/email'

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
const auth = getAuth(app)

export async function POST(request: NextRequest) {
  try {
    const { registrationId } = await request.json()

    if (!registrationId) {
      return NextResponse.json(
        { error: 'Registration ID is required' },
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

    // Create Firebase Auth user
    let authUser
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        registrationData.email,
        registrationData.password
      )
      authUser = userCredential.user
    } catch (authError: any) {
      if (authError.code === 'auth/email-already-in-use') {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 400 }
        )
      }
      throw authError
    }

    // Create user profile in Firestore
    const userProfile = {
      email: registrationData.email,
      fullName: registrationData.contactPerson,
      role: 'client',
      companyName: registrationData.companyName,
      phone: registrationData.phone,
      address: registrationData.address,
      businessType: registrationData.businessType,
      numberOfProperties: registrationData.numberOfProperties,
      preferredServices: registrationData.preferredServices,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await setDoc(doc(db, 'users', authUser.uid), userProfile)

    // Update registration status
    await updateDoc(registrationRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'admin@heyspruce.com', // In real app, get from auth context
      approvedAt: new Date().toISOString(),
      userId: authUser.uid
    })

    // Send approval email to client
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal-login`
    const emailResult = await sendApprovalEmail(
      registrationData.email,
      registrationData.contactPerson,
      registrationData.companyName,
      loginUrl
    )

    return NextResponse.json({
      success: true,
      message: 'Client approved successfully',
      userId: authUser.uid,
      emailSent: emailResult.success,
      emailError: emailResult.error || null
    })

  } catch (error) {
    console.error('Approval error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      code: (error as any)?.code
    })
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
