import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, updateDoc, serverTimestamp, doc, getDoc, Timestamp } from 'firebase/firestore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { executionId } = await request.json();

    if (!executionId) {
      return NextResponse.json({ error: 'Execution ID is required' }, { status: 400 });
    }

    // Get the execution
    const executionRef = doc(db, 'recurringWorkOrderExecutions', executionId);
    const executionSnap = await getDoc(executionRef);

    if (!executionSnap.exists()) {
      return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
    }

    const execution = executionSnap.data();

    // Check if work order already exists
    if (execution.workOrderId) {
      return NextResponse.json({
        error: 'Work order already exists for this execution',
        workOrderId: execution.workOrderId
      }, { status: 400 });
    }

    // Get the recurring work order
    const recurringWorkOrderRef = doc(db, 'recurringWorkOrders', execution.recurringWorkOrderId);
    const recurringWorkOrderSnap = await getDoc(recurringWorkOrderRef);

    if (!recurringWorkOrderSnap.exists()) {
      return NextResponse.json({ error: 'Recurring work order not found' }, { status: 404 });
    }

    const recurringWorkOrder = recurringWorkOrderSnap.data();

    // Get scheduled date
    const scheduledDate = execution.scheduledDate?.toDate() || new Date();
    const executionNumber = execution.executionNumber || 1;

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
      recurringWorkOrderId: execution.recurringWorkOrderId,
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
      message: 'Work order created successfully',
      workOrderId: standardWorkOrderRef.id,
      workOrderNumber: standardWorkOrderNumber,
    });
  } catch (error: any) {
    console.error('Error creating execution work order:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create execution work order' },
      { status: 500 }
    );
  }
}
