import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    console.log('Fetching subcontractor profile for user:', userId)

    // Get subcontractor profile directly by document ID
    const subcontractorRef = doc(db, COLLECTIONS.SUBCONTRACTORS, userId)
    const subcontractorDoc = await getDoc(subcontractorRef)
    
    if (!subcontractorDoc.exists()) {
      return NextResponse.json(
        { error: 'Subcontractor profile not found' },
        { status: 404 }
      )
    }

    const subcontractorData = {
      id: subcontractorDoc.id,
      ...subcontractorDoc.data()
    }

    console.log('Subcontractor profile found:', subcontractorData?.fullName)

    return NextResponse.json(subcontractorData)

  } catch (error: any) {
    console.error('Error fetching subcontractor profile:', error)
    return NextResponse.json(
      { error: `Failed to fetch subcontractor profile: ${error.message}` },
      { status: 500 }
    )
  }
}
