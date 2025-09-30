import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

// Update a specific subcontractor
export async function PUT(
  request: NextRequest,
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
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
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

    return NextResponse.json({
      success: true,
      message: 'Subcontractor updated successfully'
    })

  } catch (error) {
    console.error('Error updating subcontractor:', error)
    return NextResponse.json(
      { error: 'Failed to update subcontractor' },
      { status: 500 }
    )
  }
}

// Get a specific subcontractor
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const subcontractorId = params.id
    
    console.log('Fetching subcontractor:', subcontractorId)

    const subcontractorRef = doc(db, 'subcontractors', subcontractorId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    const subcontractorData = {
      id: subcontractorDoc.id,
      ...subcontractorDoc.data()
    }

    return NextResponse.json(subcontractorData)

  } catch (error) {
    console.error('Error fetching subcontractor:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractor' },
      { status: 500 }
    )
  }
}
