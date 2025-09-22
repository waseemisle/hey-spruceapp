import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'

// Get quotes for a specific client
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const clientId = url.searchParams.get('clientId')

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      )
    }

    console.log('Fetching quotes for client:', clientId)

    // Query quotes for the specific client (without orderBy to avoid index issues)
    const quotesRef = collection(db, 'quotes')
    const quotesQuery = query(
      quotesRef,
      where('clientId', '==', clientId)
    )

    const quotesSnapshot = await getDocs(quotesQuery)
    const quotes = quotesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    console.log(`Found ${quotes.length} quotes for client ${clientId}`)

    return NextResponse.json({
      success: true,
      quotes
    })

  } catch (error) {
    console.error('Error fetching client quotes:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quotes' },
      { status: 500 }
    )
  }
}
