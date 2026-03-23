'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { doc, onSnapshot, collection, updateDoc, arrayUnion, serverTimestamp, Timestamp, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { PageContainer } from '@/components/ui/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, MessageSquare, History, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import type { SupportTicket, TicketComment } from '@/types';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TYPE_LABELS,
  initialsFromName,
} from '@/lib/support-ticket-helpers';
import { supportTicketPost } from '@/lib/support-ticket-api-client';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';

function formatTs(v: unknown): string {
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toLocaleString();
  }
  return '—';
}

function timelineIcon(type: string) {
  switch (type) {
    case 'created': return '✨';
    case 'status-changed': return '◆';
    case 'priority-changed': return '▲';
    case 'assigned': return '👤';
    case 'comment-added': return '💬';
    case 'attachment-added': return '📎';
    case 'resolved': return '✓';
    case 'closed': return '■';
    case 'reopened': return '↩';
    default: return '•';
  }
}

export default function SubcontractorSupportTicketDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [uid, setUid] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [tab, setTab] = useState<'comments' | 'activity' | 'attachments'>('comments');
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
      setAuthChecked(true);
      if (!user) setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authChecked || !uid || !id) return;
    const unsub = onSnapshot(doc(db, 'supportTickets', id), (snap) => {
      if (!snap.exists()) {
        setTicket(null);
        setLoading(false);
        return;
      }
      const t = { id: snap.id, ...snap.data() } as SupportTicket;
      const allowed = t.submittedBy === uid || t.subcontractorId === uid;
      if (!allowed) {
        setTicket(null);
        setLoading(false);
        return;
      }
      setTicket(t);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [authChecked, uid, id]);

  useEffect(() => {
    if (!authChecked || !uid || !id) return;
    const commentsQuery = query(
      collection(db, 'supportTickets', id, 'comments'),
      where('isInternal', '==', false),
    );
    const unsub = onSnapshot(commentsQuery, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TicketComment));
      list.sort((a, b) => {
        const ta = a.createdAt && typeof (a.createdAt as { toMillis?: () => number }).toMillis === 'function'
          ? (a.createdAt as { toMillis: () => number }).toMillis()
          : 0;
        const tb = b.createdAt && typeof (b.createdAt as { toMillis?: () => number }).toMillis === 'function'
          ? (b.createdAt as { toMillis: () => number }).toMillis()
          : 0;
        return ta - tb;
      });
      setComments(list);
    }, () => {});
    return () => unsub();
  }, [authChecked, uid, id]);

  const sortedTimeline = useMemo(() => {
    if (!ticket?.timeline) return [];
    return [...ticket.timeline]
      .filter((ev) => !ev.metadata?.internal)
      .sort((a, b) => {
        const ta = a.timestamp && typeof (a.timestamp as { toMillis?: () => number }).toMillis === 'function'
          ? (a.timestamp as { toMillis: () => number }).toMillis()
          : 0;
        const tb = b.timestamp && typeof (b.timestamp as { toMillis?: () => number }).toMillis === 'function'
          ? (b.timestamp as { toMillis: () => number }).toMillis()
          : 0;
        return ta - tb;
      });
  }, [ticket?.timeline]);

  const attachmentList = useMemo(() => {
    const fromTicket = ticket?.attachments || [];
    const fromComments = comments.flatMap((c) =>
      (c.attachments || []).map((a) => ({
        ...a,
        uploadedBy: c.authorName,
        uploadedAt: c.createdAt,
      })),
    );
    return [...fromTicket.map((a) => ({ ...a, source: 'ticket' as const })), ...fromComments];
  }, [ticket, comments]);

  const postComment = async () => {
    if (!id || !commentBody.trim()) return;
    setPosting(true);
    try {
      const attachments: { fileName: string; fileUrl: string; fileType: string; fileSize: number }[] = [];
      for (const f of commentFiles) {
        const url = await uploadToCloudinary(f);
        attachments.push({
          fileName: f.name,
          fileUrl: url,
          fileType: f.type || 'application/octet-stream',
          fileSize: f.size,
        });
      }
      await supportTicketPost('/api/support-tickets/comment', {
        ticketId: id,
        body: commentBody.trim(),
        attachments,
      });
      setCommentBody('');
      setCommentFiles([]);
      toast.success('Posted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setPosting(false);
    }
  };

  /** Client may upload files on the ticket (not only comments) — merge into ticket.attachments */
  const uploadTicketFiles = async (list: FileList | null) => {
    if (!id || !list?.length || !uid || !ticket) return;
    try {
      const newAtt: { id: string; fileName: string; fileUrl: string; fileType: string; fileSize: number; uploadedBy: string; uploadedAt: ReturnType<typeof Timestamp.now> }[] = [];
      for (const f of Array.from(list)) {
        const url = await uploadToCloudinary(f);
        newAtt.push({
          id: crypto.randomUUID(),
          fileName: f.name,
          fileUrl: url,
          fileType: f.type || 'application/octet-stream',
          fileSize: f.size,
          uploadedBy: uid,
          uploadedAt: Timestamp.now(),
        });
      }
      await updateDoc(doc(db, 'supportTickets', id), {
        attachments: [...(ticket.attachments || []), ...newAtt],
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        timeline: arrayUnion({
          id: crypto.randomUUID(),
          timestamp: Timestamp.now(),
          type: 'attachment-added',
          userId: uid,
          userName: ticket.submittedByName,
          userRole: 'subcontractor',
          details: 'Attachment(s) added',
        }),
      });
      toast.success('Files uploaded');
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    }
  };

  if (loading || !ticket) {
    return (
      <SubcontractorLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <PageContainer>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/subcontractor-portal/support-tickets">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <span className="font-mono text-sm text-gray-500">{ticket.ticketNumber}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-gray-700">{ticket.description}</p>
            </div>

            <div className="flex border-b border-gray-200 gap-4">
              {(['comments', 'activity', 'attachments'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`pb-2 px-1 text-sm font-medium capitalize border-b-2 -mb-px ${
                    tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'
                  }`}
                >
                  {t === 'comments' && <MessageSquare className="inline h-4 w-4 mr-1" />}
                  {t === 'activity' && <History className="inline h-4 w-4 mr-1" />}
                  {t === 'attachments' && <Paperclip className="inline h-4 w-4 mr-1" />}
                  {t}
                </button>
              ))}
            </div>

            {tab === 'comments' && (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl border border-gray-200 p-4 bg-white">
                    <div className="flex gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold">
                        {c.authorAvatarInitials || initialsFromName(c.authorName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="font-medium">{c.authorName}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{c.authorRole}</Badge>
                          <span className="text-xs text-gray-500">{formatTs(c.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>
                        {(c.attachments?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {c.attachments!.map((a) => (
                              <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">{a.fileName}</a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
                  <Textarea placeholder="Your message" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} className="min-h-[100px]" />
                  <Input type="file" multiple onChange={(e) => setCommentFiles(e.target.files ? Array.from(e.target.files) : [])} />
                  <Button onClick={postComment} disabled={posting || !commentBody.trim()}>{posting ? 'Sending…' : 'Send reply'}</Button>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <ul className="space-y-3">
                {sortedTimeline.map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm border-b border-gray-100 pb-3">
                    <span className="text-lg">{timelineIcon(ev.type)}</span>
                    <div>
                      <p>{ev.details}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatTs(ev.timestamp)} · {ev.userName}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'attachments' && (
              <div className="space-y-3">
                <Input type="file" multiple onChange={(e) => uploadTicketFiles(e.target.files)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {attachmentList.map((a) => (
                    <a
                      key={`${a.fileUrl}-${a.fileName}`}
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-gray-50"
                    >
                      <Paperclip className="h-8 w-8 text-gray-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.fileName}</p>
                        <p className="text-xs text-gray-500">{formatTs((a as { uploadedAt?: unknown }).uploadedAt)}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-white shadow-sm h-fit">
            <h3 className="font-semibold text-sm text-gray-500">Status</h3>
            <p className="text-sm font-medium">{SUPPORT_STATUS_LABELS[ticket.status]}</p>
            <h3 className="font-semibold text-sm text-gray-500">Priority</h3>
            <p className="text-sm font-medium capitalize">{ticket.priority}</p>
            <h3 className="font-semibold text-sm text-gray-500">Category</h3>
            <p className="text-sm">{SUPPORT_CATEGORY_LABELS[ticket.category]}</p>
            <h3 className="font-semibold text-sm text-gray-500">Type</h3>
            <Badge variant="outline">{SUPPORT_TYPE_LABELS[ticket.type]}</Badge>
            <h3 className="font-semibold text-sm text-gray-500">Assigned to</h3>
            <p className="text-sm">{ticket.assignedToName || '—'}</p>
          </div>
        </div>
      </PageContainer>
    </SubcontractorLayout>
  );
}
