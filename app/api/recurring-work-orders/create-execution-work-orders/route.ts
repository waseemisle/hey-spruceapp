import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, Timestamp } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';

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

    // Get all executions for this recurring work order
    const executionsQuery = query(
      collection(db, 'recurringWorkOrderExecutions'),
      where('recurringWorkOrderId', '==', recurringWorkOrderId)
    );
    const executionsSnapshot = await getDocs(executionsQuery);

    const results = {
      total: 0,
      created: 0,
      skipped: 0,
      errors: [] as any[],
    };

    results.total = executionsSnapshot.docs.length;

    // Process each execution
    for (const executionDoc of executionsSnapshot.docs) {
      const execution = executionDoc.data();
      const executionId = executionDoc.id;

      // Skip if work order already exists
      if (execution.workOrderId) {
        results.skipped++;
        console.log(`Execution ${executionId} already has work order ${execution.workOrderId}, skipping`);
        continue;
      }

      try {
        // Get scheduled date
        const scheduledDate = execution.scheduledDate?.toDate() || new Date();
        const executionNumber = execution.executionNumber || 1;

        // Create Standard Work Order for this execution
        const standardWorkOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}-EX${executionNumber}-${executionId.slice(-4)}`;
        const standardWorkOrderData: any = {
          workOrderNumber: standardWorkOrderNumber,
          clientId: recurringWorkOrder.clientId,
          clientName: recurringWorkOrder.clientName,
          clientEmail: recurringWorkOrder.clientEmail,
          locationId: recurringWorkOrder.locationId,
          location: {
            id: recurringWorkOrder.locationId,
            locationName: recurringWorkOrder.locationName || '',
          },
          locationName: recurringWorkOrder.locationName,
          locationAddress: recurringWorkOrder.locationAddress,
          title: `${recurringWorkOrder.title} - Execution #${executionNumber}`,
          description: `${recurringWorkOrder.description || recurringWorkOrder.title}\n\nThis work order was created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}. Scheduled Date: ${scheduledDate.toLocaleDateString()}.`,
          category: recurringWorkOrder.category,
          categoryId: recurringWorkOrder.categoryId || '',
          priority: recurringWorkOrder.priority || 'medium',
          estimateBudget: recurringWorkOrder.estimateBudget || null,
          status: 'approved', // Start as approved since it's from a recurring work order
          images: [],
          scheduledServiceDate: Timestamp.fromDate(scheduledDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          // Link back to recurring work order and execution
          recurringWorkOrderId: recurringWorkOrderId,
          recurringWorkOrderNumber: recurringWorkOrder.workOrderNumber,
          executionId: executionId,
          executionNumber: executionNumber,
          isFromRecurringWorkOrder: true,
        };

        // Add company info if available
        if (recurringWorkOrder.companyId) {
          standardWorkOrderData.companyId = recurringWorkOrder.companyId;
          standardWorkOrderData.companyName = recurringWorkOrder.companyName;
        }

        // Add subcontractor if pre-assigned
        if (recurringWorkOrder.subcontractorId) {
          standardWorkOrderData.assignedTo = recurringWorkOrder.subcontractorId;
          standardWorkOrderData.assignedToName = recurringWorkOrder.subcontractorName;
          standardWorkOrderData.assignedToEmail = recurringWorkOrder.subcontractorEmail;
          standardWorkOrderData.assignedAt = serverTimestamp();
          standardWorkOrderData.status = 'assigned';
        }

        // Add timeline event
        standardWorkOrderData.timeline = [createTimelineEvent({
          type: 'created',
          userId: 'system',
          userName: 'Recurring Work Order System',
          userRole: 'system',
          details: `Work order created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}`,
          metadata: { source: 'recurring_work_order', recurringWorkOrderId, executionNumber },
        })];
        standardWorkOrderData.systemInformation = {
          createdBy: { id: 'system', name: 'Recurring Work Order System', role: 'system', timestamp: Timestamp.now() },
        };

        // Create the Standard Work Order
        const standardWorkOrderRef = await addDoc(collection(db, 'workOrders'), standardWorkOrderData);
        console.log(`Created Standard Work Order ${standardWorkOrderNumber} (ID: ${standardWorkOrderRef.id}) for Execution #${executionNumber}`);

        // Update execution with work order reference
        await updateDoc(doc(db, 'recurringWorkOrderExecutions', executionId), {
          workOrderId: standardWorkOrderRef.id,
          workOrderNumber: standardWorkOrderNumber,
          updatedAt: serverTimestamp(),
        });

        results.created++;
      } catch (error: any) {
        console.error(`Error creating work order for execution ${executionId}:`, error);
        results.errors.push({
          executionId,
          executionNumber: execution.executionNumber,
          error: error.message || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${results.created} work orders out of ${results.total} executions`,
      results,
    });
  } catch (error: any) {
    console.error('Error creating execution work orders:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create execution work orders' },
      { status: 500 }
    );
  }
}
