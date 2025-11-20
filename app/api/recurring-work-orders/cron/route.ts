import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // This endpoint should be called by a cron job (e.g., Vercel Cron, GitHub Actions, etc.)
    // to check for recurring work orders that need to be executed
    
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // Find all active recurring work orders that should be executed today
    const recurringWorkOrdersQuery = query(
      collection(db, 'recurringWorkOrders'),
      where('status', '==', 'active'),
      where('nextExecution', '>=', startOfDay),
      where('nextExecution', '<=', endOfDay)
    );

    const snapshot = await getDocs(recurringWorkOrdersQuery);
    const recurringWorkOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`Found ${recurringWorkOrders.length} recurring work orders to execute`);

    const results = [];

    for (const recurringWorkOrder of recurringWorkOrders) {
      try {
        // Call the execute endpoint for each recurring work order
        const executeResponse = await fetch(`${request.nextUrl.origin}/api/recurring-work-orders/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recurringWorkOrderId: recurringWorkOrder.id
          })
        });

        const executeResult = await executeResponse.json();
        
        if (executeResponse.ok) {
          results.push({
            recurringWorkOrderId: recurringWorkOrder.id,
            status: 'success',
            message: executeResult.message
          });
        } else {
          results.push({
            recurringWorkOrderId: recurringWorkOrder.id,
            status: 'error',
            message: executeResult.error
          });
        }
      } catch (error) {
        console.error(`Error executing recurring work order ${recurringWorkOrder.id}:`, error);
        results.push({
          recurringWorkOrderId: recurringWorkOrder.id,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${recurringWorkOrders.length} recurring work orders`,
      results
    });

  } catch (error) {
    console.error('Error in recurring work orders cron job:', error);
    
    // Check if this is a Firestore index error
    if (error instanceof Error && error.message.includes('index')) {
      const indexMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const indexUrl = indexMatch ? indexMatch[0] : null;
      
      return NextResponse.json({ 
        error: 'Firestore index required',
        message: 'This query requires a composite index. Please create it in Firebase Console.',
        indexUrl: indexUrl,
        details: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// This endpoint can also be called via POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
