import { NextResponse } from 'next/server';
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  collection,
  getDocs,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';
import { getBearerUid, getPortalUserProfile, isUserAdmin } from '@/lib/api-verify-firebase';
import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AttachmentInput = {
  id?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
};

export async function POST(request: Request) {
  try {
    const uid = await getBearerUid(request);
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getServerDb();
    const actor = await getPortalUserProfile(db, uid);
    if (!actor) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title: rawTitle,
      description,
      category,
      priority,
      type,
      relatedWorkOrderId,
      relatedInvoiceId,
      relatedQuoteId,
      tags,
      attachments: rawAttachments,
      onBehalfOfUid,
    } = body as {
      title: string;
      description: string;
      category: SupportTicketCategory;
      priority: SupportTicketPriority;
      type: SupportTicketType;
      relatedWorkOrderId?: string;
      relatedInvoiceId?: string;
      relatedQuoteId?: string;
      tags?: string[];
      attachments?: AttachmentInput[];
      onBehalfOfUid?: string;
    };

    if (!rawTitle?.trim() || !description?.trim() || !category || !priority || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let submitter = actor;
    if (onBehalfOfUid) {
      const admin = await isUserAdmin(db, uid);
      if (!admin) {
        return NextResponse.json({ error: 'Only admins can create tickets on behalf of users' }, { status: 403 });
      }
      const target = await getPortalUserProfile(db, onBehalfOfUid);
      if (!target) {
        return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
      }
      submitter = target;
    }

    const title = rawTitle.trim().slice(0, 120);
    const now = Timestamp.now();
    const eventId = crypto.randomUUID();

    let relatedWorkOrderNumber: string | undefined;
    let relatedInvoiceNumber: string | undefined;
    if (relatedWorkOrderId) {
      const wo = await getDoc(doc(db, 'workOrders', relatedWorkOrderId));
      if (wo.exists()) {
        relatedWorkOrderNumber = (wo.data().workOrderNumber as string) || relatedWorkOrderId;
      }
    }
    if (relatedInvoiceId) {
      const inv = await getDoc(doc(db, 'invoices', relatedInvoiceId));
      if (inv.exists()) {
        relatedInvoiceNumber = (inv.data().invoiceNumber as string) || relatedInvoiceId;
      }
    }

    const attachments = (rawAttachments || []).map((a, i) => ({
      id: a.id || crypto.randomUUID(),
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileType: a.fileType || 'application/octet-stream',
      fileSize: typeof a.fileSize === 'number' ? a.fileSize : 0,
      uploadedBy: submitter.uid,
      uploadedAt: now,
    }));

    const clientId = submitter.role === 'client' ? submitter.uid : undefined;
    const clientName = submitter.role === 'client' ? submitter.fullName : undefined;
    const subcontractorId = submitter.role === 'subcontractor' ? submitter.uid : undefined;
    const subcontractorName = submitter.role === 'subcontractor' ? submitter.fullName : undefined;

    const ticketId = await runTransaction(db, async (transaction) => {
      const counterRef = doc(db, 'counters', 'supportTickets');
      const counterSnap = await transaction.get(counterRef);
      const nextCount = (counterSnap.exists() ? (counterSnap.data().count as number) || 0 : 0) + 1;
      transaction.set(counterRef, { count: nextCount }, { merge: true });
      const id = `TKT-${String(nextCount).padStart(8, '0')}`;

      const ticketRef = doc(db, 'supportTickets', id);
      transaction.set(ticketRef, {
        id,
        ticketNumber: id,
        title,
        description: description.trim(),
        category,
        priority,
        type,
        status: 'open' as SupportTicketStatus,
        submittedBy: submitter.uid,
        submittedByName: submitter.fullName || submitter.email,
        submittedByEmail: submitter.email,
        submittedByRole: submitter.role,
        ...(clientId ? { clientId, clientName } : {}),
        ...(subcontractorId ? { subcontractorId, subcontractorName } : {}),
        ...(relatedWorkOrderId ? { relatedWorkOrderId, relatedWorkOrderNumber: relatedWorkOrderNumber || relatedWorkOrderId } : {}),
        ...(relatedInvoiceId ? { relatedInvoiceId, relatedInvoiceNumber: relatedInvoiceNumber || relatedInvoiceId } : {}),
        ...(relatedQuoteId ? { relatedQuoteId } : {}),
        attachments,
        tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string').slice(0, 20) : [],
        commentCount: 0,
        lastActivityAt: serverTimestamp(),
        timeline: [
          {
            id: eventId,
            timestamp: now,
            type: 'created',
            userId: actor.uid,
            userName: actor.fullName || actor.email,
            userRole: actor.role,
            details: onBehalfOfUid
              ? `Ticket created by ${actor.fullName || actor.email} on behalf of ${submitter.fullName || submitter.email}`
              : 'Ticket created',
            ...(onBehalfOfUid ? { metadata: { onBehalfOfUid: submitter.uid } } : {}),
          },
        ],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return id;
    });

    const adminsSnap = await getDocs(collection(db, 'adminUsers'));
    const adminIds = adminsSnap.docs.map((d) => d.id);
    await Promise.all(
      adminIds.map((adminId) =>
        addDoc(collection(db, 'notifications'), {
          userId: adminId,
          userRole: 'admin',
          type: 'support_ticket',
          title: 'New support ticket',
          message: `${ticketId}: ${title}`,
          link: `/admin-portal/support-tickets/${ticketId}`,
          referenceId: ticketId,
          referenceType: 'supportTicket',
          read: false,
          createdAt: serverTimestamp(),
        }),
      ),
    );

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${baseUrl}/api/email/send-support-ticket-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId,
        ticketNumber: ticketId,
        title,
        submittedByName: submitter.fullName || submitter.email,
        submittedByRole: submitter.role,
        category,
        priority,
        type,
        description: description.trim(),
      }),
    }).catch(() => {});

    return NextResponse.json({ success: true, ticketId, ticketNumber: ticketId });
  } catch (e: any) {
    console.error('support-tickets/create', e);
    return NextResponse.json({ error: e?.message || 'Failed to create ticket' }, { status: 500 });
  }
}
