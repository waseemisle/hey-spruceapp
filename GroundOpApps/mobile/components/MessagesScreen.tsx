// Shared chat list component used by admin, client, and subcontractor.
// Realtime via Firestore onSnapshot on chats where `participants` array-contains uid.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, serverTimestamp, doc, updateDoc, getDocs,
} from 'firebase/firestore';
import { SendHorizonal } from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/utils';

export function MessagesScreen() {
  const { user, userProfile, userRole } = useAuth();
  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageTimestamp', 'desc'),
    );
    const unsub = onSnapshot(q, (snap) => setChats(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setChats([]));
    return () => unsub();
  }, [user]);

  return (
    <PageContainer scroll={false}>
      <PageHeader title="Messages" />
      {chats.length === 0 ? <EmptyState title="No conversations yet" /> : (
        <FlashList
          data={chats}
          
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const other = (item.participantDetails || []).find((p: any) => p.id !== user?.uid);
            return (
              <Card onPress={() => setActiveChat(item)} className="mb-2">
                <View className="flex-row items-center gap-3">
                  <Avatar name={other?.name || '?'} />
                  <View className="flex-1">
                    <Text className="font-semibold text-foreground">{other?.name || 'Chat'}</Text>
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>{item.lastMessage}</Text>
                  </View>
                  {item.unreadCount?.[user!.uid] > 0 ? (
                    <View className="bg-destructive rounded-full w-6 h-6 items-center justify-center">
                      <Text className="text-white text-xs font-bold">{item.unreadCount[user!.uid]}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}
      {activeChat ? <ChatSheet chat={activeChat} onClose={() => setActiveChat(null)} /> : null}
    </PageContainer>
  );
}

function ChatSheet({ chat, onClose }: { chat: any; onClose: () => void }) {
  const { user, userProfile, userRole } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'chats', chat.id, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [chat.id]);

  useEffect(() => {
    // Mark messages as seen for this user
    if (!user) return;
    updateDoc(doc(db, 'chats', chat.id), {
      [`unreadCount.${user.uid}`]: 0,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [chat.id, user?.uid]);

  const send = async () => {
    if (!text.trim() || !user) return;
    const content = text.trim();
    setText('');
    await addDoc(collection(db, 'chats', chat.id, 'messages'), {
      chatId: chat.id,
      senderId: user.uid,
      senderName: userProfile?.fullName || userProfile?.businessName || 'User',
      senderRole: userRole || 'client',
      receiverId: (chat.participants || []).find((p: string) => p !== user.uid) || '',
      content,
      attachments: [],
      seen: false,
      createdAt: serverTimestamp(),
    });
    const unread: any = { ...(chat.unreadCount || {}) };
    (chat.participants || []).forEach((p: string) => {
      if (p !== user.uid) unread[p] = (unread[p] || 0) + 1;
    });
    await updateDoc(doc(db, 'chats', chat.id), {
      lastMessage: content,
      lastMessageTimestamp: serverTimestamp(),
      lastMessageSenderId: user.uid,
      unreadCount: unread,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <PageContainer scroll={false}>
        <PageHeader title="Chat" actions={<Button size="sm" variant="ghost" onPress={onClose}>Close</Button>} />
        <FlashList
          data={[...messages].reverse()}
          
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.uid;
            return (
              <View className={`my-1 ${mine ? 'items-end' : 'items-start'}`}>
                <View className={`px-3 py-2 rounded-lg max-w-[80%] ${mine ? 'bg-navy' : 'bg-secondary'}`}>
                  <Text className={mine ? 'text-white' : 'text-foreground'}>{item.content}</Text>
                </View>
                <Text className="text-[10px] text-muted-foreground mt-1">{formatDateTime(item.createdAt)}</Text>
              </View>
            );
          }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-row items-center gap-2 pt-2 border-t border-border">
          <View className="flex-1"><Input placeholder="Message…" value={text} onChangeText={setText} /></View>
          <Pressable onPress={send} className="bg-navy p-3 rounded-lg mb-3">
            <SendHorizonal size={18} color="#fff" />
          </Pressable>
        </KeyboardAvoidingView>
      </PageContainer>
    </Modal>
  );
}
