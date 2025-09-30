// Using standard Response instead of NextResponse to avoid type issues
import { db, COLLECTIONS, getDocuments } from '@/lib/firebase'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Get work orders for specific client
    const { data, error } = await getDocuments(COLLECTIONS.WORK_ORDERS, [
      { type: 'where', field: 'clientId', operator: '==', value: clientId }
    ])
    
    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch work orders' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
        JSON.stringify(data),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

  } catch (error: any) {
    console.error('Error fetching client work orders:', error)
    return new Response(
        JSON.stringify({ error: 'Failed to fetch work orders' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
  }
}
