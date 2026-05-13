'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, orderBy, limit, onSnapshot, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Search, Trash2, X, Plus, UserPlus, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

import { PortalListPage } from '@/components/ui/portal-list-page';
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

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  collection: string;
}

export default function MessagesManagement() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [showDeleteThreadModal, setShowDeleteThreadModal] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<Chat | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Listen to chats where admin is a participant
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const chatsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Chat[];
        setChats(chatsData);
        setLoading(false);
      },
      (err) => {
        console.error('Chats listener error:', err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedChat) return;

    // Listen to messages in selected chat — most-recent 200, then reversed
    // client-side for chronological display.
    const messagesQuery = query(
      collection(db, 'chats', selectedChat, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(200),
    );

    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messagesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })).reverse() as Message[];
        setMessages(messagesData);
      },
      (err) => console.error('Messages listener error:', err),
    );

    return () => unsubscribe();
  }, [selectedChat]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await addDoc(collection(db, 'chats', selectedChat, 'messages'), {
        senderId: currentUser.uid,
        senderName: 'Admin',
        senderRole: 'admin',
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
      toast.error('Failed to send message');
    }
  };

  const handleDeleteMessage = (message: Message) => {
    setMessageToDelete(message);
    setShowDeleteMessageModal(true);
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete || !selectedChat) return;

    try {
      await deleteDoc(doc(db, 'chats', selectedChat, 'messages', messageToDelete.id));
      toast.success('Message deleted successfully');
      setShowDeleteMessageModal(false);
      setMessageToDelete(null);
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleDeleteThread = (chat: Chat) => {
    setThreadToDelete(chat);
    setShowDeleteThreadModal(true);
  };

  const confirmDeleteThread = async () => {
    if (!threadToDelete) return;

    try {
      // Delete all messages in the thread
      const messagesQuery = query(collection(db, 'chats', threadToDelete.id, 'messages'));
      const messagesSnapshot = await getDocs(messagesQuery);
      const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Delete the chat document
      await deleteDoc(doc(db, 'chats', threadToDelete.id));

      toast.success('Conversation deleted successfully');
      setShowDeleteThreadModal(false);
      setThreadToDelete(null);
      setSelectedChat(null);
    } catch (error) {
      console.error('Error deleting thread:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const fetchAllUsers = async () => {
    setLoadingUsers(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const collections = [
        { name: 'adminUsers', role: 'admin' },
        { name: 'subcontractors', role: 'subcontractor' },
        { name: 'users', role: 'user' },
        { name: 'clients', role: 'client' }
      ];

      const userPromises = collections.map(async ({ name, role }) => {
        const snapshot = await getDocs(collection(db, name));
        return snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().companyName || doc.data().email || 'Unknown',
          email: doc.data().email || '',
          role: role,
          collection: name
        }));
      });

      const usersArrays = await Promise.all(userPromises);
      const users = usersArrays.flat().filter(user => user.id !== currentUser.uid);
      setAllUsers(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const startChatWithUser = async (user: User) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Check if chat already exists
      const existingChat = chats.find(chat =>
        chat.participants.includes(user.id) && chat.participants.includes(currentUser.uid)
      );

      if (existingChat) {
        setSelectedChat(existingChat.id);
        setShowNewChatModal(false);
        toast.info('Conversation already exists');
        return;
      }

      // Create new chat
      const chatData = {
        participants: [currentUser.uid, user.id],
        participantDetails: [
          {
            id: currentUser.uid,
            name: 'Admin',
            email: currentUser.email || '',
            role: 'admin'
          },
          {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        ],
        lastMessage: '',
        lastMessageTimestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      };

      const chatRef = await addDoc(collection(db, 'chats'), chatData);
      setSelectedChat(chatRef.id);
      setShowNewChatModal(false);
      toast.success(`Started conversation with ${user.name}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      toast.error('Failed to start conversation');
    }
  };

  const filteredChats = chats.filter(chat => {
    const searchLower = searchQuery.toLowerCase();
    const otherParticipant = chat.participantDetails?.find(
      p => p.id !== auth.currentUser?.uid
    );
    const searchMatch = !searchQuery ||
      (otherParticipant?.name && otherParticipant.name.toLowerCase().includes(searchLower)) ||
      (otherParticipant?.email && otherParticipant.email.toLowerCase().includes(searchLower)) ||
      (chat.lastMessage && chat.lastMessage.toLowerCase().includes(searchLower));

    return searchMatch;
  });

  const filteredUsers = allUsers.filter(user => {
    const searchLower = userSearchQuery.toLowerCase();
    return !userSearchQuery ||
      user.name.toLowerCase().includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      user.role.toLowerCase().includes(searchLower);
  });

  const selectedChatData = chats.find(c => c.id === selectedChat);

  if (loading) {
    return (
      <PortalListPage title="Messages" subtitle="Loading conversations…" icon={MessageSquare}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      title="Messages"
      subtitle="Chat with clients and subcontractors"
      icon={MessageSquare}
    >
      {/*
        Locked to viewport — chat is a single-screen workspace, the page
        itself does not scroll. Only the messages list scrolls inside the
        right pane.
      */}
      <div className="flex flex-col h-[calc(100vh-9rem)] gap-4">
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Chats List — hidden on mobile when a chat is open */}
          <Card className={`md:col-span-1 flex flex-col min-h-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
            <CardHeader className="flex-shrink-0">
              <div className="flex justify-between items-center">
                <CardTitle>Conversations</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    setShowNewChatModal(true);
                    fetchAllUsers();
                  }}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* Search Bar */}
              <div className="relative mb-4 flex-shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2">
              {filteredChats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No conversations found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredChats.map(chat => {
                    const otherParticipant = chat.participantDetails?.find(
                      p => p.id !== auth.currentUser?.uid
                    );
                    return (
                      <div
                        key={chat.id}
                        onClick={() => setSelectedChat(chat.id)}
                        className={`p-3 rounded-lg cursor-pointer hover:bg-muted ${
                          selectedChat === chat.id ? 'bg-primary/10 border-2 border-primary' : 'bg-muted'
                        }`}
                      >
                        <div className="font-semibold text-sm">{otherParticipant?.name || 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground truncate">{chat.lastMessage}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          {/* Chat Window */}
          <Card className={`md:col-span-2 flex flex-col min-h-0 ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
            <CardHeader className="flex-shrink-0">
              <div className="flex justify-between items-center gap-2">
                <CardTitle className="flex items-center gap-2 min-w-0">
                  {selectedChat && (
                    <button
                      type="button"
                      onClick={() => setSelectedChat(null)}
                      className="md:hidden -ml-1 p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  )}
                  <span className="truncate">
                    {selectedChatData
                      ? selectedChatData.participantDetails?.find(p => p.id !== auth.currentUser?.uid)?.name || 'Chat'
                      : 'Select a conversation'}
                  </span>
                </CardTitle>
                {selectedChatData && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteThread(selectedChatData)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Thread
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col">
              {!selectedChat ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <MessageSquare className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a conversation to start chatting</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col gap-4">
                  {/* Messages — single scroll surface for the page */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3 p-4 bg-muted rounded-lg">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex group ${
                          message.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {message.senderId !== auth.currentUser?.uid && (
                            <button
                              onClick={() => handleDeleteMessage(message)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                              title="Delete message"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </button>
                          )}
                          <div
                            className={`max-w-xs px-4 py-2 rounded-lg ${
                              message.senderId === auth.currentUser?.uid
                                ? 'bg-primary text-white'
                                : 'bg-card text-foreground'
                            }`}
                          >
                            <div className="text-xs opacity-75 mb-1">{message.senderName}</div>
                            <div className="text-sm">{message.content}</div>
                          </div>
                          {message.senderId === auth.currentUser?.uid && (
                            <button
                              onClick={() => handleDeleteMessage(message)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                              title="Delete message"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="flex-shrink-0 flex gap-2">
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

        {/* Delete Message Modal */}
        {showDeleteMessageModal && messageToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <div className="my-auto flex w-full max-w-md max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-lg bg-card shadow-lg">
              <div className="shrink-0 border-b border-border p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold">Delete Message</h2>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <p className="text-foreground">
                  Are you sure you want to delete this message?
                </p>
                <div className="bg-muted p-4 rounded">
                  <p className="text-sm"><strong>From:</strong> {messageToDelete.senderName}</p>
                  <p className="text-sm mt-2"><strong>Message:</strong> {messageToDelete.content}</p>
                </div>
                <p className="text-sm text-red-600">This action cannot be undone.</p>
              </div>
              <div className="flex shrink-0 gap-3 border-t border-border bg-card p-4 sm:p-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteMessageModal(false);
                      setMessageToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteMessage}
                    className="flex-1"
                  >
                    Delete Message
                  </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Thread Modal */}
        {showDeleteThreadModal && threadToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <div className="my-auto flex w-full max-w-md max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-lg bg-card shadow-lg">
              <div className="shrink-0 border-b border-border p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold">Delete Conversation</h2>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                <p className="text-foreground">
                  Are you sure you want to delete this entire conversation?
                </p>
                <div className="bg-muted p-4 rounded">
                  <p className="text-sm">
                    <strong>Conversation with:</strong> {
                      threadToDelete.participantDetails?.find(p => p.id !== auth.currentUser?.uid)?.name || 'Unknown'
                    }
                  </p>
                  <p className="text-sm mt-2">
                    <strong>Last message:</strong> {threadToDelete.lastMessage}
                  </p>
                </div>
                <p className="text-sm text-red-600">
                  This will permanently delete all messages in this conversation. This action cannot be undone.
                </p>
              </div>
              <div className="flex shrink-0 gap-3 border-t border-border bg-card p-4 sm:p-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteThreadModal(false);
                      setThreadToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteThread}
                    className="flex-1"
                  >
                    Delete Conversation
                  </Button>
              </div>
            </div>
          </div>
        )}

        {/* New Chat Modal */}
        {showNewChatModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <div className="my-auto flex w-full max-w-2xl max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-lg bg-card shadow-lg">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-bold truncate">Start New Conversation</h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    setShowNewChatModal(false);
                    setUserSearchQuery('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users by name, email, or role..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
                  {loadingUsers ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary"></div>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-12">
                      <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No users found</p>
                    </div>
                  ) : (
                    <div className="space-y-2 p-3">
                      {filteredUsers.map(user => (
                        <div
                          key={user.id}
                          onClick={() => startChatWithUser(user)}
                          className="p-4 bg-muted rounded-lg cursor-pointer hover:bg-primary/10 hover:border-primary/25 border border-transparent transition-all"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-semibold text-sm">{user.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">{user.email}</div>
                            </div>
                            <div className="ml-4">
                              <span className="px-2 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary capitalize">
                                {user.role}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalListPage>
  );
}
