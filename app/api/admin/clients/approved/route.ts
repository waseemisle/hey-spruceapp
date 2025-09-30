import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { where } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    // Get approved clients
    const { data, error } = await getDocuments(COLLECTIONS.CLIENTS, [where('status', '==', 'approved')])
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch approved clients' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Error fetching approved clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch approved clients' },
      { status: 500 }
    )
  }
}
