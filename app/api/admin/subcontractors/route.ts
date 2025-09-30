import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, getDocs, addDoc } from 'firebase/firestore'

// Get all subcontractors
export async function GET(request: NextRequest) {
  try {
    console.log('Fetching all subcontractors')

    // Query all subcontractors ordered by creation date
    const subcontractorsRef = collection(db, 'subcontractors')
    const subcontractorsQuery = query(
      subcontractorsRef,
      orderBy('createdAt', 'desc')
    )

    const subcontractorsSnapshot = await getDocs(subcontractorsQuery)
    const subcontractors = subcontractorsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`Found ${subcontractors.length} subcontractors`)

    return NextResponse.json(subcontractors)

  } catch (error) {
    console.error('Error fetching subcontractors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractors' },
      { status: 500 }
    )
  }
}

// Create a new subcontractor
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Creating new subcontractor:', body)

    // Validate required fields
    if (!body.fullName || !body.email || !body.categoryId) {
      return NextResponse.json(
        { error: 'Missing required fields: fullName, email, categoryId' },
        { status: 400 }
      )
    }

    // Prepare subcontractor data
    const subcontractorData = {
      ...body,
      createdAt: new Date().toISOString(),
      createdBy: body.createdBy,
      status: body.status || 'approved', // Admin-created subcontractors are automatically approved
      // Ensure proper data types
      hourlyRate: body.hourlyRate ? parseFloat(body.hourlyRate) : null,
      skills: body.skills || [],
      // Set default values if not provided
      availability: body.availability || 'available',
      address: body.address || {
        street: '',
        city: '',
        state: '',
        zipCode: ''
      },
      businessInfo: body.businessInfo || {
        businessName: '',
        address: ''
      }
    }

    // Add the subcontractor to Firestore
    const docRef = await addDoc(collection(db, 'subcontractors'), subcontractorData)

    console.log('Subcontractor created successfully with ID:', docRef.id)

    return NextResponse.json({
      success: true,
      message: 'Subcontractor created successfully',
      id: docRef.id
    })

  } catch (error) {
    console.error('Error creating subcontractor:', error)
    return NextResponse.json(
      { error: 'Failed to create subcontractor' },
      { status: 500 }
    )
  }
}

