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
    const { clientEmail, clientName, expirationDays } = await request.json()

    if (!clientEmail || !clientName) {
      return NextResponse.json(
        { error: 'Client email and name are required' },
        { status: 400 }
      )
    }

    // Generate unique token
    const token = generateUniqueToken()
    
    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (expirationDays || 7))

    // Create registration link record
    const linkData = {
      token,
      clientEmail,
      clientName,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      createdBy: 'admin@heyspruce.com', // In real app, get from auth context
      usedAt: null,
      usedBy: null
    }

    // Save to Firestore
    const docRef = await addDoc(collection(db, 'registration_links'), linkData)

    // Generate the registration URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const registrationUrl = `${baseUrl}/register?token=${token}&email=${encodeURIComponent(clientEmail)}&name=${encodeURIComponent(clientName)}`

    return NextResponse.json({
      success: true,
      linkId: docRef.id,
      token,
      registrationUrl,
      expiresAt: expiresAt.toISOString(),
      message: 'Registration link generated successfully'
    })

  } catch (error) {
    console.error('Link generation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function generateUniqueToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
