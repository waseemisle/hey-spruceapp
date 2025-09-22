import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, orderBy, getDocs } from 'firebase/firestore'

// Get all subcontractors
export async function GET(request: NextRequest) {
  try {
    console.log('Fetching all subcontractors')

    // Query all subcontractors ordered by creation date
    const subcontractorsRef = collection(db, 'subcontractors')
    const subcontractorsQuery = query(
      subcontractorsRef,
      orderBy('createdAt', 'desc')
    )

    const subcontractorsSnapshot = await getDocs(subcontractorsQuery)
    const subcontractors = subcontractorsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`Found ${subcontractors.length} subcontractors`)

    return NextResponse.json({
      success: true,
      subcontractors
    })

  } catch (error) {
    console.error('Error fetching subcontractors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subcontractors' },
      { status: 500 }
    )
  }
}

