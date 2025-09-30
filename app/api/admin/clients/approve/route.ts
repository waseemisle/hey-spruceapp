import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { updateDoc, doc, getDoc } from 'firebase/firestore'

export async function POST(request: NextRequest) {
  try {
    const { clientId, adminId } = await request.json()

    if (!clientId || !adminId) {
      return NextResponse.json(
        { error: 'Missing required fields: clientId and adminId' },
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

    // Update client status to approved
    await updateDoc(clientRef, {
      status: 'approved',
      approvedAt: new Date().toISOString(),
      approvedBy: adminId,
      updatedAt: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: 'Client approved successfully'
    })

  } catch (error: any) {
    console.error('Error approving client:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to approve client' },
      { status: 500 }
    )
  }
}
