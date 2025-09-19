import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, collection, addDoc } from 'firebase/firestore'
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
    const registrationData = await request.json()
    const url = new URL(request.url)
    const token = url.searchParams.get('token')

    // Validate required fields
    const requiredFields = [
      'companyName', 'contactPerson', 'email', 'phone', 
      'address', 'businessType', 'numberOfProperties', 'password'
    ]

    for (const field of requiredFields) {
      if (!registrationData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Check if email already exists
    const existingRegistration = await checkExistingRegistration(registrationData.email)
    if (existingRegistration) {
      return NextResponse.json(
        { error: 'A registration with this email already exists' },
        { status: 400 }
      )
    }

    // If token is provided, validate and mark as used
    let linkValid = true
    if (token) {
      linkValid = await validateAndMarkLinkUsed(token, registrationData.email)
      if (!linkValid) {
        return NextResponse.json(
          { error: 'Invalid or expired registration link' },
          { status: 400 }
        )
      }
    }

    // Create registration record
    const registrationRecord = {
      companyName: registrationData.companyName,
      contactPerson: registrationData.contactPerson,
      email: registrationData.email,
      phone: registrationData.phone,
      address: registrationData.address,
      businessType: registrationData.businessType,
      numberOfProperties: parseInt(registrationData.numberOfProperties),
      preferredServices: registrationData.preferredServices,
      additionalInfo: registrationData.additionalInfo,
      password: registrationData.password, // In production, hash this
      status: 'pending',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      approvedAt: null,
      rejectionReason: null,
      registrationToken: token || null // Track which link was used
    }

    // Save to Firestore
    const docRef = await addDoc(collection(db, 'client_registrations'), registrationRecord)

    return NextResponse.json({
      success: true,
      registrationId: docRef.id,
      message: 'Registration submitted successfully'
    })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function checkExistingRegistration(email: string): Promise<boolean> {
  // This would typically query Firestore to check for existing registrations
  // For now, we'll return false
  return false
}

async function validateAndMarkLinkUsed(token: string, email: string): Promise<boolean> {
  try {
    // In a real app, you would:
    // 1. Query Firestore to find the link by token
    // 2. Check if it's still active and not expired
    // 3. Check if the email matches
    // 4. Mark the link as used
    
    // For demo purposes, we'll simulate this
    console.log(`Validating link for token: ${token}, email: ${email}`)
    
    // Simulate validation (in real app, query Firestore)
    const isValid = Boolean(token && token.length > 10)
    
    if (isValid) {
      // Mark link as used (in real app, update Firestore document)
      console.log(`Link marked as used for ${email}`)
    }
    
    return isValid
  } catch (error) {
    console.error('Link validation error:', error)
    return false
  }
}
