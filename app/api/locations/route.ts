import { db } from '@/lib/firebase'
import { collection, addDoc, query, where, getDocs, orderBy } from 'firebase/firestore'

// GET - Fetch locations based on user role
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const userRole = searchParams.get('role')

    if (!userId || !userRole) {
      return new Response(
        JSON.stringify({ error: 'User ID and role are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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
      return new Response(
        JSON.stringify({ error: 'Invalid user role' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const snapshot = await getDocs(q)
    const locations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    return new Response(
        JSON.stringify({
      success: true,
      locations
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error fetching locations:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// POST - Create new location
export async function POST(request: Request) {
  try {
    const locationData = await request.json()

    // Validate required fields
    const requiredFields = ['name', 'address', 'city', 'state', 'zipCode', 'country', 'type', 'clientId', 'clientName', 'clientEmail', 'createdBy']
    
    for (const field of requiredFields) {
      if (!locationData[field]) {
        return new Response(
        JSON.stringify({ error: `Missing required field: ${field}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
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

    return new Response(
        JSON.stringify({
      success: true,
      locationId: docRef.id,
      message: 'Location created successfully. Pending admin approval.'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Location creation error:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
