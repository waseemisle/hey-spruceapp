import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sendblue';

export async function POST(req: NextRequest) {
  try {
    const { to, content, mediaUrl } = await req.json();

    if (!to || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: to, content' },
        { status: 400 }
      );
    }

    const result = await sendSMS({ to, content, mediaUrl });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send SMS';
    console.error('SMS send error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
