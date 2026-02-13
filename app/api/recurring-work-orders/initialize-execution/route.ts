import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, serverTimestamp, doc, getDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { recurringWorkOrderId, scheduledDate } = await request.json();

    if (!recurringWorkOrderId || !scheduledDate) {
      return NextResponse.json({ error: 'Recurring work order ID and scheduled date are required' }, { status: 400 });
    }

    // Get the recurring work order
    const recurringWorkOrderRef = doc(db, 'recurringWorkOrders', recurringWorkOrderId);
    const recurringWorkOrderSnap = await getDoc(recurringWorkOrderRef);

    if (!recurringWorkOrderSnap.exists()) {
      return NextResponse.json({ error: 'Recurring work order not found' }, { status: 404 });
    }

    const recurringWorkOrder = recurringWorkOrderSnap.data();

    // Convert scheduled date to Date object
    const dateObj = new Date(scheduledDate);

    // Check if execution already exists for this date
    const executionsQuery = query(
      collection(db, 'recurringWorkOrderExecutions'),
      where('recurringWorkOrderId', '==', recurringWorkOrderId)
    );
    const executionsSnapshot = await getDocs(executionsQuery);

    // Find if there's already an execution for this date
    const existingExecution = executionsSnapshot.docs.find(doc => {
      const execDate = doc.data().scheduledDate?.toDate();
      return execDate && execDate.toDateString() === dateObj.toDateString();
    });

    if (existingExecution) {
      return NextResponse.json({
        error: 'Execution already exists for this date',
        executionId: existingExecution.id,
        workOrderId: existingExecution.data().workOrderId
      }, { status: 400 });
    }

    // Calculate execution number
    const executionNumber = executionsSnapshot.docs.length + 1;

    // Create execution record
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
    console.log(`Created execution #${executionNumber} (ID: ${executionRef.id}) for date ${dateObj.toDateString()}`);

    // Create Standard Work Order for this execution
    const standardWorkOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}-EX${executionNumber}`;
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
      description: `${recurringWorkOrder.description || recurringWorkOrder.title}\n\nThis work order was created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}. Scheduled Date: ${dateObj.toLocaleDateString()}.`,
      category: recurringWorkOrder.category,
      categoryId: recurringWorkOrder.categoryId || '',
      priority: recurringWorkOrder.priority || 'medium',
      estimateBudget: recurringWorkOrder.estimateBudget || null,
      status: 'approved', // Start as approved since it's from a recurring work order
      images: [],
      scheduledServiceDate: Timestamp.fromDate(dateObj),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Link back to recurring work order and execution
      recurringWorkOrderId: recurringWorkOrderId,
      recurringWorkOrderNumber: recurringWorkOrder.workOrderNumber,
      executionId: executionRef.id,
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
    await updateDoc(executionRef, {
      workOrderId: standardWorkOrderRef.id,
      workOrderNumber: standardWorkOrderNumber,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: `Execution #${executionNumber} initialized with work order`,
      executionId: executionRef.id,
      workOrderId: standardWorkOrderRef.id,
      workOrderNumber: standardWorkOrderNumber,
    });
  } catch (error: any) {
    console.error('Error initializing execution:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize execution' },
      { status: 500 }
    );
  }
}
