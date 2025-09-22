import { NextRequest, NextResponse } from 'next/server'

// Test endpoint to manually trigger scheduled invoice execution
export async function GET(request: NextRequest) {
  try {
    console.log('=== TEST SCHEDULED INVOICES EXECUTION START ===')
    
    // Call the execute endpoint
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/admin/scheduled-invoices/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    const result = await response.json()
    
    console.log('Execution result:', result)
    console.log('=== TEST SCHEDULED INVOICES EXECUTION END ===')
    
    return NextResponse.json({
      success: true,
      message: 'Scheduled invoices execution triggered',
      result
    })
    
  } catch (error) {
    console.error('=== TEST SCHEDULED INVOICES EXECUTION ERROR ===')
    console.error('Error:', error)
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to trigger scheduled invoices execution',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
