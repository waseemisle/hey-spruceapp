'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search, MapPin, Star, Zap, DollarSign, ThumbsUp, Award,
  Users, Mail, Phone, Filter, X, TrendingUp, Shield,
  CheckCircle, ChevronDown, BarChart2, MessageSquare, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone?: string;
  skills: string[];
  licenseNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  // Computed performance metrics
  speedScore?: number;
  qualityScore?: number;
  priceScore?: number;
  engagementScore?: number;
  completedJobs?: number;
  totalInvoiceAmount?: number;
  clientCount?: number;
  avgResponseDays?: number;
}

interface PerformanceBadge {
  label: string;
  color: string;
  icon: React.ElementType;
}

function getPerformanceBadges(sub: Subcontractor): PerformanceBadge[] {
  const badges: PerformanceBadge[] = [];
  if ((sub.speedScore ?? 0) >= 80) badges.push({ label: 'Top Speed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: Zap });
  if ((sub.qualityScore ?? 0) >= 80) badges.push({ label: 'Top Quality', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: Star });
  if ((sub.priceScore ?? 0) >= 75) badges.push({ label: 'Cost-Effective', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: DollarSign });
  if ((sub.engagementScore ?? 0) >= 80) badges.push({ label: 'Top Engagement', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: ThumbsUp });
  if ((sub.completedJobs ?? 0) >= 10) badges.push({ label: 'Experienced', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: Award });
  return badges;
}

function PercentileBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-muted-foreground font-medium">{value}th</span>
    </div>
  );
}

function ProviderCard({
  sub,
  rank,
  onInvite,
  onMessage,
  compareIds,
  onToggleCompare,
}: {
  sub: Subcontractor;
  rank: number;
  onInvite: (sub: Subcontractor) => void;
  onMessage: (sub: Subcontractor) => void;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
}) {
  const badges = getPerformanceBadges(sub);
  const isComparing = compareIds.includes(sub.uid);

  return (
    <div className={`bg-card border rounded-xl p-5 hover:shadow-md transition-all ${isComparing ? 'ring-2 ring-primary' : ''}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-lg">
              {(sub.businessName || sub.fullName || '?').charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap gap-1 mb-1">
              {badges.map((b) => (
                <span key={b.label} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${b.color}`}>
                  <b.icon className="h-3 w-3" />
                  {b.label}
                </span>
              ))}
            </div>

            {/* Name */}
            <h3 className="font-semibold text-foreground truncate">
              {sub.businessName || sub.fullName}
            </h3>
            {sub.businessName && sub.fullName !== sub.businessName && (
              <p className="text-xs text-muted-foreground truncate">{sub.fullName}</p>
            )}
          </div>
        </div>

        {/* Rank badge */}
        {rank <= 3 && (
          <div className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-bold ${
            rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
            rank === 2 ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' :
            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
          }`}>
            #{rank} CHOICE
          </div>
        )}
      </div>

      {/* Info + Performance grid */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Left: provider info */}
        <div className="space-y-2 text-sm">
          {sub.skills && sub.skills.length > 0 && (
            <div className="flex gap-1.5">
              <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {sub.skills.slice(0, 4).map((skill) => (
                  <span key={skill} className="text-muted-foreground">{skill}</span>
                ))}
                {sub.skills.length > 4 && (
                  <span className="text-muted-foreground">+{sub.skills.length - 4} more</span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span>{sub.completedJobs ?? 0} completed jobs</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>{sub.clientCount ?? 0} clients on platform</span>
          </div>
          {sub.licenseNumber && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Licensed: {sub.licenseNumber}</span>
            </div>
          )}
        </div>

        {/* Right: performance scores */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground mb-2">Performance Score Percentiles</p>
          <PercentileBar label="Speed" value={sub.speedScore ?? 50} color="bg-blue-500" />
          <PercentileBar label="Quality" value={sub.qualityScore ?? 50} color="bg-green-500" />
          <PercentileBar label="Price" value={sub.priceScore ?? 50} color="bg-yellow-500" />
          <PercentileBar label="Engagement" value={sub.engagementScore ?? 50} color="bg-purple-500" />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isComparing}
            onChange={() => onToggleCompare(sub.uid)}
            className="rounded border-muted-foreground"
            id={`compare-${sub.uid}`}
          />
          <label htmlFor={`compare-${sub.uid}`} className="text-sm text-muted-foreground cursor-pointer">
            Compare
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onMessage(sub)}>
            <MessageSquare className="h-4 w-4 mr-1" />
            Message
          </Button>
          <Button size="sm" onClick={() => onInvite(sub)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Invite
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComparePanel({ subs, onClose }: { subs: Subcontractor[]; onClose: () => void }) {
  if (subs.length < 2) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-lg p-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">Comparing {subs.length} providers</span>
          <div className="flex gap-2 flex-wrap">
            {subs.map((s) => (
              <span key={s.uid} className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                {s.businessName || s.fullName}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default">
            <BarChart2 className="h-4 w-4 mr-1" />
            View Comparison
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProviderSearchPage() {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTrade, setSearchTrade] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [filterDiverse, setFilterDiverse] = useState(false);
  const [filterTopRated, setFilterTopRated] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'speed' | 'quality' | 'price' | 'engagement'>('relevance');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [allSkills, setAllSkills] = useState<string[]>([]);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      setLoading(true);

      // Fetch approved subcontractors
      const subsSnap = await getDocs(
        query(collection(db, 'subcontractors'), where('status', '==', 'approved'))
      );
      const subs: Subcontractor[] = subsSnap.docs.map(d => ({
        uid: d.id,
        ...(d.data() as Omit<Subcontractor, 'uid'>),
      }));

      // Fetch work orders to compute performance metrics
      const woSnap = await getDocs(collection(db, 'workOrders'));
      const invoiceSnap = await getDocs(collection(db, 'invoices'));

      // Build metrics per subcontractor
      const completedJobsMap = new Map<string, number>();
      const clientsMap = new Map<string, Set<string>>();
      const totalInvoiceMap = new Map<string, number>();
      const avgDaysMap = new Map<string, number[]>();

      woSnap.docs.forEach(d => {
        const wo = d.data();
        const subId = wo.assignedTo || wo.assignedSubcontractor;
        if (!subId) return;
        if (wo.status === 'completed') {
          completedJobsMap.set(subId, (completedJobsMap.get(subId) ?? 0) + 1);
        }
        if (wo.clientId) {
          if (!clientsMap.has(subId)) clientsMap.set(subId, new Set());
          clientsMap.get(subId)!.add(wo.clientId);
        }
        // Compute response days (assignedAt → completedAt)
        if (wo.assignedAt && wo.completedAt && wo.status === 'completed') {
          const days = (wo.completedAt.toMillis() - wo.assignedAt.toMillis()) / (1000 * 60 * 60 * 24);
          if (!avgDaysMap.has(subId)) avgDaysMap.set(subId, []);
          avgDaysMap.get(subId)!.push(days);
        }
      });

      invoiceSnap.docs.forEach(d => {
        const inv = d.data();
        const subId = inv.subcontractorId;
        if (!subId) return;
        totalInvoiceMap.set(subId, (totalInvoiceMap.get(subId) ?? 0) + (inv.totalAmount ?? 0));
      });

      // Normalize scores to percentiles (simple min-max scaling across all subs)
      const completedJobsList = subs.map(s => completedJobsMap.get(s.uid) ?? 0);
      const maxJobs = Math.max(...completedJobsList, 1);
      const avgInvoiceList = subs.map(s => totalInvoiceMap.get(s.uid) ?? 0);
      const maxInvoice = Math.max(...avgInvoiceList, 1);

      const enrichedSubs: Subcontractor[] = subs.map(s => {
        const jobs = completedJobsMap.get(s.uid) ?? 0;
        const clients = clientsMap.get(s.uid)?.size ?? 0;
        const invoice = totalInvoiceMap.get(s.uid) ?? 0;
        const daysList = avgDaysMap.get(s.uid) ?? [];
        const avgDays = daysList.length > 0 ? daysList.reduce((a, b) => a + b, 0) / daysList.length : 7;

        // Compute relative percentile scores (0-100)
        const speedScore = Math.round(Math.max(10, Math.min(99, 99 - (avgDays / 30) * 60 + jobs * 2)));
        const qualityScore = Math.round(Math.max(10, Math.min(99, (jobs / maxJobs) * 80 + 20 + (clients * 5))));
        const priceScore = Math.round(Math.max(10, Math.min(99, invoice > 0 ? Math.max(20, 99 - (invoice / maxInvoice) * 50) : 50)));
        const engagementScore = Math.round(Math.max(10, Math.min(99, (clients * 15) + (jobs * 3) + (s.skills?.length ?? 0) * 3)));

        return {
          ...s,
          completedJobs: jobs,
          clientCount: clients,
          totalInvoiceAmount: invoice,
          avgResponseDays: avgDays,
          speedScore: Math.min(99, speedScore),
          qualityScore: Math.min(99, qualityScore),
          priceScore: Math.min(99, priceScore),
          engagementScore: Math.min(99, engagementScore),
        };
      });

      // Collect all unique skills for autocomplete
      const skills = new Set<string>();
      enrichedSubs.forEach(s => (s.skills ?? []).forEach(skill => skills.add(skill)));
      setAllSkills(Array.from(skills).sort());

      setSubcontractors(enrichedSubs);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = subcontractors;

    // Filter by trade/skill search
    if (searchTrade.trim()) {
      const term = searchTrade.toLowerCase();
      result = result.filter(s =>
        (s.skills ?? []).some(sk => sk.toLowerCase().includes(term)) ||
        (s.businessName ?? '').toLowerCase().includes(term) ||
        (s.fullName ?? '').toLowerCase().includes(term)
      );
    }

    // Filter by top-rated
    if (filterTopRated) {
      result = result.filter(s => (s.qualityScore ?? 0) >= 70);
    }

    // Sort
    switch (sortBy) {
      case 'speed':
        result = [...result].sort((a, b) => (b.speedScore ?? 0) - (a.speedScore ?? 0));
        break;
      case 'quality':
        result = [...result].sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
        break;
      case 'price':
        result = [...result].sort((a, b) => (b.priceScore ?? 0) - (a.priceScore ?? 0));
        break;
      case 'engagement':
        result = [...result].sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0));
        break;
      default:
        // Relevance: weighted average of all scores
        result = [...result].sort((a, b) => {
          const scoreA = ((a.speedScore ?? 50) + (a.qualityScore ?? 50) + (a.engagementScore ?? 50)) / 3;
          const scoreB = ((b.speedScore ?? 50) + (b.qualityScore ?? 50) + (b.engagementScore ?? 50)) / 3;
          return scoreB - scoreA;
        });
    }

    return result;
  }, [subcontractors, searchTrade, filterTopRated, sortBy]);

  const toggleCompare = (id: string) => {
    setCompareIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const handleInvite = (sub: Subcontractor) => {
    toast.success(`Invite sent to ${sub.businessName || sub.fullName}`);
  };

  const handleMessage = (sub: Subcontractor) => {
    toast.info(`Opening message thread with ${sub.businessName || sub.fullName}...`);
  };

  const compareSubs = subcontractors.filter(s => compareIds.includes(s.uid));

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Hero Header */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-primary/90 to-primary mb-8 p-8 text-white">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-2">Industry professionals, meet the right providers.</h1>
            <p className="text-white/80 mb-6">Find and invite the best service providers for your facilities.</p>

            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTrade}
                  onChange={e => setSearchTrade(e.target.value)}
                  placeholder="Trade or service type (e.g. Electrical, HVAC)"
                  className="pl-9 bg-white text-gray-900 border-0 h-11"
                  list="skills-list"
                />
                <datalist id="skills-list">
                  {allSkills.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="relative flex-1 sm:max-w-xs">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchLocation}
                  onChange={e => setSearchLocation(e.target.value)}
                  placeholder="Location (City, State)"
                  className="pl-9 bg-white text-gray-900 border-0 h-11"
                />
              </div>
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 h-11 px-6">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Background decoration */}
          <div className="absolute right-0 bottom-0 opacity-10">
            <Users className="h-48 w-48" />
          </div>
        </div>

        {/* Network Opportunities Banner */}
        <div className="bg-card border rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Network Opportunities
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Request a custom opportunity to see which providers can boost your service and savings the most.
            </p>
          </div>
          <Button variant="outline" size="sm">
            Request Opportunity
          </Button>
        </div>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            {searchTrade ? (
              <h2 className="text-lg font-semibold">
                Top <span className="text-primary">{searchTrade}</span> providers
                {searchLocation && <> near <span className="text-primary">{searchLocation}</span></>}
              </h2>
            ) : (
              <h2 className="text-lg font-semibold">All Approved Providers <span className="text-muted-foreground text-base font-normal">({filtered.length})</span></h2>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filters */}
            <button
              onClick={() => setFilterTopRated(!filterTopRated)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterTopRated ? 'bg-primary text-white border-primary' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'}`}
            >
              <Star className="h-3 w-3 inline mr-1" />
              Top Rated
            </button>

            {/* Sort */}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="border-0 bg-transparent text-sm font-medium text-foreground cursor-pointer focus:outline-none"
              >
                <option value="relevance">Relevance</option>
                <option value="quality">Quality</option>
                <option value="speed">Speed</option>
                <option value="price">Price</option>
                <option value="engagement">Engagement</option>
              </select>
            </div>
          </div>
        </div>

        {/* Provider Cards Grid */}
        {loading ? (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-card border rounded-xl p-5 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-2 bg-muted rounded w-full" />
                  <div className="h-2 bg-muted rounded w-5/6" />
                  <div className="h-2 bg-muted rounded w-4/6" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No providers found</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              {searchTrade
                ? `No approved providers match "${searchTrade}". Try a different trade or clear the search.`
                : 'No approved providers yet. Add subcontractors and approve them to see them here.'}
            </p>
            {searchTrade && (
              <Button variant="outline" className="mt-4" onClick={() => setSearchTrade('')}>
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 pb-20">
            {filtered.map((sub, index) => (
              <ProviderCard
                key={sub.uid}
                sub={sub}
                rank={index + 1}
                onInvite={handleInvite}
                onMessage={handleMessage}
                compareIds={compareIds}
                onToggleCompare={toggleCompare}
              />
            ))}
          </div>
        )}

        {/* Compare Panel */}
        <ComparePanel subs={compareSubs} onClose={() => setCompareIds([])} />
      </div>
    </AdminLayout>
  );
}
