import { NextRequest, NextResponse } from 'next/server'
import { getFirestore, collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore'
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

// GET - Fetch locations based on user role
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const userRole = searchParams.get('role')

    if (!userId || !userRole) {
      return NextResponse.json(
        { error: 'User ID and role are required' },
        { status: 400 }
      )
    }

    let q
    if (userRole === 'admin') {
      // Admin can see all locations
      q = query(
        collection(db, 'locations'),
        orderBy('createdAt', 'desc')
      )
    } else if (userRole === 'client') {
      // Client can only see their own locations
      q = query(
        collection(db, 'locations'),
        where('clientId', '==', userId),
        orderBy('createdAt', 'desc')
      )
    } else {
      return NextResponse.json(
        { error: 'Invalid user role' },
        { status: 400 }
      )
    }

    const snapshot = await getDocs(q)
    const locations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return NextResponse.json({
      success: true,
      locations
    })

  } catch (error) {
    console.error('Error fetching locations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new location
export async function POST(request: NextRequest) {
  try {
    const locationData = await request.json()

    // Validate required fields
    const requiredFields = ['name', 'address', 'city', 'state', 'zipCode', 'country', 'type', 'clientId', 'clientName', 'clientEmail', 'createdBy']
    
    for (const field of requiredFields) {
      if (!locationData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        )
      }
    }

    // Create location record
    const locationRecord = {
      name: locationData.name,
      address: locationData.address,
      city: locationData.city,
      state: locationData.state,
      zipCode: locationData.zipCode,
      country: locationData.country,
      description: locationData.description || '',
      type: locationData.type,
      status: 'pending', // New locations need admin approval
      clientId: locationData.clientId,
      clientName: locationData.clientName,
      clientEmail: locationData.clientEmail,
      createdBy: locationData.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      contactInfo: locationData.contactInfo || {},
      additionalInfo: locationData.additionalInfo || ''
    }

    // Save to Firestore
    const docRef = await addDoc(collection(db, 'locations'), locationRecord)

    return NextResponse.json({
      success: true,
      locationId: docRef.id,
      message: 'Location created successfully. Pending admin approval.'
    })

  } catch (error) {
    console.error('Location creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
