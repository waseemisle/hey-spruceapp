'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Award } from 'lucide-react';
import Link from 'next/link';

interface Subcontractor {
  id: string;
  uid: string;
  fullName: string;
  email: string;
  businessName?: string;
  status: string;
  speedScore?: number;
  qualityScore?: number;
  priceScore?: number;
  engagementScore?: number;
  completedJobs?: number;
}

function toPercent(v: number | undefined): number {
  if (v == null) return 0;
  return Math.min(100, Math.max(0, v));
}

function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = toPercent(value);
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium w-6">{pct}</span>
      </div>
    </div>
  );
}

export default function ContractorScorecardPage() {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'reviewed' | 'starred' | 'requested'>('all');

  useEffect(() => {
    const fetch = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved')));
        const subs = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            uid: data.uid,
            fullName: data.fullName,
            email: data.email,
            businessName: data.businessName,
            status: data.status,
            speedScore: data.speedScore ?? 50,
            qualityScore: data.qualityScore ?? 50,
            priceScore: data.priceScore ?? 50,
            engagementScore: data.engagementScore ?? 50,
            completedJobs: data.completedJobs ?? 0,
          } as Subcontractor;
        });
        setSubcontractors(subs);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (tab === 'reviewed') return subcontractors.filter((s) => (s as any).reviewedAt);
    if (tab === 'starred') return subcontractors.filter((s) => (s as any).starred);
    if (tab === 'requested') return subcontractors.filter((s) => (s as any).requestedAt);
    return subcontractors;
  }, [subcontractors, tab]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Contractor Scorecard</h1>
          <p className="text-muted-foreground">Quality, engagement, and price scores by contractor</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(['all', 'reviewed', 'starred', 'requested'] as const).map((t) => (
            <Button key={t} variant={tab === t ? 'default' : 'outline'} size="sm" onClick={() => setTab(t)}>
              {t === 'all' && 'All'}
              {t === 'reviewed' && 'Reviewed'}
              {t === 'starred' && 'Starred'}
              {t === 'requested' && 'Requested'}
            </Button>
          ))}
        </div>

        <div className="grid gap-4">
          {filtered.map((sub) => (
            <Card key={sub.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{sub.businessName || sub.fullName}</span>
                      {(sub.completedJobs ?? 0) >= 5 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30">
                          <Award className="h-3 w-3 mr-0.5" />
                          Experienced
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{sub.email}</p>
                  </div>
                  <div className="flex gap-6">
                    <ScoreBar value={sub.qualityScore ?? 0} label="Quality" color="bg-green-500" />
                    <ScoreBar value={sub.engagementScore ?? 0} label="Engagement" color="bg-purple-500" />
                    <ScoreBar value={sub.priceScore ?? 0} label="Price" color="bg-amber-500" />
                  </div>
                  <Link href={`/admin-portal/subcontractors`}>
                    <Button variant="outline" size="sm">View</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No contractors to show for this tab.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
