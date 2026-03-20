'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  doc,
  onSnapshot,
  collection,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  getDocs,
  deleteField,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { PageContainer } from '@/components/ui/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  MessageSquare,
  History,
  Paperclip,
  Clock,
  User,
  Link as LinkIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SupportTicket, TicketComment, SupportTicketStatus, SupportTicketPriority, SupportTicketCategory } from '@/types';
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TYPE_LABELS,
  initialsFromName,
} from '@/lib/support-ticket-helpers';
import { supportTicketPost } from '@/lib/support-ticket-api-client';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';

const ALL_STATUSES: SupportTicketStatus[] = [
  'open',
  'in-progress',
  'waiting-on-client',
  'waiting-on-admin',
  'resolved',
  'closed',
];

const PRIORITIES: SupportTicketPriority[] = ['low', 'medium', 'high', 'urgent'];
const CATEGORIES: SupportTicketCategory[] = [
  'billing',
  'technical',
  'work-order',
  'account',
  'general',
  'bug-report',
  'feature-request',
];

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

export default function AdminSupportTicketDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [admins, setAdmins] = useState<{ id: string; fullName: string; email?: string }[]>([]);
  const [tab, setTab] = useState<'comments' | 'activity' | 'attachments'>('comments');
  const [loading, setLoading] = useState(true);

  const [titleEdit, setTitleEdit] = useState('');
  const [descEdit, setDescEdit] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [internalOnly, setInternalOnly] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);

  const [tagInput, setTagInput] = useState('');
  const [internalNotesLocal, setInternalNotesLocal] = useState('');
  const [dueInput, setDueInput] = useState('');

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'supportTickets', id),
      (snap) => {
        if (!snap.exists()) {
          setTicket(null);
          setLoading(false);
          return;
        }
        const t = { id: snap.id, ...snap.data() } as SupportTicket;
        setTicket(t);
        setTitleEdit(t.title);
        setDescEdit(t.description);
        setInternalNotesLocal(t.internalNotes || '');
        if (t.dueDate && typeof (t.dueDate as { toDate?: () => Date }).toDate === 'function') {
          const d = (t.dueDate as { toDate: () => Date }).toDate();
          setDueInput(d.toISOString().slice(0, 10));
        } else setDueInput('');
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load ticket');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, 'supportTickets', id, 'comments'),
      (snap) => {
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
      },
      (err) => console.error('comments', err),
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    getDocs(collection(db, 'adminUsers')).then((snap) => {
      setAdmins(
        snap.docs.map((d) => ({
          id: d.id,
          fullName: (d.data().fullName as string) || d.id,
          email: d.data().email as string | undefined,
        })),
      );
    });
  }, []);

  const uid = auth.currentUser?.uid;

  const saveTitleDesc = async () => {
    if (!id || !ticket) return;
    setSavingMeta(true);
    try {
      const adminName = admins.find((a) => a.id === uid)?.fullName || auth.currentUser?.email || 'Admin';
      if (titleEdit.trim() && titleEdit.trim() !== ticket.title) {
        await updateDoc(doc(db, 'supportTickets', id), {
          title: titleEdit.trim().slice(0, 120),
          updatedAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          timeline: arrayUnion({
            id: crypto.randomUUID(),
            timestamp: Timestamp.now(),
            type: 'comment-added',
            userId: uid || '',
            userName: adminName,
            userRole: 'admin',
            details: 'Ticket title updated',
            metadata: { field: 'title', internal: true },
          }),
        });
      }
      if (descEdit !== ticket.description) {
        await updateDoc(doc(db, 'supportTickets', id), {
          description: descEdit,
          updatedAt: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          timeline: arrayUnion({
            id: crypto.randomUUID(),
            timestamp: Timestamp.now(),
            type: 'comment-added',
            userId: uid || '',
            userName: adminName,
            userRole: 'admin',
            details: 'Description updated',
            metadata: { field: 'description', internal: true },
          }),
        });
      }
      toast.success('Saved');
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSavingMeta(false);
    }
  };

  const changePriority = async (p: SupportTicketPriority) => {
    if (!id || !ticket || p === ticket.priority) return;
    const name = admins.find((a) => a.id === uid)?.fullName || auth.currentUser?.email || 'Admin';
    try {
      await updateDoc(doc(db, 'supportTickets', id), {
        priority: p,
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        timeline: arrayUnion({
          id: crypto.randomUUID(),
          timestamp: Timestamp.now(),
          type: 'priority-changed',
          userId: uid,
          userName: name,
          userRole: 'admin',
          details: `Priority changed to ${p}`,
          metadata: { fromPriority: ticket.priority, toPriority: p },
        }),
      });
      toast.success('Priority updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const changeStatus = async (s: SupportTicketStatus) => {
    if (!id) return;
    try {
      await supportTicketPost('/api/support-tickets/update-status', { ticketId: id, status: s, internalNotes: internalNotesLocal });
      toast.success('Status updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const saveInternalNotes = async () => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'supportTickets', id), {
        internalNotes: internalNotesLocal,
        updatedAt: serverTimestamp(),
      });
      toast.success('Internal notes saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const saveDueDate = async () => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'supportTickets', id), {
        ...(dueInput ? { dueDate: Timestamp.fromDate(new Date(dueInput)) } : { dueDate: deleteField() }),
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      });
      toast.success('Due date updated');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const setTags = async (tags: string[]) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'supportTickets', id), {
        tags,
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || !ticket) return;
    if (ticket.tags?.includes(t)) return;
    setTags([...(ticket.tags || []), t]);
    setTagInput('');
  };

  const removeTag = (t: string) => {
    if (!ticket) return;
    setTags((ticket.tags || []).filter((x) => x !== t));
  };

  const assignTo = async (assignedTo: string, assignedToName: string) => {
    if (!id) return;
    try {
      await supportTicketPost('/api/support-tickets/assign', { ticketId: id, assignedTo, assignedToName });
      toast.success('Assigned');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

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
        isInternal: internalOnly,
        attachments,
      });
      setCommentBody('');
      setCommentFiles([]);
      setInternalOnly(false);
      toast.success('Comment posted');
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setPosting(false);
    }
  };

  const sortedTimeline = useMemo(() => {
    if (!ticket?.timeline) return [];
    return [...ticket.timeline].sort((a, b) => {
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
        source: 'comment',
      })),
    );
    return [
      ...fromTicket.map((a) => ({ ...a, uploadedBy: a.uploadedBy, uploadedAt: a.uploadedAt, source: 'ticket' as const })),
      ...fromComments,
    ];
  }, [ticket, comments]);

  if (loading || !ticket) {
    return (
      <AdminLayout>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  const submitterProfileHref =
    ticket.submittedByRole === 'client'
      ? `/admin-portal/clients`
      : ticket.submittedByRole === 'subcontractor'
        ? `/admin-portal/subcontractors`
        : `/admin-portal/admin-users`;

  return (
    <AdminLayout>
      <PageContainer>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/admin-portal/support-tickets">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <span className="font-mono text-sm text-gray-500">{ticket.ticketNumber}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <Input
                className="text-2xl font-bold border-0 px-0 focus-visible:ring-0"
                value={titleEdit}
                onChange={(e) => setTitleEdit(e.target.value)}
              />
              <Button size="sm" variant="outline" className="mt-2" onClick={saveTitleDesc} disabled={savingMeta}>
                Save title & description
              </Button>
            </div>
            <div>
              <Label className="text-gray-500 text-xs">Description</Label>
              <Textarea
                className="mt-1 min-h-[160px] font-mono text-sm"
                value={descEdit}
                onChange={(e) => setDescEdit(e.target.value)}
              />
            </div>

            <div className="flex border-b border-gray-200 gap-4">
              {(['comments', 'activity', 'attachments'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`pb-2 px-1 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                    tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
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
                  <div
                    key={c.id}
                    className={`rounded-xl border p-4 ${c.isInternal ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
                        {c.authorAvatarInitials || initialsFromName(c.authorName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{c.authorName}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{c.authorRole}</Badge>
                          {c.isInternal && (
                            <Badge className="bg-amber-200 text-amber-900 border-amber-300 text-[10px]">Internal Note</Badge>
                          )}
                          <span className="text-xs text-gray-500">{formatTs(c.createdAt)}</span>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap text-gray-800">{c.body}</p>
                        {(c.attachments?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {c.attachments!.map((a) => (
                              <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                                {a.fileName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
                  <Textarea
                    placeholder="Add a comment (markdown-friendly plain text)"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={internalOnly} onChange={(e) => setInternalOnly(e.target.checked)} />
                    Internal note (admins only)
                  </label>
                  <Input
                    type="file"
                    multiple
                    onChange={(e) => setCommentFiles(e.target.files ? Array.from(e.target.files) : [])}
                  />
                  <Button onClick={postComment} disabled={posting || !commentBody.trim()}>
                    {posting ? 'Posting…' : 'Post comment'}
                  </Button>
                </div>
              </div>
            )}

            {tab === 'activity' && (
              <ul className="space-y-3">
                {sortedTimeline.map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm border-b border-gray-100 pb-3">
                    <span className="text-lg leading-none">{timelineIcon(ev.type)}</span>
                    <div>
                      <p className="text-gray-900">{ev.details}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTs(ev.timestamp)} · {ev.userName}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'attachments' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {attachmentList.length === 0 ? (
                  <p className="text-gray-500 text-sm">No attachments.</p>
                ) : (
                  attachmentList.map((a) => (
                    <a
                      key={`${a.fileUrl}-${a.fileName}`}
                      href={a.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                    >
                      <Paperclip className="h-8 w-8 text-gray-400" />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{a.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {(a as { uploadedBy?: string }).uploadedBy || '—'} · {formatTs((a as { uploadedAt?: unknown }).uploadedAt)}
                        </p>
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-white shadow-sm">
              <div>
                <Label className="text-xs text-gray-500">Status</Label>
                <select
                  className="mt-1 w-full border rounded-md h-10 px-2 text-sm"
                  value={ticket.status}
                  onChange={(e) => changeStatus(e.target.value as SupportTicketStatus)}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Priority</Label>
                <select
                  className="mt-1 w-full border rounded-md h-10 px-2 text-sm"
                  value={ticket.priority}
                  onChange={(e) => changePriority(e.target.value as SupportTicketPriority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{SUPPORT_TYPE_LABELS[ticket.type] || ticket.type}</Badge>
                <Badge variant="secondary">{SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category}</Badge>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Assigned to</Label>
                <select
                  className="mt-1 w-full border rounded-md h-10 px-2 text-sm"
                  value={ticket.assignedTo || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const a = admins.find((x) => x.id === v);
                    assignTo(v, a?.fullName || '');
                  }}
                >
                  <option value="">Select admin…</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>{a.fullName}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs text-gray-500">Due date</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="date" value={dueInput} onChange={(e) => setDueInput(e.target.value)} />
                  <Button type="button" size="sm" variant="secondary" onClick={saveDueDate}>Save</Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-2 bg-white shadow-sm">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> Submitter
              </h3>
              <p className="text-sm font-medium">{ticket.submittedByName}</p>
              <p className="text-xs text-gray-600">{ticket.submittedByEmail}</p>
              <Badge variant="outline" className="capitalize">{ticket.submittedByRole}</Badge>
              <Link href={submitterProfileHref} className="text-xs text-blue-600 block mt-2">
                Open directory →
              </Link>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-2 bg-white shadow-sm">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <LinkIcon className="h-4 w-4" /> Related
              </h3>
              {ticket.relatedWorkOrderId && (
                <Link className="text-sm text-blue-600 block" href={`/admin-portal/work-orders/${ticket.relatedWorkOrderId}`}>
                  WO {ticket.relatedWorkOrderNumber || ticket.relatedWorkOrderId}
                </Link>
              )}
              {ticket.relatedInvoiceId && (
                <Link className="text-sm text-blue-600 block" href={`/admin-portal/invoices/${ticket.relatedInvoiceId}`}>
                  Invoice {ticket.relatedInvoiceNumber || ticket.relatedInvoiceId}
                </Link>
              )}
              {ticket.relatedQuoteId && (
                <Link className="text-sm text-blue-600 block" href={`/admin-portal/quotes`}>
                  Quote {ticket.relatedQuoteId}
                </Link>
              )}
              {!ticket.relatedWorkOrderId && !ticket.relatedInvoiceId && !ticket.relatedQuoteId && (
                <p className="text-xs text-gray-500">None linked</p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-2 bg-white shadow-sm">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" /> SLA / timing
              </h3>
              <p className="text-xs text-gray-600">Created: {formatTs(ticket.createdAt)}</p>
              <p className="text-xs text-gray-600">First response: {formatTs(ticket.firstResponseAt)}</p>
              <p className="text-xs text-gray-600">Resolved: {formatTs(ticket.resolvedAt)}</p>
              <p className="text-xs text-gray-600">Closed: {formatTs(ticket.closedAt)}</p>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-2 bg-white shadow-sm">
              <Label className="text-xs">Tags</Label>
              <div className="flex flex-wrap gap-1">
                {(ticket.tags || []).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200 hover:bg-gray-200"
                    onClick={() => removeTag(t)}
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag" />
                <Button type="button" size="sm" variant="secondary" onClick={addTag}>Add</Button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-2 bg-white shadow-sm">
              <Label className="text-xs">Internal notes (not visible to clients)</Label>
              <Textarea value={internalNotesLocal} onChange={(e) => setInternalNotesLocal(e.target.value)} className="min-h-[80px]" />
              <Button size="sm" variant="outline" onClick={saveInternalNotes}>Save notes</Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" onClick={() => changeStatus('closed')}>Close ticket</Button>
              {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                <Button size="sm" variant="secondary" onClick={() => changeStatus('open')}>Reopen</Button>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </AdminLayout>
  );
}
