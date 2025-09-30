import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { clientId, adminId, reason } = await request.json()

    if (!clientId || !adminId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId, adminId, and reason' },
        { status: 400 }
      )
    }

    // Get client data
    const clientRef = doc(db, COLLECTIONS.CLIENTS, clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    const clientData = clientSnap.data()

    if (!clientData) {
      return NextResponse.json({ error: 'Client data not found' }, { status: 404 })
    }

    if (clientData.status !== 'pending') {
      return NextResponse.json(
        { error: 'Client is not in pending status' },
        { status: 400 }
      )
    }

    // Update client status to rejected
    await updateDoc(clientRef, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedBy: adminId,
      rejectionReason: reason,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Client rejected successfully'
    })

  } catch (error: any) {
    console.error('Error rejecting client:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reject client' },
      { status: 500 }
    )
  }
}
