import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';
import { generateInvoicePDF, getInvoicePDFBase64, getWorkOrderPDFBase64 } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { recurringWorkOrderId } = await request.json();

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

    // For manual execution, we don't check the scheduled time
    const now = new Date();
    const nextExecution = recurringWorkOrder.nextExecution?.toDate() || now;

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
        taxRate: 0,
        taxAmount: 0,
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

