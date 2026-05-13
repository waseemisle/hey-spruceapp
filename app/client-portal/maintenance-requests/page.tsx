'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, where } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, User, MapPin, Search, Eye, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
interface MaintRequest {
  id: string;
  venue: string;
  requestor: string;
  date: any;
  title: string;
  description: string;
  image?: string;
  priority: string;
  status: string;
  createdAt: any;
  clientId?: string;
  locationId?: string;
  companyId?: string;
}

export default function ClientMaintenanceRequests() {
  const { auth, db } = useFirebaseInstance();
  const [requests, setRequests] = useState<MaintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<MaintRequest | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [clientLocationIds, setClientLocationIds] = useState<Set<string>>(new Set());
  const [clientCompanyId, setClientCompanyId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Check if client has permission to view maintenance requests
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          if (clientDoc.exists()) {
            const clientData = clientDoc.data();
            const permissions = clientData.permissions || {};
            if (permissions.viewMaintenanceRequests) {
              setHasPermission(true);

              // Fetch client's companyId and location IDs for scoping
              const companyId = clientData.companyId || null;
              setClientCompanyId(companyId);

              const locationsSnap = await getDocs(
                query(collection(db, 'locations'), where('clientId', '==', user.uid))
              );
              const locationIds = new Set(locationsSnap.docs.map(d => d.id));
              setClientLocationIds(locationIds);

              // Fetch maintenance requests — capped to bound first-paint cost.
              // Page filters client-side by company / location, so a server-side
              // composite-index filter would be ideal, but cap is the cheap fix.
              const maintRequestsQuery = query(
                collection(db, 'maint_requests'),
                orderBy('createdAt', 'desc'),
                limit(300),
              );

              const unsubscribe = onSnapshot(maintRequestsQuery, (snapshot) => {
                const requestsData = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data(),
                })) as MaintRequest[];
                setRequests(requestsData);
                setLoading(false);
              }, (error) => {
                console.error('Maintenance requests listener error:', error);
                setLoading(false);
              });

              return () => unsubscribe();
            } else {
              setHasPermission(false);
              setLoading(false);
            }
          } else {
            setHasPermission(false);
            setLoading(false);
          }
        } catch (error) {
          console.error('Error checking permissions:', error);
          setHasPermission(false);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, string> = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800',
    };
    return badges[priority.toLowerCase()] || 'bg-muted text-foreground';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      'in-progress': 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
    };
    return badges[status.toLowerCase()] || 'bg-muted text-foreground';
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    if (date.toDate) {
      return date.toDate().toLocaleDateString();
    }
    if (date instanceof Date) {
      return date.toLocaleDateString();
    }
    return new Date(date).toLocaleDateString();
  };

  const filtered = requests.filter((req) => {
    // Scope: only show requests that belong to this client's locations or company.
    // Legacy records without any scope fields are shown to all permitted clients.
    const hasScopeFields = req.clientId || req.locationId || req.companyId;
    if (hasScopeFields) {
      const matchesLocation = req.locationId ? clientLocationIds.has(req.locationId) : false;
      const matchesCompany = req.companyId && clientCompanyId ? req.companyId === clientCompanyId : false;
      if (!matchesLocation && !matchesCompany) return false;
    }

    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      req.title.toLowerCase().includes(q) ||
      req.venue.toLowerCase().includes(q) ||
      req.requestor.toLowerCase().includes(q) ||
      req.description.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <>
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (!hasPermission) {
    return (
      <>
        <PageContainer>
          <EmptyState
            icon={Wrench}
            title="Access Restricted"
            subtitle="You don't have permission to view maintenance requests. Please contact your administrator."
          />
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Maintenance Requests"
          subtitle="View maintenance requests from your properties"
          icon={Wrench}
        />

        <StatCards
          items={[
            { label: 'Total', value: requests.length, icon: Wrench, color: 'blue' },
            { label: 'Pending', value: requests.filter(r => r.status === 'pending').length, icon: Wrench, color: 'amber' },
            { label: 'In Progress', value: requests.filter(r => r.status === 'in-progress').length, icon: Wrench, color: 'purple' },
            { label: 'Completed', value: requests.filter(r => r.status === 'completed').length, icon: Wrench, color: 'emerald' },
          ]}
        />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search maintenance requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="No maintenance requests found"
            subtitle={searchQuery ? 'Try adjusting your search' : 'No maintenance requests yet'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((request) => (
              <div key={request.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-foreground leading-snug line-clamp-2">{request.title}</p>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${getPriorityBadge(request.priority)}`}>
                    {request.priority}
                  </span>
                </div>
                {request.image && (
                  <img src={request.image} alt={request.title} className="w-full h-36 object-cover rounded-md" />
                )}
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{request.venue}</span>
                  <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 shrink-0" />{request.requestor}</span>
                  <span>Date: {formatDate(request.date)}</span>
                  <p className="text-foreground line-clamp-2 mt-1">{request.description}</p>
                </div>
                <div className="border-t border-border pt-2 mt-auto flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(request.status)}`}>
                    {request.status}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => { setSelectedRequest(request); setShowModal(true); }}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {showModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
            <div className="my-auto flex w-full max-w-xl max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-4 rounded-t-2xl border-b border-border bg-card px-6 py-4">
                <h2 className="text-base font-semibold text-foreground truncate">{selectedRequest.title}</h2>
                <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {selectedRequest.image && (
                  <img src={selectedRequest.image} alt={selectedRequest.title} className="w-full h-56 object-cover rounded-lg" />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Venue</p>
                    <p className="font-medium text-sm mt-0.5">{selectedRequest.venue}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Requestor</p>
                    <p className="font-medium text-sm mt-0.5">{selectedRequest.requestor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                    <p className="font-medium text-sm mt-0.5">{formatDate(selectedRequest.date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Priority</p>
                    <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getPriorityBadge(selectedRequest.priority)}`}>
                      {selectedRequest.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                    <span className={`mt-0.5 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                  <p className="text-sm text-foreground">{selectedRequest.description}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}

