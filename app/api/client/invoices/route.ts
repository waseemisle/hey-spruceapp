import { NextRequest, NextResponse } from 'next/server'
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'
import { where } from 'firebase/firestore'

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

    // Get invoices for specific client
    const { data, error } = await getDocuments(COLLECTIONS.INVOICES, [where('clientId', '==', clientId)])
    
    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch invoices' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('Error fetching client invoices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }
}
