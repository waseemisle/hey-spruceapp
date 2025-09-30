import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { query, where, collection } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      )
    }

    // Get locations for specific client
    const q = query(
      collection(db, COLLECTIONS.LOCATIONS),
      where('clientId', '==', clientId)
    )
    
    const { data, error } = await getDocuments(COLLECTIONS.LOCATIONS, [where('clientId', '==', clientId)])
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch locations' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Error fetching client locations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 }
    )
  }
}
