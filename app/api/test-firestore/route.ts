import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, getDocs } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing Firestore connection...')
    
    // Test basic Firestore connection
    const testRef = collection(db, 'quotes')
    console.log('Collection reference created')
    
    const snapshot = await getDocs(testRef)
    console.log('Query executed, found', snapshot.docs.length, 'documents')
    
    return NextResponse.json({
      success: true,
      message: 'Firestore connection successful',
      documentCount: snapshot.docs.length
    })
    
  } catch (error) {
    console.error('Firestore test error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Firestore connection failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

