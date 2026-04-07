'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Users, Search, Loader2, Shield, User, Wrench, ChevronDown, ChevronUp,
  LogIn, LogOut, Clock, RefreshCw,
} from 'lucide-react';

interface UserEntry {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string | null;
  companyName: string;
  loginCount: number;
}

interface LoginLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  companyName: string;
  loginAt: string | null;
  logoutAt: string | null;
  sessionDuration: number | null;
}

const toEST = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }) + ' EST';
};

const loginAgo = (iso: string | null) => {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'Just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
};

const loginColor = (iso: string | null) => {
  if (!iso) return 'text-gray-400';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 86400000) return 'text-emerald-600';
  if (ms < 604800000) return 'text-yellow-600';
  return 'text-red-600';
};

const roleBadge = (role: string) => {
  const m: Record<string, string> = {
    admin: 'bg-purple-50 text-purple-700 border-purple-200',
    client: 'bg-blue-50 text-blue-700 border-blue-200',
    subcontractor: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return m[role] || 'bg-gray-50 text-gray-700 border-gray-200';
};

const roleIcon = (role: string) => {
  if (role === 'admin') return <Shield className="h-3 w-3" />;
  if (role === 'client') return <User className="h-3 w-3" />;
  return <Wrench className="h-3 w-3" />;
};

const fmtDuration = (mins: number | null) => {
  if (mins === null || mins === undefined) return '—';
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export default function UserActivityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { router.push('/portal-login'); return; }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/user-activity');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
      setLogs(data.logs || []);
    } catch {}
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchData();
  }, [loading, fetchData]);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.companyName.toLowerCase().includes(q);
    }
    return true;
  });

  const getUserLogs = (userId: string) => logs.filter(l => l.userId === userId);

  const counts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    client: users.filter(u => u.role === 'client').length,
    subcontractor: users.filter(u => u.role === 'subcontractor').length,
    active24h: users.filter(u => u.lastLogin && Date.now() - new Date(u.lastLogin).getTime() < 86400000).length,
    totalLogins: logs.length,
  };

  if (loading) {
    return <AdminLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">User Activity</h1>
            <p className="text-muted-foreground mt-1">Login history for all users (times in EST)</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDataLoading(true); fetchData(); }}>
            <RefreshCw className={`h-4 w-4 mr-1 ${dataLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Total Users', val: counts.all, color: '' },
            { label: 'Admins', val: counts.admin, color: 'text-purple-600' },
            { label: 'Clients', val: counts.client, color: 'text-blue-600' },
            { label: 'Subcontractors', val: counts.subcontractor, color: 'text-orange-600' },
            { label: 'Active (24h)', val: counts.active24h, color: 'text-emerald-600' },
            { label: 'Total Logins', val: counts.totalLogins, color: 'text-indigo-600' },
          ].map(c => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`text-2xl font-bold ${c.color}`}>{dataLoading ? '...' : c.val}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, email, company..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {['all', 'admin', 'client', 'subcontractor'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === r ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border hover:bg-muted'
              }`}
            >
              {r === 'all' ? `All (${counts.all})` : `${r.charAt(0).toUpperCase() + r.slice(1)}s (${counts[r as keyof typeof counts]})`}
            </button>
          ))}
        </div>

        {/* User Table */}
        <Card>
          <CardContent className="p-0">
            {dataLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No users found</div>
            ) : (
              <div className="divide-y">
                {filtered.map(u => {
                  const isExpanded = expandedUser === u.id;
                  const userLogs = isExpanded ? getUserLogs(u.id) : [];
                  return (
                    <div key={`${u.role}-${u.id}`}>
                      <button
                        onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-foreground">{u.name}</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${roleBadge(u.role)}`}>
                                {roleIcon(u.role)} {u.role.toUpperCase()}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                u.status === 'active' || u.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              }`}>
                                {u.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{u.email}{u.companyName ? ` • ${u.companyName}` : ''}</div>
                          </div>
                          <div className="hidden md:flex items-center gap-6 shrink-0 text-right">
                            <div>
                              <div className="text-xs text-muted-foreground">Last Login</div>
                              <div className={`text-xs font-semibold ${loginColor(u.lastLogin)}`}>{loginAgo(u.lastLogin)}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Logins</div>
                              <div className="text-xs font-semibold text-foreground">{u.loginCount}</div>
                            </div>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0 ml-2" /> : <ChevronDown className="h-4 w-4 shrink-0 ml-2" />}
                      </button>

                      {isExpanded && (
                        <div className="bg-muted/30 border-t px-4 py-3">
                          {userLogs.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">No login records yet</p>
                          ) : (
                            <div className="space-y-1.5 max-h-80 overflow-y-auto">
                              <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-muted-foreground uppercase px-3 pb-1">
                                <span>Login (EST)</span>
                                <span>Logout (EST)</span>
                                <span>Duration</span>
                                <span>Status</span>
                              </div>
                              {userLogs.map(log => (
                                <div key={log.id} className="grid grid-cols-4 gap-2 items-center p-3 rounded-lg bg-card border border-border text-sm">
                                  <div className="flex items-center gap-1.5">
                                    <LogIn className="h-3 w-3 text-emerald-500 shrink-0" />
                                    <span className="text-xs font-mono">{toEST(log.loginAt)}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {log.logoutAt ? (
                                      <><LogOut className="h-3 w-3 text-red-400 shrink-0" /><span className="text-xs font-mono">{toEST(log.logoutAt)}</span></>
                                    ) : (
                                      <span className="text-xs text-emerald-600 font-medium">Still active</span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-xs font-medium">{fmtDuration(log.sessionDuration)}</span>
                                  </div>
                                  <div>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                      log.logoutAt ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    }`}>
                                      {log.logoutAt ? 'ENDED' : 'ACTIVE'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
