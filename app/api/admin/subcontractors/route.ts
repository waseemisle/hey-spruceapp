// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { collection, query, orderBy, getDocs, addDoc } from 'firebase/firestore'

// Get all subcontractors
export async function GET(request: Request) {
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

    return new Response(
        JSON.stringify(subcontractors),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error fetching subcontractors:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch subcontractors' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// Create a new subcontractor
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Creating new subcontractor:', body)

    // Validate required fields
    if (!body.fullName || !body.email || !body.categoryId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fullName, email, categoryId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor created successfully',
      id: docRef.id
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error creating subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to create subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

