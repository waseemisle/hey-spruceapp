// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
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
    const subcontractorsRef = db.collection(COLLECTIONS.SUBCONTRACTORS).doc(userId)
    const subcontractorSnap = await subcontractorsRef.get()

    if (!subcontractorSnap.exists) {
      return new Response(
        JSON.stringify({ error: 'Subcontractor not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update skills
    await subcontractorsRef.update({
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
