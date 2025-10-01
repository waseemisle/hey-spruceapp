import { db } from '@/lib/firebase'
export async function POST(request: Request) {
  try {
    const { clientEmail, clientName, expirationDays } = await request.json()

    if (!clientEmail || !clientName) {
      return new Response(
        JSON.stringify({ error: 'Client email and name are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Generate unique token
    const token = generateUniqueToken()
    
    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + (expirationDays || 7))

    // Create registration link record
    const linkData = {
      token,
      clientEmail,
      clientName,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      createdBy: 'admin@heyspruce.com', // In real app, get from auth context
      usedAt: null,
      usedBy: null
    }

    // Save to Firestore
    const docRef = await db.collection('registration_links').add(linkData)

    // Generate the registration URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const registrationUrl = `${baseUrl}/register?token=${token}&email=${encodeURIComponent(clientEmail)}&name=${encodeURIComponent(clientName)}`

    return new Response(
      JSON.stringify({
        success: true,
        linkId: docRef.id,
        token,
        registrationUrl,
        expiresAt: expiresAt.toISOString(),
        message: 'Registration link generated successfully'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Link generation error:', error)
    return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

function generateUniqueToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
