// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Update a specific subcontractor
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    const body = await request.json()
    
    console.log('Updating subcontractor:', subcontractorId)
    console.log('Update data:', body)

    // Check if subcontractor exists
    const subcontractorRef = doc(db, 'subcontractors', subcontractorId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare update data
    const updateData = {
      ...body,
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy
    }

    // Remove updatedBy from the data to be saved
    delete updateData.updatedBy

    // Update the subcontractor
    await updateDoc(subcontractorRef, updateData)

    console.log('Subcontractor updated successfully:', subcontractorId)

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Subcontractor updated successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error updating subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to update subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

// Get a specific subcontractor
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    
    console.log('Fetching subcontractor:', subcontractorId)

    const subcontractorRef = doc(db, 'subcontractors', subcontractorId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const subcontractorData = {
      id: subcontractorDoc.id,
      ...subcontractorDoc.data()
    }

    return new Response(
        JSON.stringify(subcontractorData),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Error fetching subcontractor:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch subcontractor' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
