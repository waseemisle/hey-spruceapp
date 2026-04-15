// Shared support-ticket list + detail for all three roles.
// Admins see all tickets; clients/subs see their own (Firestore rules enforce this).
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  collection, onSnapshot, query, where, orderBy,
  doc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { toast } from 'sonner-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_PRIORITY_LABELS,
} from '@/lib/support-ticket-helpers';
import { formatDateTime } from '@/lib/utils';
import { api } from '@/lib/api';

export function SupportTicketsList({ basePath }: { basePath: string }) {
  const { user, userRole } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const base = collection(db, 'supportTickets');
    const q = userRole === 'admin'
      ? query(base, orderBy('createdAt', 'desc'))
      : query(base, where('submittedBy', '==', user.uid));
    const unsub = onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setItems([]));
    return () => unsub();
  }, [user, userRole]);

  return (
    <PageContainer scroll={false}>
      <PageHeader
        title="Support Tickets"
        actions={<Button size="sm" onPress={() => setCreating(true)}>New</Button>}
      />
      {items.length === 0 ? <EmptyState title="No tickets yet" /> : (
        <FlashList
          data={items}
          
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <Card onPress={() => router.push(`${basePath}/${item.id}` as any)} className="mb-2">
              <View className="flex-row justify-between items-center">
                <CardTitle>{item.ticketNumber || item.id.slice(0, 8)}</CardTitle>
                <Badge status={item.status} />
              </View>
              <Text className="text-sm mt-1" numberOfLines={1}>{item.title}</Text>
              <View className="flex-row gap-2 mt-2">
                <Badge text={SUPPORT_CATEGORY_LABELS[item.category] || item.category} />
                <Badge priority={item.priority} text={SUPPORT_PRIORITY_LABELS[item.priority]} />
              </View>
            </Card>
          )}
        />
      )}
      {creating ? <CreateTicketSheet onClose={() => setCreating(false)} /> : null}
    </PageContainer>
  );
}

function CreateTicketSheet({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const { user, userProfile, userRole } = useAuth();

  const submit = async () => {
    if (!title || !description) return;
    setBusy(true);
    try {
      await api.post('/api/support-tickets/create', {
        title,
        description,
        category: 'general',
        priority: 'medium',
        type: 'question',
        submittedBy: user!.uid,
        submittedByName: userProfile?.fullName,
        submittedByEmail: userProfile?.email,
        submittedByRole: userRole,
      });
      toast.success('Ticket created');
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <View className="absolute inset-0 bg-black/50 justify-end">
      <View className="bg-beige p-4 rounded-t-xl">
        <Text className="text-lg font-bold mb-3">New Support Ticket</Text>
        <Input label="Title" value={title} onChangeText={setTitle} />
        <Textarea label="Describe the issue" value={description} onChangeText={setDescription} />
        <View className="flex-row gap-2">
          <View className="flex-1"><Button variant="outline" onPress={onClose}>Cancel</Button></View>
          <View className="flex-1"><Button onPress={submit} loading={busy}>Submit</Button></View>
        </View>
      </View>
    </View>
  );
}

export function SupportTicketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, userProfile, userRole } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubT = onSnapshot(doc(db, 'supportTickets', id as string), (s) => {
      if (s.exists()) setTicket({ id: s.id, ...s.data() });
    });
    const unsubC = onSnapshot(
      query(collection(db, 'supportTickets', id as string, 'comments'), orderBy('createdAt', 'asc')),
      (s) => setComments(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => { unsubT(); unsubC(); };
  }, [id]);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/support-tickets/comment', {
        ticketId: id,
        body: text.trim(),
        isInternal: false,
        authorId: user!.uid,
        authorName: userProfile?.fullName,
        authorEmail: userProfile?.email,
        authorRole: userRole,
      });
      setText('');
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  if (!ticket) return <PageContainer><Text>Loading…</Text></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title={ticket.ticketNumber || 'Ticket'} subtitle={ticket.title} />
      <View className="flex-row gap-2 mb-3">
        <Badge status={ticket.status} text={SUPPORT_STATUS_LABELS[ticket.status]} />
        <Badge priority={ticket.priority} text={SUPPORT_PRIORITY_LABELS[ticket.priority]} />
      </View>
      <Card className="mb-3"><Text>{ticket.description}</Text></Card>

      <Text className="font-semibold text-foreground mb-2">Comments</Text>
      {comments.filter((c) => !c.isInternal || userRole === 'admin').map((c) => (
        <Card key={c.id} className="mb-2">
          <View className="flex-row justify-between">
            <Text className="font-semibold text-sm">{c.authorName}</Text>
            <Text className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</Text>
          </View>
          <Text className="mt-1">{c.body}</Text>
        </Card>
      ))}
      <Textarea placeholder="Add a comment…" value={text} onChangeText={setText} />
      <Button onPress={post} loading={busy}>Post comment</Button>
    </PageContainer>
  );
}
