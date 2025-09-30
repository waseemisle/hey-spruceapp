// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { clientId, adminId } = await request.json()

    if (!clientId || !adminId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: clientId and adminId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get client data
    const clientRef = doc(db, COLLECTIONS.CLIENTS, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const clientData = clientSnap.data()

    if (!clientData) {
      return new Response(
        JSON.stringify({ error: 'Client data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (clientData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Client is not in pending status' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update client status to approved
    await updateDoc(clientRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString()
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Client approved successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error approving client:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to approve client' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
