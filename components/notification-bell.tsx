'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  userId: string;
  userRole: 'admin' | 'client' | 'subcontractor';
  type:
    | 'work_order'
    | 'quote'
    | 'diagnostic_request'
    | 'invoice'
    | 'assignment'
    | 'completion'
    | 'schedule'
    | 'general'
    | 'location'
    | 'support_ticket';
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
  referenceType?: 'workOrder' | 'quote' | 'invoice' | 'location' | 'supportTicket';
  read: boolean;
  createdAt: any;
}

export default function NotificationBell() {
  const { auth, db } = useFirebaseInstance();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;

    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot?.();
      unsubscribeSnapshot = undefined;

      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      // Fetch the most recent 50 — enough that the dropdown's scroll
      // container shows everything a user practically cares about
      // without us needing a dedicated "View All" history page (the
      // previous footer link pointed at /messages which is a chat
      // page, not a notifications history, and confused users).
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      unsubscribeSnapshot = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const notificationsData = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Notification[];

          setNotifications(notificationsData);
          setUnreadCount(notificationsData.filter((n) => !n.read).length);
        },
        (err) => {
          console.error('NotificationBell snapshot error:', err);
          setNotifications([]);
          setUnreadCount(0);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnapshot?.();
    };
  }, [auth, db]);

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
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold leading-none rounded-full min-h-5 min-w-5 px-1 flex items-center justify-center tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className="z-[100] w-[calc(100vw-1rem)] sm:w-96 max-w-sm"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted">
          <h3 className="font-semibold text-foreground">
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
            <div className="px-4 py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
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
                    case 'diagnostic_request':
                      return '🩺';
                    case 'invoice':
                      return '🧾';
                    case 'assignment':
                      return '✅';
                    case 'completion':
                      return '✔️';
                    case 'schedule':
                      return '📅';
                    case 'location':
                      return '📍';
                    case 'support_ticket':
                      return '🎧';
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
                    className={`px-4 py-3 cursor-pointer hover:bg-muted transition-colors ${
                      !notification.read ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <span className="text-xl flex-shrink-0">{getTypeIcon()}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`text-sm ${!notification.read ? 'font-semibold text-foreground' : 'font-medium text-foreground'}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="h-2 w-2 bg-blue-600 rounded-full flex-shrink-0 mt-1"></span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
        {/*
          Footer "View All Notifications" link removed — it used to point
          at /<portal>/messages which is the chat page, not a
          notifications history. The dropdown now fetches up to 50
          recent notifications which covers practical use; a dedicated
          notifications page can be added later if needed.
        */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
