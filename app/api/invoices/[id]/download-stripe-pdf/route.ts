import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { doc, getDoc } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile } from '@/lib/api-verify-firebase';

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

    const stripeInvoiceId = String(inv.stripeInvoiceId || '').trim();
    if (!stripeInvoiceId.startsWith('in_')) {
      return NextResponse.json({ error: 'No Stripe invoice for this record' }, { status: 404 });
    }

    const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
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
    const filename = `${String(inv.invoiceNumber || stripeInvoiceId).replace(/[^\w.-]+/g, '_')}.pdf`;

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
