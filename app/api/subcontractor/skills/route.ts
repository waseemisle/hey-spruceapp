import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

export async function PUT(request: NextRequest) {
  try {
    const { userId, skills } = await request.json()

    if (!userId || !Array.isArray(skills)) {
      return NextResponse.json(
        { error: 'User ID and skills array are required' },
        { status: 400 }
      )
    }

    // Find subcontractor by userId
    const subcontractorsRef = doc(db, COLLECTIONS.SUBCONTRACTORS, userId)
    const subcontractorSnap = await getDoc(subcontractorsRef)

    if (!subcontractorSnap.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor not found' },
        { status: 404 }
      )
    }

    // Update skills
    await updateDoc(subcontractorsRef, {
      skills: skills,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Skills updated successfully'
    })

  } catch (error: any) {
    console.error('Error updating subcontractor skills:', error)
    return NextResponse.json(
      { error: 'Failed to update skills' },
      { status: 500 }
    )
  }
}
