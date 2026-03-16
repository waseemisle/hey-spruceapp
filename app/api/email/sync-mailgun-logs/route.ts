import { NextResponse } from 'next/server';

// Mailgun has been removed. Email logs are recorded directly via email-logger.
export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Email logs are now recorded automatically via Resend. No sync needed.',
    imported: 0,
  });
}
