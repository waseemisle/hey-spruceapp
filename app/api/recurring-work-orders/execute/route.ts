import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, Timestamp } from 'firebase/firestore';
import { createTimelineEvent } from '@/lib/timeline';
import Stripe from 'stripe';
import { generateInvoicePDF, getInvoicePDFBase64, getWorkOrderPDFBase64 } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { recurringWorkOrderId, executionId } = await request.json();

    if (!recurringWorkOrderId) {
      return NextResponse.json({ error: 'Recurring work order ID is required' }, { status: 400 });
    }

    // Get the recurring work order by document ID
    const recurringWorkOrderRef = doc(db, 'recurringWorkOrders', recurringWorkOrderId);
    const recurringWorkOrderSnap = await getDoc(recurringWorkOrderRef);

    if (!recurringWorkOrderSnap.exists()) {
      return NextResponse.json({ error: 'Recurring work order not found' }, { status: 404 });
    }

    const recurringWorkOrder = recurringWorkOrderSnap.data();

    // Check if recurring work order is active
    if (recurringWorkOrder.status !== 'active') {
      return NextResponse.json({ message: 'Recurring work order is not active' }, { status: 200 });
    }

    let executionRef;
    let executionNumber;
    let nextExecution: Date;

    // If executionId is provided, execute the existing execution
    if (executionId) {
      const existingExecutionRef = doc(db, 'recurringWorkOrderExecutions', executionId);
      const existingExecutionSnap = await getDoc(existingExecutionRef);

      if (!existingExecutionSnap.exists()) {
        return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
      }

      const existingExecution = existingExecutionSnap.data();

      // Verify it belongs to this recurring work order
      if (existingExecution.recurringWorkOrderId !== recurringWorkOrderId) {
        return NextResponse.json({ error: 'Execution does not belong to this recurring work order' }, { status: 400 });
      }

      // Check if execution is pending
      if (existingExecution.status !== 'pending') {
        return NextResponse.json({ error: `Execution is already ${existingExecution.status}` }, { status: 400 });
      }

      executionRef = existingExecutionRef;
      executionNumber = existingExecution.executionNumber;
      nextExecution = existingExecution.scheduledDate?.toDate() || new Date();
    } else {
      // Create new execution record (original behavior)
      const now = new Date();
      nextExecution = recurringWorkOrder.nextExecution?.toDate() || now;
      executionNumber = recurringWorkOrder.totalExecutions + 1;
      const executionData = {
        recurringWorkOrderId: recurringWorkOrderId,
        executionNumber,
        scheduledDate: nextExecution,
        status: 'pending',
        emailSent: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      executionRef = await addDoc(collection(db, 'recurringWorkOrderExecutions'), executionData);
    }

    try {
      // Generate invoice PDF
      const invoiceData = {
        invoiceNumber: `${recurringWorkOrder.workOrderNumber}-${executionNumber}`,
        clientName: recurringWorkOrder.clientName,
        clientEmail: recurringWorkOrder.clientEmail,
        clientAddress: recurringWorkOrder.clientAddress,
        workOrderName: recurringWorkOrder.title,
        serviceDescription: recurringWorkOrder.description,
        lineItems: [{
          description: recurringWorkOrder.title,
          quantity: 1,
          unitPrice: recurringWorkOrder.estimateBudget || 0,
          amount: recurringWorkOrder.estimateBudget || 0,
        }],
        subtotal: recurringWorkOrder.estimateBudget || 0,
        discountAmount: 0,
        totalAmount: recurringWorkOrder.estimateBudget || 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 30 days from now
        notes: recurringWorkOrder.description,
        terms: 'Payment due within 30 days of invoice date.',
      };

      const invoicePdfBase64 = getInvoicePDFBase64(invoiceData);
      
      // Generate work order PDF
      const workOrderData = {
        workOrderNumber: recurringWorkOrder.workOrderNumber,
        clientName: recurringWorkOrder.clientName,
        clientEmail: recurringWorkOrder.clientEmail,
        clientAddress: recurringWorkOrder.clientAddress,
        locationName: recurringWorkOrder.locationName,
        locationAddress: recurringWorkOrder.locationAddress,
        title: recurringWorkOrder.title,
        description: recurringWorkOrder.description,
        category: recurringWorkOrder.category,
        priority: recurringWorkOrder.priority,
        estimateBudget: recurringWorkOrder.estimateBudget,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(), // 7 days from now
        notes: recurringWorkOrder.description,
        terms: 'Work order must be completed within the specified timeframe. Contact us for any questions or concerns.',
      };

      const workOrderPdfBase64 = getWorkOrderPDFBase64(workOrderData);
      
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
        description: `${recurringWorkOrder.description}\n\nThis work order was created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}. Scheduled Date: ${nextExecution.toLocaleDateString()}.`,
        category: recurringWorkOrder.category,
        categoryId: recurringWorkOrder.categoryId || '',
        priority: recurringWorkOrder.priority,
        estimateBudget: recurringWorkOrder.estimateBudget,
        status: 'approved', // Start as approved since it's from a recurring work order
        images: [],
        scheduledServiceDate: nextExecution,
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
      
      // Create Stripe payment link
      const stripePaymentLink = await createStripePaymentLink({
        amount: recurringWorkOrder.estimateBudget || 0,
        description: recurringWorkOrder.title,
        clientEmail: recurringWorkOrder.clientEmail,
        clientName: recurringWorkOrder.clientName,
        invoiceNumber: invoiceData.invoiceNumber,
      });

      // Update execution with metadata (not storing large PDF data in Firestore)
      await updateDoc(executionRef, {
        invoiceNumber: invoiceData.invoiceNumber,
        stripePaymentLink,
        status: 'executed',
        executedDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
        workOrderId: standardWorkOrderRef.id, // Link to the created Standard Work Order
        workOrderNumber: standardWorkOrderNumber,
        // Store invoice data for PDF generation on-demand
        invoiceData: {
          invoiceNumber: invoiceData.invoiceNumber,
          clientName: invoiceData.clientName,
          clientEmail: invoiceData.clientEmail,
          totalAmount: invoiceData.totalAmount,
          dueDate: invoiceData.dueDate,
          workOrderTitle: recurringWorkOrder.title,
        },
        // Store work order data for PDF generation on-demand
        workOrderData: {
          workOrderNumber: recurringWorkOrder.workOrderNumber,
          clientName: recurringWorkOrder.clientName,
          clientEmail: recurringWorkOrder.clientEmail,
          locationName: recurringWorkOrder.locationName,
          title: recurringWorkOrder.title,
          description: recurringWorkOrder.description,
          category: recurringWorkOrder.category,
          priority: recurringWorkOrder.priority,
          estimateBudget: recurringWorkOrder.estimateBudget,
        },
      });

      // Send email with attachments using the existing email service
      const emailResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/email/send-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toEmail: recurringWorkOrder.clientEmail,
          toName: recurringWorkOrder.clientName,
          invoiceNumber: invoiceData.invoiceNumber,
          workOrderTitle: recurringWorkOrder.title,
          totalAmount: invoiceData.totalAmount,
          dueDate: invoiceData.dueDate,
          lineItems: invoiceData.lineItems,
          notes: invoiceData.notes,
          stripePaymentLink,
          pdfBase64: invoicePdfBase64,
          workOrderPdfBase64: workOrderPdfBase64,
        }),
      });

      if (!emailResponse.ok) {
        console.error('Failed to send email:', await emailResponse.text());
        // Continue execution even if email fails
      }

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
      const updateData: any = {
        lastExecution: serverTimestamp(),
        nextExecution: nextExecutionDate,
        updatedAt: serverTimestamp(),
      };

      if (!executionId) {
        // For new executions, increment both counters
        updateData.totalExecutions = recurringWorkOrder.totalExecutions + 1;
        updateData.successfulExecutions = recurringWorkOrder.successfulExecutions + 1;
      } else {
        // For existing execution, increment both counters as we're completing a pending execution
        updateData.totalExecutions = (recurringWorkOrder.totalExecutions || 0) + 1;
        updateData.successfulExecutions = (recurringWorkOrder.successfulExecutions || 0) + 1;
      }

      await updateDoc(recurringWorkOrderRef, updateData);

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
  clientName: string;
  invoiceNumber: string;
}): Promise<string> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    console.error('Stripe secret key not found in environment variables');
    return `https://checkout.stripe.com/pay/error_no_key_${Date.now()}`;
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });

  try {
    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: data.description,
              description: `Recurring Work Order - ${data.invoiceNumber}`,
            },
            unit_amount: Math.round(data.amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: data.clientEmail,
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://hey-spruce-appv2.vercel.app'}/payment-cancelled`,
      metadata: {
        invoiceNumber: data.invoiceNumber,
        clientName: data.clientName,
        type: 'recurring-work-order',
      },
    });

    return session.url || '';
  } catch (error) {
    console.error('Stripe error:', error);
    // Return a fallback URL or handle the error appropriately
    return `https://checkout.stripe.com/pay/error_${Date.now()}`;
  }
}

