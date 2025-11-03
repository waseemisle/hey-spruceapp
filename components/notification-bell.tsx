'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter, usePathname } from 'next/navigation';

interface Notification {
  id: string;
  userId: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  type: 'work_order' | 'quote' | 'invoice' | 'assignment' | 'completion' | 'schedule' | 'general';
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location';
  read: boolean;
  createdAt: any;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  
  // Determine messages page based on current path
  const getMessagesPath = () => {
    if (pathname?.startsWith('/admin-portal')) return '/admin-portal/messages';
    if (pathname?.startsWith('/client-portal')) return '/client-portal/messages';
    if (pathname?.startsWith('/subcontractor-portal')) return '/subcontractor-portal/messages';
    return '/messages'; // fallback
  };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const notificationsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Notification[];

      setNotifications(notificationsData);
      setUnreadCount(notificationsData.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, []);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await updateDoc(doc(db, 'notifications', notification.id), {
        read: true,
      });
    }

    // Navigate to link if provided
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => !n.read);
    await Promise.all(
      unreadNotifications.map(n =>
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      )
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">
            Notifications {unreadCount > 0 && `(${unreadCount})`}
          </h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <Bell className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notification) => {
                const getTypeIcon = () => {
                  switch (notification.type) {
                    case 'work_order':
                      return '📋';
                    case 'quote':
                      return '💰';
                    case 'invoice':
                      return '🧾';
                    case 'assignment':
                      return '✅';
                    case 'completion':
                      return '✔️';
                    case 'schedule':
                      return '📅';
                    default:
                      return '🔔';
                  }
                };

                const formatTime = () => {
                  if (!notification.createdAt) return 'Just now';
                  const createdAt = notification.createdAt?.toDate?.() || notification.createdAt;
                  const now = new Date();
                  const diffMs = now.getTime() - new Date(createdAt).getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) return 'Just now';
                  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                  return new Date(createdAt).toLocaleDateString();
                };

                return (
                  <DropdownMenuItem
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notification.read ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <span className="text-xl flex-shrink-0">{getTypeIcon()}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mb-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatTime()}
                        </p>
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          )}
        </div>
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-t bg-gray-50">
            <button
              onClick={() => router.push(getMessagesPath())}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium w-full text-center"
            >
              View All Notifications
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
