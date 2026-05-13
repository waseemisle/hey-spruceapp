import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile } from '@/lib/api-verify-firebase';
import { buildStripeHostedInvoiceFooter } from '@/lib/stripe-invoice-footer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

function canAccessInvoice(
  profile: { role: string; uid: string },
  inv: Record<string, unknown>,
): boolean {
  if (profile.role === 'admin') return true;
  if (profile.role === 'client' && inv.clientId === profile.uid) return true;
  if (profile.role === 'subcontractor' && inv.subcontractorId === profile.uid) return true;
  return false;
}

function extractInvoiceIdFromStripeUrls(...urls: string[]): string | null {
  const combined = urls.filter(Boolean).join(' ');
  const m = combined.match(/\b(in_[A-Za-z0-9]+)\b/);
  return m ? m[1] : null;
}

function invoiceIdFromExpandable(invObj: Stripe.Invoice | string | null | undefined): string | null {
  if (!invObj) return null;
  if (typeof invObj === 'string') return invObj.startsWith('in_') ? invObj : null;
  const id = invObj.id;
  return id?.startsWith('in_') ? id : null;
}

/**
 * Firestore sometimes stores a Checkout Session id (`cs_`) in `stripeInvoiceId`,
 * or omits `in_` while `stripePaymentIntentId` / hosted URLs still link to a
 * Stripe Invoice. Resolve the canonical `in_` id for PDF download.
 */
async function resolveStripeInvoiceId(stripe: Stripe, inv: Record<string, unknown>): Promise<string | null> {
  const direct = String(inv.stripeInvoiceId || '').trim();
  if (direct.startsWith('in_')) return direct;

  const fromHosted = extractInvoiceIdFromStripeUrls(
    String(inv.stripeHostedInvoiceUrl || ''),
    String(inv.stripeInvoicePdf || ''),
  );
  if (fromHosted) return fromHosted;

  const piId = String(inv.stripePaymentIntentId || '').trim();
  if (piId.startsWith('pi_')) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['invoice'] });
      const iid = invoiceIdFromExpandable(pi.invoice as Stripe.Invoice | string | null);
      if (iid) return iid;
    } catch (e) {
      console.warn('[download-stripe-pdf] resolve from PI failed', e);
    }
  }

  const sessionCandidates = new Set<string>();
  const sess = String(inv.stripeSessionId || '').trim();
  if (sess.startsWith('cs_')) sessionCandidates.add(sess);
  if (direct.startsWith('cs_')) sessionCandidates.add(direct);

  for (const cs of sessionCandidates) {
    try {
      const session = await stripe.checkout.sessions.retrieve(cs, { expand: ['invoice'] });
      const iid = invoiceIdFromExpandable(session.invoice as Stripe.Invoice | string | null);
      if (iid) return iid;
    } catch (e) {
      console.warn('[download-stripe-pdf] resolve from checkout session failed', cs, e);
    }
  }

  return null;
}

/**
 * GET — streams the official Stripe Invoice PDF (same document as Stripe
 * Dashboard → ⋮ → Download PDF). Authenticated admin, owning client, or
 * assigned subcontractor only.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoiceId = params.id;
    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });
    }

    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getServerDb();
    const profile = await getPortalUserProfile(db, uid);
    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snap = await getDoc(doc(db, 'invoices', invoiceId));
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const inv = snap.data() as Record<string, unknown>;
    if (!canAccessInvoice(profile, inv)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const resolvedId = await resolveStripeInvoiceId(stripe, inv);
    if (!resolvedId) {
      return NextResponse.json({ error: 'No Stripe invoice for this record' }, { status: 404 });
    }

    const storedId = String(inv.stripeInvoiceId || '').trim();
    if (resolvedId !== storedId) {
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), {
          stripeInvoiceId: resolvedId,
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn('[download-stripe-pdf] could not persist resolved stripeInvoiceId', e);
      }
    }

    let stripeInvoice = await stripe.invoices.retrieve(resolvedId);

    try {
      const footerText = await buildStripeHostedInvoiceFooter(
        db,
        inv,
        String(inv.invoiceNumber || resolvedId),
      );
      const canPatchFooter = stripeInvoice.status === 'draft' || stripeInvoice.status === 'open';
      if (canPatchFooter && footerText && footerText !== (stripeInvoice.footer || '')) {
        await stripe.invoices.update(resolvedId, { footer: footerText });
        stripeInvoice = await stripe.invoices.retrieve(resolvedId);
      }
    } catch (e) {
      console.warn('[download-stripe-pdf] footer refresh skipped', e);
    }

    const pdfUrl = stripeInvoice.invoice_pdf;
    if (!pdfUrl) {
      return NextResponse.json(
        { error: 'Stripe has not generated a PDF for this invoice yet (try again shortly).' },
        { status: 404 },
      );
    }

    const upstream = await fetch(pdfUrl, { redirect: 'follow' });
    if (!upstream.ok) {
      console.error('[download-stripe-pdf] Upstream fetch failed', upstream.status);
      return NextResponse.json({ error: 'Could not fetch PDF from Stripe' }, { status: 502 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const filename = `${String(inv.invoiceNumber || resolvedId).replace(/[^\w.-]+/g, '_')}.pdf`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e: unknown) {
    console.error('[download-stripe-pdf]', e);
    const message = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
