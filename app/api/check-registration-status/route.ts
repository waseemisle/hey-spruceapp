import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check if there's a pending registration for this email
    const registrationsRef = collection(db, 'client_registrations')
    const q = query(registrationsRef, where('email', '==', email))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      return new Response(
        JSON.stringify({
        status: 'not_found',
        message: 'No registration found for this email'
      }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const registration = querySnapshot.docs[0].data()
    const registrationId = querySnapshot.docs[0].id

    if (!registration) {
      return new Response(
        JSON.stringify({ error: 'Registration data not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: registration.status,
        registrationId,
        message: getStatusMessage(registration.status)
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Registration status check error:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Your registration is pending admin approval. Please wait for approval before logging in.'
    case 'approved':
      return 'Your registration has been approved. You can now log in.'
    case 'rejected':
      return 'Your registration has been rejected. Please contact support for more information.'
    default:
      return 'Unknown registration status.'
  }
}
