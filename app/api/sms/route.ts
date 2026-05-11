import { NextRequest, NextResponse } from 'next/server';
import { sendBlooioSms } from '@/lib/messaging/blooio';

export async function POST(req: NextRequest) {
  try {
    const { to, content } = await req.json();

    if (!to || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: to, content' },
        { status: 400 }
      );
    }

    const result = await sendBlooioSms({ to, text: content });

    return NextResponse.json({
      success: result.success,
      status: result.status,
      message_handle: result.providerMessageId || '',
      error: result.error,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send SMS';
    console.error('SMS send error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
