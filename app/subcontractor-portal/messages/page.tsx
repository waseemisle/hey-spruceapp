'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot, where, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send } from 'lucide-react';

interface Chat {
  id: string;
  participants: string[];
  participantDetails: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  lastMessage: string;
  lastMessageTimestamp: any;
  createdAt: any;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: any;
}

export default function SubcontractorMessages() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Listen to chats where subcontractor is a participant
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(chatsQuery, (snapshot) => {
      const chatsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Chat[];
      setChats(chatsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedChat) return;

    // Listen to messages in selected chat
    const messagesQuery = query(
      collection(db, 'chats', selectedChat, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Message[];
      setMessages(messagesData);
    });

    return () => unsubscribe();
  }, [selectedChat]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await addDoc(collection(db, 'chats', selectedChat, 'messages'), {
        senderId: currentUser.uid,
        senderName: 'Subcontractor',
        senderRole: 'subcontractor',
        content: newMessage,
        seen: false,
        createdAt: serverTimestamp(),
      });

      // Update chat last message
      await updateDoc(doc(db, 'chats', selectedChat), {
        lastMessage: newMessage,
        lastMessageTimestamp: serverTimestamp(),
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  };

  const selectedChatData = chats.find(c => c.id === selectedChat);

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-2">Chat with admin team</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chats List */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              {chats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm">No conversations yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {chats.map(chat => {
                    const otherParticipant = chat.participantDetails?.find(
                      p => p.id !== auth.currentUser?.uid
                    );
                    return (
                      <div
                        key={chat.id}
                        onClick={() => setSelectedChat(chat.id)}
                        className={`p-3 rounded-lg cursor-pointer hover:bg-gray-100 ${
                          selectedChat === chat.id ? 'bg-green-50 border-2 border-green-500' : 'bg-gray-50'
                        }`}
                      >
                        <div className="font-semibold text-sm">{otherParticipant?.name || 'Admin'}</div>
                        <div className="text-xs text-gray-600 truncate">{chat.lastMessage}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat Window */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedChatData
                  ? selectedChatData.participantDetails?.find(p => p.id !== auth.currentUser?.uid)?.name || 'Chat'
                  : 'Select a conversation'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedChat ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Select a conversation to start chatting</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Messages */}
                  <div className="h-96 overflow-y-auto space-y-3 p-4 bg-gray-50 rounded-lg">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-xs px-4 py-2 rounded-lg ${
                            message.senderId === auth.currentUser?.uid
                              ? 'bg-green-600 text-white'
                              : 'bg-white text-gray-900'
                          }`}
                        >
                          <div className="text-xs opacity-75 mb-1">{message.senderName}</div>
                          <div className="text-sm">{message.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="flex gap-2">
                    <Input
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1"
                    />
                    <Button onClick={sendMessage}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SubcontractorLayout>
  );
}
