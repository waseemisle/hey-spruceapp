// Using standard Response instead of NextResponse to avoid type issues
import { db } from '@/lib/firebase'
export async function GET(request: Request) {
  try {
    console.log('Testing Firestore connection...')
    
    // Test basic Firestore connection
    const testRef = db.collection('quotes')
    console.log('Collection reference created')
    
    const snapshot = await testRef.get()
    console.log('Query executed, found', snapshot.docs.length, 'documents')
    
    return new Response(
        JSON.stringify({
      success: true,
      message: 'Firestore connection successful',
      documentCount: snapshot.docs.length
    }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    
  } catch (error) {
    console.error('Firestore test error:', error)
    return new Response(
        JSON.stringify({
        success: false,
        error: 'Firestore connection failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}

