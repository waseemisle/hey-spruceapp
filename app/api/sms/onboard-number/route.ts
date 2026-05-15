import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid } from '@/lib/api-verify-firebase';
import { normalizeToE164 } from '@/lib/messaging/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAILY_LIMIT = 5;
const COUNTER_DOC = '_dailyCounter';

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getServerDb();

    // Must be admin
    const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
    if (!adminSnap.exists()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { phone, subcontractorId } = body;
    if (!phone || !subcontractorId) return NextResponse.json({ error: 'Missing phone or subcontractorId' }, { status: 400 });

    const e164 = normalizeToE164(phone);
    if (!e164) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    // Check if already onboarded
    const existingSnap = await getDoc(doc(db, 'blooioOnboarding', e164));
    if (existingSnap.exists()) {
      return NextResponse.json({ ok: true, alreadyOnboarded: true, onboardedAt: existingSnap.data().onboardedAt });
    }

    // Check daily counter
    const counterRef = doc(db, 'blooioOnboarding', COUNTER_DOC);
    const counterSnap = await getDoc(counterRef);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    let count = 0;
    let firstOnboardedAt: Timestamp | null = null;

    if (counterSnap.exists()) {
      const data = counterSnap.data();
      if (data.date === today) {
        count = data.count ?? 0;
        firstOnboardedAt = data.firstOnboardedAt ?? null;
      }
    }

    if (count >= DAILY_LIMIT) {
      const resetAt = firstOnboardedAt
        ? new Date(firstOnboardedAt.toDate().getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      return NextResponse.json({ error: 'Daily limit reached', resetAt }, { status: 429 });
    }

    // Call Blooio to register/onboard the contact
    const apiKey = process.env.BLOOIO_API_KEY;
    const baseUrl = process.env.BLOOIO_BASE_URL || 'https://backend.blooio.com/v2/api';
    if (!apiKey) return NextResponse.json({ error: 'Blooio not configured' }, { status: 503 });

    // Blooio v2 API: POST /contacts to register a new contact
    // If the endpoint returns 409 (already exists), treat as success
    const blooioRes = await fetch(`${baseUrl}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ phone_number: e164 }),
    });

    if (!blooioRes.ok && blooioRes.status !== 409) {
      const errText = await blooioRes.text().catch(() => '');
      return NextResponse.json({ error: `Blooio error ${blooioRes.status}: ${errText}` }, { status: 502 });
    }

    // Get sub name for the record
    const subSnap = await getDoc(doc(db, 'subcontractors', subcontractorId));
    const subName = subSnap.exists() ? (subSnap.data().fullName || subSnap.data().businessName || '') : '';

    const now = Timestamp.now();

    // Write onboarding record
    await setDoc(doc(db, 'blooioOnboarding', e164), {
      phone: e164,
      onboardedAt: now,
      onboardedBy: uid,
      subcontractorId,
      subcontractorName: subName,
    });

    // Update daily counter
    const newCount = count + 1;
    await setDoc(counterRef, {
      date: today,
      count: newCount,
      firstOnboardedAt: firstOnboardedAt ?? now,
    });

    return NextResponse.json({
      ok: true,
      onboardedAt: now.toDate().toISOString(),
      remainingToday: DAILY_LIMIT - newCount,
    });
  } catch (err: any) {
    console.error('[onboard-number]', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
