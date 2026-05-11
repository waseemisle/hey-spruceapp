import { NextRequest, NextResponse } from 'next/server';
import { sendBlooioSms } from '@/lib/messaging/blooio';

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
      `Hello ${clientName || 'there'}, ` +
      `your Work Order ${workOrderNumber}${titlePart} has been approved. ` +
      `Our team will be in touch shortly. Track progress in your client portal. — GroundOps`;

    const result = await sendBlooioSms({ to: toPhone, text: message });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to send SMS notification', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, messageId: result.providerMessageId });
  } catch (error: any) {
    console.error('SMS approval notification failed:', error.message);
    return NextResponse.json(
      { error: 'Failed to send SMS notification', details: error.message },
      { status: 500 }
    );
  }
}
