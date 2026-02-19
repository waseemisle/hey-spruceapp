import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
    const { toPhone, clientName, workOrderNumber, workOrderTitle } = await request.json();

    if (!toPhone) {
      return NextResponse.json({ error: 'Missing phone number' }, { status: 400 });
    }

    if (!workOrderNumber) {
      return NextResponse.json({ error: 'Missing work order number' }, { status: 400 });
    }

    const titlePart = workOrderTitle ? ` — "${workOrderTitle}"` : '';
    const message =
      `Hello ${clientName || 'there'},\n\n` +
      `Great news! Your Work Order *${workOrderNumber}*${titlePart} has been *approved* ✅.\n\n` +
      `Our team will be in touch shortly with next steps. You can track the progress in your client portal.\n\n` +
      `— GroundOps Team`;

    await sendWhatsApp({ to: toPhone, body: message });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ WhatsApp approval notification failed:', error.message);

    const isConfigError = error.message?.includes('not configured');
    return NextResponse.json(
      {
        error: 'Failed to send WhatsApp notification',
        details: error.message,
        configError: isConfigError,
        suggestion: isConfigError
          ? 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM in your environment variables.'
          : undefined,
      },
      { status: 500 }
    );
  }
}
