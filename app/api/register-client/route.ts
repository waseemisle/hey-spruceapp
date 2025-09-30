// Using standard Response instead of NextResponse to avoid type issues
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, db, addDocument, COLLECTIONS } from '@/lib/firebase'
import { ClientRegistrationData } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const data: ClientRegistrationData = await request.json()

    // Validate required fields
    if (!data.fullName || !data.email || !data.phone || !data.password) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (data.password !== data.confirmPassword) {
      return new Response(
        JSON.stringify({ error: 'Passwords do not match' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (data.password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password)
    const user = userCredential.user

    // Create user profile
    const userProfile = {
      id: user.uid,
      email: data.email,
      fullName: data.fullName,
      role: 'client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    await addDocument(COLLECTIONS.USERS, userProfile)

    // Create client profile
    const clientProfile = {
      userId: user.uid,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      companyName: data.companyName || '',
      businessType: data.businessType || '',
      numberOfProperties: data.numberOfProperties ? parseInt(data.numberOfProperties) : undefined,
      estimatedMonthlySpend: data.estimatedMonthlySpend ? parseFloat(data.estimatedMonthlySpend) : undefined,
      preferredServices: data.preferredServices || [],
      status: 'pending',
      address: data.address,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const { id: clientId, error: clientError } = await addDocument(COLLECTIONS.CLIENTS, clientProfile)

    if (clientError) {
      throw new Error(clientError)
    }

    return new Response(
        JSON.stringify({
      success: true,
      message: 'Client registration successful. Account pending admin approval.',
      userId: user.uid,
      clientId
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Client registration error:', error)
    
    if (error.code === 'auth/email-already-in-use') {
      return new Response(
        JSON.stringify({ error: 'Email address is already registered' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    if (error.code === 'auth/weak-password') {
      return new Response(
        JSON.stringify({ error: 'Password is too weak' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    if (error.code === 'auth/invalid-email') {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify({ error: error.message || 'Registration failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}