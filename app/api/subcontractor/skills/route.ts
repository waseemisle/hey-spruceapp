// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

export async function PUT(request: Request) {
  try {
    const { userId, skills } = await request.json()

    if (!userId || !Array.isArray(skills)) {
      return new Response(
        JSON.stringify({ error: 'User ID and skills array are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Find subcontractor by userId
    const subcontractorsRef = doc(db, COLLECTIONS.SUBCONTRACTORS, userId)
    const subcontractorSnap = await getDoc(subcontractorsRef)

    if (!subcontractorSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update skills
    await updateDoc(subcontractorsRef, {
      skills: skills,
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Skills updated successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error updating subcontractor skills:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to update skills' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
