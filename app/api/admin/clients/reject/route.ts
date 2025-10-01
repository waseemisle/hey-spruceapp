// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS } from '@/lib/firebase'
export async function POST(request: Request) {
  try {
    const { clientId, adminId, reason } = await request.json()

    if (!clientId || !adminId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: clientId, adminId, and reason' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get client data
    const clientRef = db.collection(COLLECTIONS.CLIENTS).doc(clientId)
    const clientSnap = await clientRef.get()

    if (!clientSnap.exists) {
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

    // Update client status to rejected
    await clientRef.update({
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Client rejected successfully'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error rejecting client:', error)
    return new Response(
        JSON.stringify({ error: error.message || 'Failed to reject client' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
