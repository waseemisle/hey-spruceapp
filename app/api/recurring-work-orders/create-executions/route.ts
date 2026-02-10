import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { recurringWorkOrderId } = await request.json();

    if (!recurringWorkOrderId) {
      return NextResponse.json({ error: 'Recurring work order ID is required' }, { status: 400 });
    }

    // Get the recurring work order
    const recurringWorkOrderRef = doc(db, 'recurringWorkOrders', recurringWorkOrderId);
    const recurringWorkOrderSnap = await getDoc(recurringWorkOrderRef);

    if (!recurringWorkOrderSnap.exists()) {
      return NextResponse.json({ error: 'Recurring work order not found' }, { status: 404 });
    }

    const recurringWorkOrder = recurringWorkOrderSnap.data();

    // Check if nextServiceDates exists
    if (!recurringWorkOrder.nextServiceDates || !Array.isArray(recurringWorkOrder.nextServiceDates) || recurringWorkOrder.nextServiceDates.length === 0) {
      return NextResponse.json({ error: 'No service dates found for this recurring work order' }, { status: 400 });
    }

    // Get existing executions to avoid duplicates
    const executionsQuery = query(
      collection(db, 'recurringWorkOrderExecutions'),
      where('recurringWorkOrderId', '==', recurringWorkOrderId)
    );
    const executionsSnapshot = await getDocs(executionsQuery);
    const existingExecutions = new Set(
      executionsSnapshot.docs.map(doc => {
        const execDate = doc.data().scheduledDate?.toDate();
        return execDate ? execDate.toDateString() : null;
      }).filter(Boolean)
    );

    const results = {
      total: recurringWorkOrder.nextServiceDates.length,
      created: 0,
      skipped: 0,
      errors: [] as any[],
    };

    // Create executions for each nextServiceDate
    for (let i = 0; i < recurringWorkOrder.nextServiceDates.length; i++) {
      try {
        const serviceDate = recurringWorkOrder.nextServiceDates[i];
        const dateObj = serviceDate?.toDate ? serviceDate.toDate() : new Date(serviceDate);
        const dateString = dateObj.toDateString();

        // Skip if execution already exists for this date
        if (existingExecutions.has(dateString)) {
          results.skipped++;
          console.log(`Execution for ${dateString} already exists, skipping`);
          continue;
        }

        const executionNumber = executionsSnapshot.docs.length + results.created + 1;

        const executionData = {
          recurringWorkOrderId: recurringWorkOrderId,
          executionNumber: executionNumber,
          scheduledDate: Timestamp.fromDate(dateObj),
          status: 'pending',
          emailSent: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const executionRef = await addDoc(collection(db, 'recurringWorkOrderExecutions'), executionData);
        console.log(`Created execution #${executionNumber} (ID: ${executionRef.id}) for date ${dateString}`);

        results.created++;
        existingExecutions.add(dateString); // Add to set to avoid duplicates in this batch
      } catch (error: any) {
        console.error(`Error creating execution for index ${i}:`, error);
        results.errors.push({
          index: i,
          error: error.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${results.created} execution(s) out of ${results.total} service dates`,
      results,
    });
  } catch (error: any) {
    console.error('Error creating executions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create executions' },
      { status: 500 }
    );
  }
}
