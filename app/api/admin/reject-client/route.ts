import { db } from '@/lib/firebase'
import { doc, updateDoc, getDoc } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { registrationId, reason } = await request.json()

    if (!registrationId || !reason) {
      return new Response(
        JSON.stringify({ error: 'Registration ID and rejection reason are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the registration document
    const registrationRef = doc(db, 'client_registrations', registrationId)
    const registrationSnap = await getDoc(registrationRef)

    if (!registrationSnap.exists()) {
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const registrationData = registrationSnap.data()

    if (!registrationData) {
      return new Response(
        JSON.stringify({ error: 'Registration data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (registrationData.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'Registration is not pending' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Update registration status
    await updateDoc(registrationRef, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'admin@heyspruce.com', // In real app, get from auth context
      rejectionReason: reason
    })

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Client registration rejected'
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error) {
    console.error('Rejection error:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
