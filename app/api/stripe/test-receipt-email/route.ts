import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendAutoChargeReceiptEmail } from '@/lib/auto-charge-email';

/**
 * Test endpoint: fires an auto-charge receipt email to the specified client.
 * Use this to verify email + PDF before going live.
 *
 * POST body: { clientId }
 */
export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (!clientDoc.exists()) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    const clientData = clientDoc.data();

    if (!clientData.email) {
      return NextResponse.json({ error: 'Client has no email address' }, { status: 400 });
    }

    // Find the card to display in the test receipt
    const paymentMethods: any[] = clientData.paymentMethods || [];
    const defaultCard = paymentMethods.find((m: any) => m.isDefault)
      || paymentMethods[0]
      || (clientData.savedCardLast4 ? {
          brand: clientData.savedCardBrand || 'visa',
          last4: clientData.savedCardLast4,
        } : null);

    const testData = {
      clientEmail: clientData.email,
      clientName: clientData.fullName || clientData.companyName || 'Test Client',
      amount: clientData.subscriptionAmount || 300,
      invoiceNumber: `SPRUCE-SUB-TEST-${Date.now().toString().slice(-6)}`,
      chargedAt: new Date(),
      cardBrand: defaultCard?.brand || 'visa',
      cardLast4: defaultCard?.last4 || '4242',
      subscriptionAmount: clientData.subscriptionAmount || 300,
      subscriptionBillingDay: clientData.subscriptionBillingDay || 1,
      stripePaymentIntentId: 'pi_test_' + Math.random().toString(36).slice(2, 12),
      stripeInvoiceId: 'in_test_' + Math.random().toString(36).slice(2, 12),
    };

    await sendAutoChargeReceiptEmail(testData);

    return NextResponse.json({
      success: true,
      sentTo: clientData.email,
      amount: testData.amount,
      invoiceNumber: testData.invoiceNumber,
      cardUsed: `${testData.cardBrand} •••• ${testData.cardLast4}`,
    });
  } catch (error: any) {
    console.error('Test receipt email error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test receipt' },
      { status: 500 }
    );
  }
}
