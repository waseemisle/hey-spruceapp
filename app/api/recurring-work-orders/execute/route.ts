import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { createTimelineEvent } from '@/lib/timeline';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import Stripe from 'stripe';
import { generateInvoicePDF, getInvoicePDFBase64, getWorkOrderPDFBase64 } from '@/lib/pdf-generator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  // Verify CRON_SECRET bearer token (only when Authorization header is present)
  // Admin portal calls don't send auth headers — they're same-origin internal calls
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const db = await getServerDb();
    const { recurringWorkOrderId, executionId, scheduledDate: scheduledDateStr, triggeredBy: triggeredByParam } = await request.json();
    const triggeredBy = triggeredByParam || 'manual_api';

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
      // Create new execution record — count existing executions for proper numbering
      const existingExecsSnap = await getDocs(
        query(collection(db, 'recurringWorkOrderExecutions'), where('recurringWorkOrderId', '==', recurringWorkOrderId))
      );
      executionNumber = existingExecsSnap.docs.length + 1;

      const now = new Date();
      // Use the explicitly provided scheduledDate if available (from frontend pattern computation)
      // Fall back to the Firestore nextExecution field, then today
      nextExecution = scheduledDateStr ? new Date(scheduledDateStr)
        : recurringWorkOrder.nextExecution?.toDate() || now;

      // ── Idempotency guard ──
      // Block when an execution for this RWO + same scheduled date is
      // already in 'executed' state. Prevents duplicate Firestore
      // invoices + duplicate Stripe charges when:
      //   • Cron retries on the same day (rare — the cron has its own
      //     23h lock — but still defensive)
      //   • Admin clicks "Execute Now" after cron already ran today
      //   • Manual "Execute Now" is double-clicked
      const sameDayExisting = existingExecsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .find((ex) => {
          if (ex.status !== 'executed') return false;
          const exDate = ex.executedDate?.toDate?.() || ex.scheduledDate?.toDate?.();
          if (!exDate) return false;
          return exDate.getFullYear() === nextExecution.getFullYear()
            && exDate.getMonth() === nextExecution.getMonth()
            && exDate.getDate() === nextExecution.getDate();
        });
      if (sameDayExisting) {
        console.log(
          `[rwo-execute] Skipping ${recurringWorkOrderId} — execution #${sameDayExisting.executionNumber} already ran on ${nextExecution.toDateString()}`,
        );
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: 'already_executed_today',
          existingExecutionId: sameDayExisting.id,
          existingInvoiceId: sameDayExisting.invoiceId || null,
          message: `Execution #${sameDayExisting.executionNumber} already ran on ${nextExecution.toDateString()}; skipped to avoid duplicate invoice.`,
        });
      }

      const executionData = {
        recurringWorkOrderId: recurringWorkOrderId,
        executionNumber,
        scheduledDate: nextExecution,
        status: 'pending',
        emailSent: false,
        triggeredBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      executionRef = await addDoc(collection(db, 'recurringWorkOrderExecutions'), executionData);
    }

    try {
      // Generate invoice PDF
      const invoiceData = {
        invoiceNumber: generateInvoiceNumber(),
        clientName: recurringWorkOrder.clientName,
        clientEmail: recurringWorkOrder.clientEmail,
        clientAddress: recurringWorkOrder.clientAddress || '',
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
        clientAddress: recurringWorkOrder.clientAddress || '',
        locationName: recurringWorkOrder.locationName,
        locationAddress: recurringWorkOrder.locationAddress,
        title: recurringWorkOrder.title,
        description: recurringWorkOrder.description,
        category: recurringWorkOrder.category,
        priority: recurringWorkOrder.priority,
        estimateBudget: recurringWorkOrder.estimateBudget ?? null,
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
        title: `${recurringWorkOrder.title} - ${nextExecution.toLocaleDateString('en-US')} - #${executionNumber}`,
        description: `${recurringWorkOrder.description}\n\nThis work order was created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}. Scheduled Date: ${nextExecution.toLocaleDateString()}.`,
        category: recurringWorkOrder.category,
        categoryId: recurringWorkOrder.categoryId || '',
        priority: recurringWorkOrder.priority,
        estimateBudget: recurringWorkOrder.estimateBudget ?? null,
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

      // If a subcontractor is pre-assigned on the RWO, auto-share the execution
      // work order for bidding with that subcontractor (mirrors the CSV import flow).
      // Falls back to resolving the auth UID from the subcontractor doc for legacy
      // RWOs that predate the preAssignedSubcontractorId field.
      let preAssignedSubAuthId: string | null = null;
      let preAssignedSubEmail = '';
      let preAssignedSubName = '';
      if (recurringWorkOrder.subcontractorId) {
        preAssignedSubAuthId = (recurringWorkOrder.preAssignedSubcontractorId as string) || null;
        preAssignedSubName = recurringWorkOrder.preAssignedSubcontractorName
          || recurringWorkOrder.subcontractorName || '';
        preAssignedSubEmail = recurringWorkOrder.preAssignedSubcontractorEmail
          || recurringWorkOrder.subcontractorEmail || '';
        if (!preAssignedSubAuthId || !preAssignedSubEmail || !preAssignedSubName) {
          try {
            const subDoc = await getDoc(doc(db, 'subcontractors', recurringWorkOrder.subcontractorId));
            if (subDoc.exists()) {
              const subData = subDoc.data();
              preAssignedSubAuthId = preAssignedSubAuthId
                || (subData.uid && String(subData.uid).trim())
                || recurringWorkOrder.subcontractorId;
              preAssignedSubName = preAssignedSubName || subData.fullName || '';
              preAssignedSubEmail = preAssignedSubEmail || subData.email || '';
            }
          } catch (err) {
            console.warn('Could not resolve pre-assigned subcontractor for RWO execution', err);
          }
        }
        if (preAssignedSubAuthId) {
          standardWorkOrderData.status = 'bidding';
          standardWorkOrderData.biddingSubcontractors = [preAssignedSubAuthId];
          standardWorkOrderData.sharedForBiddingAt = serverTimestamp();
          standardWorkOrderData.preAssignedSubcontractorId = preAssignedSubAuthId;
          standardWorkOrderData.preAssignedSubcontractorName = preAssignedSubName;
          standardWorkOrderData.preAssignedFromRecurring = true;
        }
      }

      // Add timeline event(s)
      const timelineEvents: any[] = [createTimelineEvent({
        type: 'created',
        userId: 'system',
        userName: 'Recurring Work Order System',
        userRole: 'system',
        details: `Work order created from Recurring Work Order ${recurringWorkOrder.workOrderNumber}, Execution #${executionNumber}`,
        metadata: { source: 'recurring_work_order', recurringWorkOrderId, executionNumber },
      })];
      if (preAssignedSubAuthId) {
        timelineEvents.push(createTimelineEvent({
          type: 'shared_for_bidding',
          userId: 'system',
          userName: 'Recurring Work Order System',
          userRole: 'system',
          details: `Auto-shared for bidding with pre-assigned subcontractor: ${preAssignedSubName || 'Unknown'}`,
          metadata: {
            source: 'recurring_work_order',
            subcontractorIds: [preAssignedSubAuthId],
            subcontractorCount: 1,
            preAssigned: true,
          },
        }));
      }
      standardWorkOrderData.timeline = timelineEvents;
      standardWorkOrderData.systemInformation = {
        createdBy: { id: 'system', name: 'Recurring Work Order System', role: 'system', timestamp: Timestamp.now() },
      };

      // Create the Standard Work Order
      const standardWorkOrderRef = await addDoc(collection(db, 'workOrders'), standardWorkOrderData);
      console.log(`Created Standard Work Order ${standardWorkOrderNumber} (ID: ${standardWorkOrderRef.id}) for Execution #${executionNumber}`);

      // If pre-assigned, create the biddingWorkOrders doc and email the subcontractor
      // (same pattern as the "Share for Bidding" button and CSV import).
      if (preAssignedSubAuthId) {
        try {
          await addDoc(collection(db, 'biddingWorkOrders'), {
            workOrderId: standardWorkOrderRef.id,
            workOrderNumber: standardWorkOrderNumber,
            subcontractorId: preAssignedSubAuthId,
            subcontractorName: preAssignedSubName,
            subcontractorEmail: preAssignedSubEmail,
            workOrderTitle: standardWorkOrderData.title,
            workOrderDescription: standardWorkOrderData.description,
            clientId: standardWorkOrderData.clientId,
            clientName: standardWorkOrderData.clientName || '',
            priority: standardWorkOrderData.priority || '',
            category: standardWorkOrderData.category || '',
            locationName: standardWorkOrderData.locationName || '',
            locationAddress: standardWorkOrderData.locationAddress || '',
            images: standardWorkOrderData.images || [],
            status: 'pending',
            sharedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            preAssigned: true,
            recurringWorkOrderId,
            recurringWorkOrderNumber: recurringWorkOrder.workOrderNumber,
          });
        } catch (bidErr) {
          console.warn('Failed to create biddingWorkOrders doc for cron execution', bidErr);
        }

        if (preAssignedSubEmail) {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL
            || process.env.NEXT_PUBLIC_BASE_URL
            || 'http://localhost:3000';
          fetch(`${baseUrl}/api/email/send-bidding-opportunity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toEmail: preAssignedSubEmail,
              toName: preAssignedSubName,
              workOrderNumber: standardWorkOrderNumber,
              workOrderTitle: standardWorkOrderData.title,
              workOrderDescription: standardWorkOrderData.description,
              locationName: standardWorkOrderData.locationName,
              category: standardWorkOrderData.category,
              priority: standardWorkOrderData.priority,
              portalLink: `${baseUrl}/subcontractor-portal/bidding`,
            }),
          }).catch(err =>
            console.error('Failed to send bidding opportunity email (cron execution):', err),
          );
        }
      }

      // Send email notifications to admins with work order emails enabled
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/email/send-work-order-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: standardWorkOrderRef.id,
          workOrderNumber: standardWorkOrderNumber,
          title: standardWorkOrderData.title,
          clientName: recurringWorkOrder.clientName,
          locationName: recurringWorkOrder.locationName,
          priority: recurringWorkOrder.priority,
          workOrderType: 'recurring',
          description: recurringWorkOrder.description,
        }),
      }).catch(err => console.error('Failed to send recurring WO notification emails:', err));

      // ── Create Firestore invoice doc + auto-charge (or email link) ─────
      // Earlier this path skipped creating an invoices/{id} document
      // entirely — it built the PDF in memory, made an ad-hoc Stripe
      // invoice, and emailed the link. That meant:
      //   • The client portal /invoices page never saw the invoice
      //   • The Stripe webhook had no metadata.invoiceId to match → paid
      //     state never synced back to Firestore
      //   • Auto-pay was impossible because there was no invoice doc to
      //     charge against
      //
      // Now we create a real invoices/{id} row first, then call the
      // canonical /api/stripe/create-payment-link route with
      // autoCharge:true. That route routes to Stripe's
      // collection_method=charge_automatically when the client has a
      // saved default payment method (off-session charge at finalize),
      // or falls back to send_invoice (emailed hosted link) otherwise.
      // ────────────────────────────────────────────────────────────────
      const dueDateTimestamp = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const firestoreInvoiceRef = await addDoc(collection(db, 'invoices'), {
        invoiceNumber: invoiceData.invoiceNumber,
        clientId: recurringWorkOrder.clientId || '',
        clientName: recurringWorkOrder.clientName || '',
        clientEmail: recurringWorkOrder.clientEmail || '',
        workOrderId: standardWorkOrderRef.id,
        workOrderTitle: recurringWorkOrder.title || '',
        workOrderDescription: recurringWorkOrder.description || '',
        category: recurringWorkOrder.category || '',
        priority: recurringWorkOrder.priority || '',
        status: 'sent',
        totalAmount: Number(invoiceData.totalAmount) || 0,
        lineItems: invoiceData.lineItems,
        dueDate: dueDateTimestamp,
        notes: invoiceData.notes || '',
        terms: invoiceData.terms || '',
        creationSource: 'recurring' as const,
        recurringWorkOrderId,
        recurringExecutionId: executionRef.id,
        recurringExecutionNumber: executionNumber,
        createdBy: 'system',
        createdByName: 'Recurring Work Order System',
        timeline: [createTimelineEvent({
          type: 'created',
          userId: 'system',
          userName: 'Recurring Work Order System',
          userRole: 'system',
          details: `Invoice generated by RWO ${recurringWorkOrder.workOrderNumber} execution #${executionNumber}`,
          metadata: { source: 'recurring_work_order', recurringWorkOrderId, executionNumber },
        })],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Mint the hosted Stripe invoice (with auto-charge if client has a
      // saved default PM). Failures here are logged but do not block the
      // Firestore invoice or the customer email — the admin can manually
      // generate the link from the invoice detail page.
      let stripePaymentLink = '';
      let autoChargeOutcome: { attempted: boolean; outcome?: string; reason?: string } = { attempted: false };
      try {
        const baseUrlForStripe = process.env.NEXT_PUBLIC_APP_URL
          || process.env.NEXT_PUBLIC_BASE_URL
          || 'http://localhost:3000';
        const linkRes = await fetch(`${baseUrlForStripe}/api/stripe/create-payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: firestoreInvoiceRef.id,
            // Cron path: always request auto-charge. The route gracefully
            // downgrades to send_invoice when the client has no saved
            // default payment method.
            autoCharge: true,
          }),
        });
        if (linkRes.ok) {
          const data = await linkRes.json();
          stripePaymentLink = data.paymentLink || '';
          autoChargeOutcome = data.autoCharge || { attempted: false };
        } else {
          console.error('[rwo-execute] create-payment-link returned', linkRes.status, await linkRes.text());
        }
      } catch (linkErr) {
        console.error('[rwo-execute] create-payment-link fetch failed:', linkErr);
      }

      // Update execution with metadata (not storing large PDF data in Firestore)
      await updateDoc(executionRef, {
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceId: firestoreInvoiceRef.id,
        stripePaymentLink,
        autoChargeAttempted: autoChargeOutcome.attempted,
        autoChargeOutcome: autoChargeOutcome.outcome || autoChargeOutcome.reason || null,
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
          estimateBudget: recurringWorkOrder.estimateBudget ?? null,
        },
      });

      // ── Customer email routing — skip on auto-charge success ──
      // If the saved card was auto-charged successfully, sending the
      // standard "Payment Due" email would confuse the client (their
      // card already moved). Stripe sends its own receipt email for
      // paid invoices when the customer object has email set. So:
      //   • auto-charge SUCCEEDED → skip our send-invoice email
      //     (Stripe receipt covers the customer comms)
      //   • auto-charge FAILED → send our email with the hosted
      //     payment link so the customer can finish the payment
      //   • auto-charge NOT ATTEMPTED (no saved card) → send our email
      //     with the link as before (existing behavior)
      // Admins are notified separately on failure so ops can intervene.
      // ──────────────────────────────────────────────────────────────
      const autoChargeSucceeded = autoChargeOutcome.attempted && autoChargeOutcome.outcome === 'succeeded';
      const autoChargeFailed = autoChargeOutcome.attempted && (autoChargeOutcome.outcome === 'failed' || autoChargeOutcome.outcome === 'requires_action');
      let emailResponse: Response | null = null;

      if (!autoChargeSucceeded) {
        // TODO(invoice-approval): recurring executions currently send the invoice
        // email immediately even when the client's company has
        // invoiceApprovalRequired=true. Recurring runs are pre-arranged so
        // bypassing the 72h gate may be intentional — confirm with product before
        // routing through the approval workflow. See /lib/invoice-approval.ts.
        emailResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/email/send-invoice`, {
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
            invoiceId: firestoreInvoiceRef.id,
            pdfBase64: invoicePdfBase64,
            workOrderPdfBase64: workOrderPdfBase64,
            subcontractorId: recurringWorkOrder.subcontractorId || undefined,
          }),
        });

        if (!emailResponse.ok) {
          console.error('Failed to send email:', await emailResponse.text());
          // Continue execution even if email fails
        }
      } else {
        console.log(`[rwo-execute] Skipped customer email — invoice ${invoiceData.invoiceNumber} was auto-charged successfully; Stripe will send receipt.`);
      }

      // ── Admin notification on auto-charge failure ──
      // When the saved card declines (or 3DS challenge), ops needs to
      // know so they can call/email the client or update the card on
      // file. Fire-and-forget — don't block execution.
      if (autoChargeFailed) {
        try {
          const { createNotification, getAllAdminUserIds } = await import('@/lib/notifications');
          const adminIds = await getAllAdminUserIds();
          if (adminIds.length > 0) {
            await createNotification({
              recipientIds: adminIds,
              userRole: 'admin',
              type: 'invoice',
              title: 'Auto-charge failed',
              message: `Recurring invoice ${invoiceData.invoiceNumber} for ${recurringWorkOrder.clientName} (${recurringWorkOrder.title}) — card ${autoChargeOutcome.outcome === 'requires_action' ? 'requires authentication' : 'was declined'}. Customer was emailed the hosted payment link.`,
              link: `/admin-portal/invoices/${firestoreInvoiceRef.id}`,
              referenceId: firestoreInvoiceRef.id,
              referenceType: 'invoice',
            });
          }
        } catch (notifyErr) {
          console.warn('[rwo-execute] Failed to notify admins of auto-charge failure (non-fatal):', notifyErr);
        }
      }

      // Update execution with email sent status
      await updateDoc(executionRef, {
        emailSent: !autoChargeSucceeded && emailResponse?.ok === true,
        emailSkippedReason: autoChargeSucceeded ? 'auto_charged_stripe_sends_receipt' : null,
        emailSentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Calculate next execution date — advance exactly one step from the executed date
      const nextExecutionDate = advanceOneStep(recurringWorkOrder, nextExecution);

      // Update recurring work order
      const updateData: any = {
        lastExecution: Timestamp.fromDate(nextExecution),
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

/** Advance exactly one interval step from the given date. No skipping. */
function advanceOneStep(recurringWorkOrder: any, fromDate: Date): Date {
  const next = new Date(fromDate);
  const { mode, interval } = resolveMode(recurringWorkOrder);
  if (mode === 'daily') next.setDate(next.getDate() + interval);
  else if (mode === 'weekly') next.setDate(next.getDate() + (7 * interval));
  else next.setMonth(next.getMonth() + interval);
  return next;
}

function resolveMode(recurringWorkOrder: any): { mode: 'daily' | 'weekly' | 'monthly'; interval: number; daysOfWeek?: number[]; daysOfMonth?: number[] } {
  const label = (recurringWorkOrder.recurrencePatternLabel || '').toUpperCase();
  const pattern = recurringWorkOrder.recurrencePattern || {};
  const daysOfMonth = Array.isArray(pattern.daysOfMonth) ? pattern.daysOfMonth : (pattern.dayOfMonth ? [pattern.dayOfMonth] : undefined);
  switch (label) {
    case 'DAILY':        return { mode: 'daily', interval: 1, daysOfWeek: pattern.daysOfWeek };
    case 'WEEKLY':       return { mode: 'weekly', interval: 1 };
    case 'BI-WEEKLY':    return { mode: 'weekly', interval: 2, daysOfWeek: pattern.daysOfWeek };
    case 'MONTHLY':      return { mode: 'monthly', interval: 1, daysOfMonth };
    case 'BI-MONTHLY':   return { mode: 'monthly', interval: 2, daysOfMonth }; // every 2 months
    case 'QUARTERLY':    return { mode: 'monthly', interval: 3, daysOfMonth };
    case 'SEMIANNUALLY': return { mode: 'monthly', interval: 6, daysOfMonth };
  }
  if (pattern.type === 'daily') return { mode: 'daily', interval: pattern.interval || 1, daysOfWeek: pattern.daysOfWeek };
  if (pattern.type === 'weekly') return { mode: 'weekly', interval: pattern.interval || 2 };
  if (pattern.type === 'monthly') return { mode: 'monthly', interval: pattern.interval || 1, daysOfMonth };
  return { mode: 'monthly', interval: 1 };
}

/** Used by cron: advances and skips past missed dates until future. */
function calculateNextExecution(recurringWorkOrder: any, currentExecution: Date): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const next = new Date(currentExecution);

  // Resolve interval from label first (most reliable), then pattern.type
  const label = (recurringWorkOrder.recurrencePatternLabel || '').toUpperCase();
  const pattern = recurringWorkOrder.recurrencePattern || {};
  let mode: 'daily' | 'weekly' | 'monthly' = 'monthly';
  let interval = 1;

  const daysOfWeek: number[] = Array.isArray(pattern.daysOfWeek) ? pattern.daysOfWeek : [];
  const daysOfMonth: number[] = Array.isArray(pattern.daysOfMonth) ? pattern.daysOfMonth : [];

  switch (label) {
    case 'DAILY':        mode = 'daily'; interval = 1; break;
    case 'WEEKLY':       mode = 'weekly'; interval = 1; break;
    case 'BI-WEEKLY':    mode = 'weekly'; interval = 2; break; // every 2 weeks — uses daysOfWeek
    case 'MONTHLY':      mode = 'monthly'; interval = 1; break;
    case 'BI-MONTHLY':   mode = 'monthly'; interval = 2; break; // every 2 months — uses daysOfMonth
    case 'QUARTERLY':    mode = 'monthly'; interval = 3; break;
    case 'SEMIANNUALLY': mode = 'monthly'; interval = 6; break;
    default:
      if (pattern.type === 'daily') { mode = 'daily'; interval = pattern.interval || 1; }
      else if (pattern.type === 'weekly') { mode = 'weekly'; interval = pattern.interval || 2; }
      else if (pattern.type === 'monthly') { mode = 'monthly'; interval = pattern.interval || 1; }
  }

  const hasDaysFilter = label === 'DAILY' && daysOfWeek.length > 0;
  const hasDaysOfMonth = daysOfMonth.length > 0 && mode === 'monthly';

  // Keep advancing until the next execution is in the future
  let iters = 0;

  if (hasDaysOfMonth) {
    // For monthly patterns with specific days (BI-MONTHLY, MONTHLY with daysOfMonth)
    const sortedDays = [...daysOfMonth].sort((a, b) => a - b);
    // Find the next day in the current or future months
    let cursor = new Date(next);
    cursor.setDate(cursor.getDate() + 1); // advance past current execution date
    while (iters < 200) {
      for (const dom of sortedDays) {
        const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        const actualDay = Math.min(dom, lastDay);
        const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay, next.getHours(), next.getMinutes(), 0, 0);
        if (candidate > next && candidate > now) return candidate;
      }
      // Move to next month (using interval for QUARTERLY/SEMIANNUALLY)
      cursor.setMonth(cursor.getMonth() + interval);
      cursor.setDate(1);
      iters++;
    }
    return next; // fallback
  }

  do {
    if (mode === 'daily') {
      next.setDate(next.getDate() + 1);
      // Skip days not in the daysOfWeek filter
      if (hasDaysFilter) {
        while (!daysOfWeek.includes(next.getDay()) && iters < 100) {
          next.setDate(next.getDate() + 1);
          iters++;
        }
      }
    }
    else if (mode === 'weekly') next.setDate(next.getDate() + (7 * interval));
    else next.setMonth(next.getMonth() + interval);
    iters++;
  } while (next <= now && iters < 100);

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
    return '';
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });

  try {
    // Stripe Invoices need a Customer.
    const customer = await stripe.customers.create({
      email: data.clientEmail,
      name: data.clientName,
      metadata: { invoiceNumber: data.invoiceNumber, type: 'recurring-work-order' },
    });

    // Create the empty invoice first so the InvoiceItem can be attached
    // directly to it. No Memo description — the line item carries the
    // text and Stripe shows it in the breakdown. `number` mirrors the
    // Firestore invoiceNumber on the hosted page; fall back to a
    // timestamped variant on duplicate.
    const baseInvoiceParams: Stripe.InvoiceCreateParams = {
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: false,
      pending_invoice_items_behavior: 'exclude',
      footer: `Invoice ${data.invoiceNumber}`,
      metadata: {
        invoiceNumber: data.invoiceNumber,
        clientName: data.clientName,
        type: 'recurring-work-order',
      },
    };

    let stripeInvoice: Stripe.Invoice;
    try {
      stripeInvoice = await stripe.invoices.create({ ...baseInvoiceParams, number: data.invoiceNumber });
    } catch (firstErr: any) {
      const code = firstErr?.code || firstErr?.raw?.code;
      const msg = String(firstErr?.message || firstErr?.raw?.message || '');
      const isDuplicate =
        code === 'invoice_number_invalid' ||
        code === 'resource_already_exists' ||
        /already exists/i.test(msg) ||
        /already set on another invoice/i.test(msg) ||
        /invoice number/i.test(msg);
      if (!isDuplicate) throw firstErr;
      const suffix = `-r${Math.floor(Date.now() / 1000) % 1000000}`;
      stripeInvoice = await stripe.invoices.create({ ...baseInvoiceParams, number: `${data.invoiceNumber}${suffix}` });
    }

    if (!stripeInvoice.id) return '';

    await stripe.invoiceItems.create({
      customer: customer.id,
      invoice: stripeInvoice.id,
      amount: Math.round(data.amount * 100),
      currency: 'usd',
      description: `${data.description} — ${data.invoiceNumber}`,
      metadata: { invoiceNumber: data.invoiceNumber, type: 'recurring-work-order' },
    });

    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    if (typeof finalized.amount_due === 'number' && finalized.amount_due <= 0) {
      try { await stripe.invoices.voidInvoice(stripeInvoice.id); } catch {}
      return '';
    }
    return finalized.hosted_invoice_url || '';
  } catch (error) {
    console.error('Stripe error:', error);
    return '';
  }
}

