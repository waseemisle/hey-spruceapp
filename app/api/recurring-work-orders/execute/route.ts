import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { recurringWorkOrderId } = await request.json();

    if (!recurringWorkOrderId) {
      return NextResponse.json({ error: 'Recurring work order ID is required' }, { status: 400 });
    }

    // Get the recurring work order
    const recurringWorkOrderDoc = await getDocs(
      query(collection(db, 'recurringWorkOrders'), where('id', '==', recurringWorkOrderId))
    );

    if (recurringWorkOrderDoc.empty) {
      return NextResponse.json({ error: 'Recurring work order not found' }, { status: 404 });
    }

    const recurringWorkOrder = recurringWorkOrderDoc.docs[0].data();
    const recurringWorkOrderRef = recurringWorkOrderDoc.docs[0].ref;

    // Check if it's time to execute
    const now = new Date();
    const nextExecution = recurringWorkOrder.nextExecution?.toDate();
    
    if (!nextExecution || now < nextExecution) {
      return NextResponse.json({ message: 'Not time to execute yet' }, { status: 200 });
    }

    // Check if recurring work order is active
    if (recurringWorkOrder.status !== 'active') {
      return NextResponse.json({ message: 'Recurring work order is not active' }, { status: 200 });
    }

    // Create execution record
    const executionNumber = recurringWorkOrder.totalExecutions + 1;
    const executionData = {
      recurringWorkOrderId: recurringWorkOrderId,
      executionNumber,
      scheduledDate: nextExecution,
      status: 'pending',
      emailSent: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const executionRef = await addDoc(collection(db, 'recurringWorkOrderExecutions'), executionData);

    try {
      // TODO: Replace placeholders with real PDF generation and upload logic
      const workOrderPdfUrl = `https://example.com/pdf/work-order-${recurringWorkOrder.workOrderNumber}-${executionNumber}.pdf`;
      const invoicePdfUrl = `https://example.com/pdf/invoice-${Date.now()}.pdf`;

      // Create Stripe payment link (you'll need to implement this)
      const stripePaymentLink = await createStripePaymentLink({
        amount: recurringWorkOrder.estimateBudget || 0,
        description: recurringWorkOrder.title,
        clientEmail: recurringWorkOrder.clientEmail,
      });

      // Update execution with generated documents
      await updateDoc(executionRef, {
        workOrderPdfUrl,
        invoicePdfUrl,
        stripePaymentLink,
        status: 'executed',
        executedDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send email with attachments
      await sendRecurringWorkOrderEmail({
        clientEmail: recurringWorkOrder.clientEmail,
        clientName: recurringWorkOrder.clientName,
        workOrderTitle: recurringWorkOrder.title,
        workOrderDescription: recurringWorkOrder.description,
        workOrderPdfUrl,
        invoicePdfUrl,
        stripePaymentLink,
        executionNumber,
      });

      // Update execution with email sent status
      await updateDoc(executionRef, {
        emailSent: true,
        emailSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Calculate next execution date
      const nextExecutionDate = calculateNextExecution(
        recurringWorkOrder.recurrencePattern,
        nextExecution
      );

      // Update recurring work order
      await updateDoc(recurringWorkOrderRef, {
        totalExecutions: recurringWorkOrder.totalExecutions + 1,
        successfulExecutions: recurringWorkOrder.successfulExecutions + 1,
        lastExecution: serverTimestamp(),
        nextExecution: nextExecutionDate,
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({ 
        message: 'Recurring work order executed successfully',
        executionId: executionRef.id,
        nextExecution: nextExecutionDate
      });

    } catch (error) {
      console.error('Error executing recurring work order:', error);
      
      // Update execution with failure status
      await updateDoc(executionRef, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: serverTimestamp(),
      });

      // Update recurring work order with failed execution
      await updateDoc(recurringWorkOrderRef, {
        failedExecutions: recurringWorkOrder.failedExecutions + 1,
        updatedAt: serverTimestamp(),
      });

      return NextResponse.json({ 
        error: 'Failed to execute recurring work order',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in recurring work order execution:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

function calculateNextExecution(recurrencePattern: any, currentExecution: Date): Date {
  const next = new Date(currentExecution);
  
  switch (recurrencePattern.type) {
    case 'daily':
      next.setDate(next.getDate() + recurrencePattern.interval);
      break;
    case 'weekly':
      next.setDate(next.getDate() + (7 * recurrencePattern.interval));
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + recurrencePattern.interval);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + recurrencePattern.interval);
      break;
    default:
      // For custom patterns, you might need more complex logic
      next.setDate(next.getDate() + 7); // Default to weekly
  }
  
  return next;
}

async function createStripePaymentLink(data: {
  amount: number;
  description: string;
  clientEmail: string;
}): Promise<string> {
  // This is a placeholder - you'll need to implement actual Stripe integration
  // For now, return a placeholder URL
  return `https://checkout.stripe.com/pay/placeholder_${Date.now()}`;
}

async function sendRecurringWorkOrderEmail(data: {
  clientEmail: string;
  clientName: string;
  workOrderTitle: string;
  workOrderDescription: string;
  workOrderPdfUrl: string;
  invoicePdfUrl: string;
  stripePaymentLink: string;
  executionNumber: number;
}): Promise<void> {
  // This is a placeholder - you'll need to implement actual email sending
  // You can use your existing email service (SendGrid, AWS SES, etc.)
  console.log('Sending recurring work order email:', data);
  
  // For now, just log the email details
  console.log(`Email to: ${data.clientEmail}`);
  console.log(`Subject: Recurring Work Order #${data.executionNumber} - ${data.workOrderTitle}`);
  console.log(`Work Order PDF: ${data.workOrderPdfUrl}`);
  console.log(`Invoice PDF: ${data.invoicePdfUrl}`);
  console.log(`Payment Link: ${data.stripePaymentLink}`);
}
