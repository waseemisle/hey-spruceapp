'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, QuerySnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';

interface NavigationBadgeProps {
  collectionName: string;
  countQuery: (userId: string) => any;
  badgeKey?: string;
}

export default function NavigationBadge({ collectionName, countQuery, badgeKey }: NavigationBadgeProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setCount(0);
        return;
      }

      const q = countQuery(user.uid);
      const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot) => {
        setCount(snapshot.size);
      });

      return () => unsubscribe();
    });

    return () => unsubscribeAuth();
  }, [countQuery]);

  if (count === 0) return null;

  return (
    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[20px]">
      {count > 99 ? '99+' : count}
    </span>
  );
}

