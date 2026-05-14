import { NextRequest, NextResponse } from 'next/server';
import {
  doc, getDoc, addDoc, updateDoc, collection, serverTimestamp, Timestamp, query, where, getDocs,
  increment,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { computeNextExecution } from '@/lib/recurrence';
import type { RecurrencePatternLabel } from '@/lib/recurrence';
import { shouldRequireAdminApproval } from '@/lib/admin-invoice-approval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Execute a single scheduled invoice — fired by:
 *   • the daily cron (/api/scheduled-invoices/cron) for any schedule
 *     whose nextExecution falls in the lead-time window, or
 *   • the admin "Execute Now" button on the SI detail page.
 *
 * Steps:
 *   1. Idempotency — block duplicate runs for the same scheduledDate.
 *   2. Build the per-iteration invoice doc (lineItems carried over,
 *      respects per-client requireInvoiceApproval gate).
 *   3. Mint a Stripe-hosted invoice + pay link via the existing
 *      /api/stripe/create-payment-link route.
 *   4. (optional) Off-session auto-charge against the configured PM.
 *   5. Send the customer the invoice email (skipped when admin
 *      approval is required — the client portal flow handles
 *      notifying once an admin approves).
 *   6. Write a ScheduledInvoiceExecution audit row.
 *   7. Advance the parent's nextExecution / lastExecution counters.
 */
export async function POST(request: NextRequest) {
  let step: string = 'init';
  const startedAt = new Date();
  let scheduledInvoiceId: string | undefined;

  try {
    step = 'parse-body';
    const body = await request.json();
    scheduledInvoiceId = body.scheduledInvoiceId;
    const triggeredBy: string = body.triggeredBy || 'manual_admin';
    if (!scheduledInvoiceId) {
      return NextResponse.json({ error: 'Missing scheduledInvoiceId', step }, { status: 400 });
    }

    step = 'get-server-db';
    const db = await getServerDb();

    step = 'fetch-schedule';
    const siRef = doc(db, 'scheduledInvoices', scheduledInvoiceId);
    const siSnap = await getDoc(siRef);
    if (!siSnap.exists()) {
      return NextResponse.json({ error: 'Scheduled invoice not found', step }, { status: 404 });
    }
    const si = siSnap.data() as any;
    if (si.status !== 'active') {
      return NextResponse.json({
        error: `Schedule is ${si.status} — only 'active' schedules can be executed.`,
        step,
      }, { status: 400 });
    }

    // The "scheduled date" we're executing for: prefer the parent's
    // current nextExecution (this is what the cron picked up). For a
    // manual run that's also the value the admin saw.
    const scheduledDate: Date = (() => {
      const v = si.nextExecution;
      if (!v) return new Date();
      if (v?.toDate) return v.toDate();
      return v instanceof Date ? v : new Date(v);
    })();

    // ── Idempotency ─────────────────────────────────────────────────
    // Concurrent runs (cron + manual button on a slow network, or
    // double-click) must not produce two invoices for the same
    // scheduledDate. Look up existing executions for this schedule
    // matching the scheduled date (within a 1-day tolerance to
    // accommodate timezone drift).
    step = 'idempotency-check';
    const dayMs = 86_400_000;
    const startOfDay = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate(), 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + dayMs);
    const existingExecs = await getDocs(query(
      collection(db, 'scheduledInvoiceExecutions'),
      where('scheduledInvoiceId', '==', scheduledInvoiceId),
    ));
    const dupe = existingExecs.docs.find(d => {
      const data = d.data();
      const sd = data.scheduledDate?.toDate?.() || (data.scheduledDate instanceof Date ? data.scheduledDate : null);
      if (!sd) return false;
      return sd >= startOfDay && sd < endOfDay && (data.status === 'executed' || data.status === 'pending');
    });
    if (dupe) {
      const dupeData = dupe.data();
      return NextResponse.json({
        success: false,
        alreadyExecuted: true,
        message: `Already executed for ${scheduledDate.toLocaleDateString()} (invoice ${dupeData.invoiceNumber || dupeData.invoiceId || dupe.id}).`,
        invoiceId: dupeData.invoiceId,
        invoiceNumber: dupeData.invoiceNumber,
      });
    }

    // Pre-create the audit row in 'pending' so a hard crash mid-flight
    // still leaves a trace the admin can see on the detail page.
    step = 'pre-write-execution-pending';
    const executionNumber = (si.totalExecutions || 0) + 1;
    const execRef = await addDoc(collection(db, 'scheduledInvoiceExecutions'), {
      scheduledInvoiceId,
      executionNumber,
      scheduledDate: Timestamp.fromDate(scheduledDate),
      status: 'pending',
      emailSent: false,
      triggeredBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Build the invoice
    step = 'build-invoice';
    const invoiceNumber = generateInvoiceNumber();
    const dueDate = new Date(Date.now() + 30 * dayMs);
    const safeLineItems = (Array.isArray(si.lineItems) ? si.lineItems : []).map((li: any) => ({
      description: String(li?.description || ''),
      quantity: Number(li?.quantity ?? 0) || 0,
      unitPrice: Number(li?.unitPrice ?? 0) || 0,
      amount: Number(li?.amount ?? 0) || 0,
    }));
    const total = Number(si.totalAmount) ||
      safeLineItems.reduce((s: number, li: any) => s + Number(li.amount || 0), 0);

    const adminApprovalNeeded = await shouldRequireAdminApproval(db, si.clientId).catch(() => false);

    // When consolidationEnabled, daily invoices accumulate as drafts rather
    // than being sent to the client immediately. The consolidation cron
    // (/api/scheduled-invoices/consolidate) collects them at the end of
    // each period and generates one consolidated invoice.
    const isConsolidationMode = si.consolidationEnabled === true;

    step = 'create-invoice-doc';
    const invoiceRef = await addDoc(collection(db, 'invoices'), {
      invoiceNumber,
      scheduledInvoiceId,
      scheduledInvoiceNumber: si.scheduledInvoiceNumber,
      clientId: si.clientId,
      clientName: si.clientName,
      clientEmail: si.clientEmail,
      workOrderTitle: si.title,
      workOrderDescription: si.description || '',
      totalAmount: total,
      // Consolidation-mode: keep as draft so the client doesn't see individual invoices.
      status: isConsolidationMode ? 'draft' : (adminApprovalNeeded ? 'pending_approval' : 'sent'),
      adminApprovalRequired: isConsolidationMode ? false : !!adminApprovalNeeded,
      ...(isConsolidationMode ? { consolidatedPending: true } : {}),
      lineItems: safeLineItems,
      dueDate: Timestamp.fromDate(dueDate),
      notes: si.notes || si.description || '',
      terms: si.terms || '',
      sentAt: (isConsolidationMode || adminApprovalNeeded) ? null : serverTimestamp(),
      // Per-invoice auto-charge target — written here so the Auto-Charge
      // button on the invoice detail page (and any future picker) reads
      // the same value as the schedule's choice.
      ...(si.autoCharge && si.autoChargePaymentMethodId && !isConsolidationMode
        ? { autoChargePaymentMethodId: si.autoChargePaymentMethodId }
        : {}),
      creationSource: 'scheduled_invoice',
      createdBy: 'system',
      createdByName: 'Scheduled Invoice Cron',
      timeline: [{
        id: `created_${Date.now()}`,
        timestamp: Timestamp.now(),
        type: 'created',
        userId: 'system',
        userName: 'Scheduled Invoice Cron',
        userRole: 'system',
        details: isConsolidationMode
          ? `Invoice accumulated for consolidation from scheduled invoice ${si.scheduledInvoiceNumber || scheduledInvoiceId} (${triggeredBy})`
          : `Invoice created from scheduled invoice ${si.scheduledInvoiceNumber || scheduledInvoiceId} (${triggeredBy})`,
        metadata: { scheduledInvoiceId, scheduledDate: scheduledDate.toISOString(), executionId: execRef.id },
      }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ── Stripe pay link + (optional) auto-charge ─────────────────────
    // Skipped entirely in consolidation mode — individual accumulated
    // invoices are drafts and will be paid via the consolidated invoice.
    step = 'stripe-create-payment-link';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://groundopscos.vercel.app');
    let stripePaymentLink = '';
    let stripeInvoiceId = '';
    let autoChargeOutcome: 'succeeded' | 'failed' | 'requires_action' | 'pending' | null = null;
    let autoChargeError: string | undefined;

    if (!isConsolidationMode) {
      try {
        const stripeRes = await fetch(`${baseUrl}/api/stripe/create-payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: invoiceRef.id,
            invoiceNumber,
            amount: total,
            customerEmail: si.clientEmail,
            clientName: si.clientName,
            clientId: si.clientId,
            // When auto-charge is wanted, ask the route to flip
            // collection_method=charge_automatically and set the default PM.
            autoCharge: si.autoCharge === true && !adminApprovalNeeded,
          }),
        });
        const stripeData = await stripeRes.json().catch(() => ({} as any));
        if (stripeRes.ok && stripeData?.paymentLink) {
          stripePaymentLink = stripeData.paymentLink;
          stripeInvoiceId = stripeData.stripeInvoiceId || stripeData.sessionId || '';
          if (stripeData?.autoCharge?.attempted) {
            autoChargeOutcome = stripeData.autoCharge.outcome || 'pending';
          }
        } else {
          autoChargeError = stripeData?.error || `Stripe error (HTTP ${stripeRes.status})`;
          console.warn('[scheduled-invoices/execute] Stripe link creation failed:', autoChargeError);
        }
      } catch (e: any) {
        autoChargeError = e?.message || 'Stripe call threw';
        console.error('[scheduled-invoices/execute] Stripe call threw:', e);
      }
    }

    // ── Customer invoice email ──────────────────────────────────────
    // Skipped when admin approval is required or consolidation mode —
    // the consolidation cron handles client notification after merging.
    step = 'send-invoice-email';
    let emailSent = false;
    if (!adminApprovalNeeded && !isConsolidationMode) {
      try {
        const emailRes = await fetch(`${baseUrl}/api/email/send-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: si.clientEmail,
            toName: si.clientName,
            invoiceNumber,
            workOrderTitle: si.title,
            totalAmount: total,
            dueDate: dueDate.toLocaleDateString(),
            lineItems: safeLineItems,
            notes: si.notes || si.description || '',
            stripePaymentLink,
            invoiceId: invoiceRef.id,
          }),
        });
        emailSent = emailRes.ok;
      } catch (e) {
        console.error('[scheduled-invoices/execute] Email send threw:', e);
      }
    }

    // ── Compute next execution ──────────────────────────────────────
    step = 'compute-next-execution';
    const dayAfter = new Date(scheduledDate.getTime() + dayMs);
    let nextExecution: Date | null = null;
    try {
      nextExecution = computeNextExecution(
        {
          recurrencePattern: si.recurrencePattern,
          recurrencePatternLabel: si.recurrencePatternLabel as RecurrencePatternLabel | undefined,
        },
        dayAfter,
      );
    } catch (e) {
      console.warn('[scheduled-invoices/execute] computeNextExecution failed, falling back:', e);
    }

    // Defensive fallback when the recurrence math returns null (very
    // malformed pattern). Push next run by 1 day so the cron doesn't
    // re-fire on the same scheduledDate forever.
    if (!nextExecution) nextExecution = dayAfter;

    // ── Update execution audit + parent counters ───────────────────
    step = 'update-execution-audit';
    await updateDoc(doc(db, 'scheduledInvoiceExecutions', execRef.id), {
      status: 'executed',
      executedDate: serverTimestamp(),
      invoiceId: invoiceRef.id,
      invoiceNumber,
      totalAmount: total,
      stripePaymentLink: stripePaymentLink || null,
      emailSent,
      ...(emailSent ? { emailSentAt: serverTimestamp() } : {}),
      ...(autoChargeOutcome
        ? { autoChargeAttempted: true, autoChargeStatus: autoChargeOutcome }
        : {}),
      ...(autoChargeError ? { autoChargeError } : {}),
      updatedAt: serverTimestamp(),
    });

    step = 'update-schedule-counters';
    await updateDoc(siRef, {
      lastExecution: Timestamp.fromDate(scheduledDate),
      nextExecution: Timestamp.fromDate(nextExecution),
      totalExecutions: (si.totalExecutions || 0) + 1,
      successfulExecutions: (si.successfulExecutions || 0) + 1,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      executionId: execRef.id,
      invoiceId: invoiceRef.id,
      invoiceNumber,
      nextExecution: nextExecution.toISOString(),
      stripeInvoiceId,
      stripePaymentLink,
      emailSent,
      autoChargeOutcome,
      message: `Created invoice ${invoiceNumber} for ${si.clientName}. Next run ${nextExecution.toLocaleDateString()}.`,
    });
  } catch (error: any) {
    const completedAt = new Date();
    const message = error?.message || String(error) || 'Failed to execute scheduled invoice';
    const code = error?.code ? ` [${error.code}]` : '';
    console.error(`[scheduled-invoices/execute] failed at step=${step}:`, message, error?.stack);

    // Mark a failed audit row so the detail page shows the failure
    // (only if we have the parent id — earlier steps don't yet).
    if (scheduledInvoiceId) {
      try {
        const db = await getServerDb();
        await addDoc(collection(db, 'scheduledInvoiceExecutions'), {
          scheduledInvoiceId,
          status: 'failed',
          scheduledDate: Timestamp.fromDate(startedAt),
          executedDate: Timestamp.fromDate(completedAt),
          failureReason: `${message}${code} (step: ${step})`,
          emailSent: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'scheduledInvoices', scheduledInvoiceId), {
          failedExecutions: increment(1),
          updatedAt: serverTimestamp(),
        });
      } catch (auditErr) {
        console.error('[scheduled-invoices/execute] Failed to write failure audit:', auditErr);
      }
    }

    return NextResponse.json(
      { error: `${message}${code} (step: ${step})`, step },
      { status: 500 },
    );
  }
}
