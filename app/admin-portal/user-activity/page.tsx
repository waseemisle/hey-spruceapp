'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Users, Search, Loader2, Shield, User, Wrench } from 'lucide-react';

interface UserEntry {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'client' | 'subcontractor';
  status?: string;
  lastLogin: Date | null;
  companyName?: string;
}

const toEST = (d: Date | null) => {
  if (!d) return 'Never';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  }) + ' EST';
};

const loginAgo = (d: Date | null) => {
  if (!d) return 'Never';
  const ms = Date.now() - d.getTime();
  if (ms < 60000) return 'Just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
};

const loginColor = (d: Date | null) => {
  if (!d) return 'text-gray-400';
  const ms = Date.now() - d.getTime();
  if (ms < 86400000) return 'text-emerald-600'; // within 24h
  if (ms < 604800000) return 'text-yellow-600'; // within 7d
  return 'text-red-600'; // older
};

const roleIcon = (role: string) => {
  switch (role) {
    case 'admin': return <Shield className="h-3.5 w-3.5" />;
    case 'client': return <User className="h-3.5 w-3.5" />;
    case 'subcontractor': return <Wrench className="h-3.5 w-3.5" />;
    default: return null;
  }
};

const roleBadge = (role: string) => {
  const colors = {
    admin: 'bg-purple-50 text-purple-700 border-purple-200',
    client: 'bg-blue-50 text-blue-700 border-blue-200',
    subcontractor: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return colors[role as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200';
};

export default function UserActivityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/portal-login'); return; }
      await fetchAllUsers();
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const fetchAllUsers = async () => {
    if (!db) return;
    const all: UserEntry[] = [];

    // Admins
    try {
      const snap = await getDocs(collection(db, 'adminUsers'));
      snap.docs.forEach(d => {
        const data = d.data();
        all.push({
          id: d.id, name: data.fullName || data.name || 'Admin', email: data.email || '',
          role: 'admin', status: 'active',
          lastLogin: data.lastLogin?.toDate?.() || null,
        });
      });
    } catch {}

    // Clients
    try {
      const snap = await getDocs(collection(db, 'clients'));
      snap.docs.forEach(d => {
        const data = d.data();
        all.push({
          id: d.id, name: data.fullName || data.name || 'Client', email: data.email || '',
          role: 'client', status: data.status || 'pending',
          lastLogin: data.lastLogin?.toDate?.() || null,
          companyName: data.companyName || '',
        });
      });
    } catch {}

    // Subcontractors
    try {
      const snap = await getDocs(collection(db, 'subcontractors'));
      snap.docs.forEach(d => {
        const data = d.data();
        all.push({
          id: d.id, name: data.fullName || data.name || 'Subcontractor', email: data.email || '',
          role: 'subcontractor', status: data.status || 'pending',
          lastLogin: data.lastLogin?.toDate?.() || null,
          companyName: data.companyName || '',
        });
      });
    } catch {}

    // Sort by last login (most recent first), never-logged-in at bottom
    all.sort((a, b) => {
      if (!a.lastLogin && !b.lastLogin) return 0;
      if (!a.lastLogin) return 1;
      if (!b.lastLogin) return -1;
      return b.lastLogin.getTime() - a.lastLogin.getTime();
    });

    setUsers(all);
  };

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.companyName || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    client: users.filter(u => u.role === 'client').length,
    subcontractor: users.filter(u => u.role === 'subcontractor').length,
    active24h: users.filter(u => u.lastLogin && Date.now() - u.lastLogin.getTime() < 86400000).length,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Activity</h1>
          <p className="text-muted-foreground mt-1">Login history for all users (times in EST)</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">{counts.all}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold text-purple-600">{counts.admin}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Clients</p>
              <p className="text-2xl font-bold text-blue-600">{counts.client}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Subcontractors</p>
              <p className="text-2xl font-bold text-orange-600">{counts.subcontractor}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active (24h)</p>
              <p className="text-2xl font-bold text-emerald-600">{counts.active24h}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or company..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {['all', 'admin', 'client', 'subcontractor'].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === r
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-card text-foreground border-border hover:bg-muted'
              }`}
            >
              {r === 'all' ? `All (${counts.all})` : `${r.charAt(0).toUpperCase() + r.slice(1)}s (${counts[r as keyof typeof counts]})`}
            </button>
          ))}
        </div>

        {/* User Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">User</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Last Login (EST)</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time Ago</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No users found</td></tr>
                  ) : filtered.map(u => (
                    <tr key={`${u.role}-${u.id}`} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                        {u.companyName && <div className="text-xs text-muted-foreground">{u.companyName}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleBadge(u.role)}`}>
                          {roleIcon(u.role)}
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          u.status === 'active' || u.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : u.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {(u.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono">{toEST(u.lastLogin)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-semibold ${loginColor(u.lastLogin)}`}>
                          {loginAgo(u.lastLogin)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
