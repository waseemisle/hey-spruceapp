import { NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getServerDb } from '@/lib/firebase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getServerDb();

    // Fetch all login logs
    const snap = await getDocs(query(
      collection(db, 'emailLogs'),
      where('type', '==', 'user_login'),
    ));

    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        userName: data.userName,
        userEmail: data.userEmail,
        userRole: data.userRole,
        companyName: data.companyName || '',
        loginAt: data.loginAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || null,
        logoutAt: data.logoutAt?.toDate?.()?.toISOString() || null,
        sessionDuration: data.sessionDuration, // in minutes
      };
    });

    // Sort by loginAt descending
    logs.sort((a, b) => {
      if (!a.loginAt && !b.loginAt) return 0;
      if (!a.loginAt) return 1;
      if (!b.loginAt) return -1;
      return new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime();
    });

    // Also fetch user summary (last login per user from their docs)
    const users: any[] = [];
    const addUsers = async (col: string, role: string) => {
      try {
        const s = await getDocs(collection(db, col));
        s.docs.forEach(d => {
          const data = d.data();
          users.push({
            id: d.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            role,
            status: data.status || (role === 'admin' ? 'active' : 'pending'),
            lastLogin: data.lastLogin?.toDate?.()?.toISOString() || null,
            companyName: data.companyName || '',
          });
        });
      } catch {}
    };

    await Promise.all([
      addUsers('adminUsers', 'admin'),
      addUsers('clients', 'client'),
      addUsers('subcontractors', 'subcontractor'),
    ]);

    // Count logins per user
    const loginCounts = new Map<string, number>();
    logs.forEach(l => {
      loginCounts.set(l.userId, (loginCounts.get(l.userId) || 0) + 1);
    });

    const usersWithCounts = users.map(u => ({
      ...u,
      loginCount: loginCounts.get(u.id) || 0,
    }));

    usersWithCounts.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return 0;
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime();
    });

    return NextResponse.json({ users: usersWithCounts, logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
