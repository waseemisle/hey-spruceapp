'use client';

import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Wrench, User, MapPin, AlertCircle, Search, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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

              // Fetch maintenance requests
              const maintRequestsQuery = query(
                collection(db, 'maint_requests'),
                orderBy('createdAt', 'desc')
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
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!hasPermission) {
    return (
      <ClientLayout>
        <div className="text-center py-12">
          <Wrench className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h2>
          <p className="text-muted-foreground mb-4">
            You don't have permission to view maintenance requests.
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact your administrator to request access.
          </p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Maintenance Requests</h1>
            <p className="text-muted-foreground mt-2">View maintenance requests from your properties</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search maintenance requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No maintenance requests found</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((request) => (
              <Card key={request.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{request.title}</CardTitle>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityBadge(request.priority)}`}>
                      {request.priority}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {request.image && (
                    <img
                      src={request.image}
                      alt={request.title}
                      className="w-full h-48 object-cover rounded"
                    />
                  )}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{request.venue}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{request.requestor}</span>
                    </div>
                    <div className="text-muted-foreground">
                      <span className="font-medium">Date: </span>
                      {formatDate(request.date)}
                    </div>
                    <p className="text-foreground line-clamp-3">{request.description}</p>
                    <div className="flex items-center justify-between pt-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(request.status)}`}>
                        {request.status}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRequest(request);
                          setShowModal(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail Modal */}
        {showModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-card">
                <h2 className="text-2xl font-bold">{selectedRequest.title}</h2>
                <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-6 space-y-4">
                {selectedRequest.image && (
                  <img
                    src={selectedRequest.image}
                    alt={selectedRequest.title}
                    className="w-full h-64 object-cover rounded"
                  />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedRequest.venue}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Requestor</p>
                    <p className="font-medium">{selectedRequest.requestor}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{formatDate(selectedRequest.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getPriorityBadge(selectedRequest.priority)}`}>
                      {selectedRequest.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(selectedRequest.status)}`}>
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Description</p>
                  <p className="text-foreground">{selectedRequest.description}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}

