import { db, auth } from '@/lib/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { sendApprovalEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { registrationId } = await request.json()

    if (!registrationId) {
      return new Response(
        JSON.stringify({ error: 'Registration ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get the registration document
    const registrationRef = db.collection('client_registrations').doc(registrationId)
    const registrationSnap = await registrationRef.get()

    if (!registrationSnap.exists) {
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

    // Create Firebase Auth user
    let authUser
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        registrationData.email,
        registrationData.password
      )
      authUser = userCredential.user
    } catch (authError: any) {
      if (authError.code === 'auth/email-already-in-use') {
        return new Response(
          JSON.stringify({ error: 'User with this email already exists' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw authError
    }

    // Create user profile in Firestore
    const userProfile = {
      email: registrationData.email,
      fullName: registrationData.contactPerson,
      role: 'client',
      companyName: registrationData.companyName,
      phone: registrationData.phone,
      address: registrationData.address,
      businessType: registrationData.businessType,
      numberOfProperties: registrationData.numberOfProperties,
      preferredServices: registrationData.preferredServices,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await db.collection('users').doc(authUser.uid).set(userProfile)

    // Update registration status
    await registrationRef.update({
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'admin@heyspruce.com', // In real app, get from auth context
      approvedAt: new Date().toISOString(),
      userId: authUser.uid
    })

    // Send approval email to client
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/portal-login`
    const emailResult = await sendApprovalEmail(
      registrationData.email,
      registrationData.contactPerson,
      registrationData.companyName,
      loginUrl
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Client approved successfully',
        userId: authUser.uid,
        emailSent: emailResult.success,
        emailError: emailResult.error || null
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Approval error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      code: (error as any)?.code
    })
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
