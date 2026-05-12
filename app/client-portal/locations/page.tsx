'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { resolveClientCompanyId } from '@/lib/resolve-client-company';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Building2, Plus, MapPin, Calendar, Search, Eye, X, ClipboardList, Upload, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { uploadMultipleToCloudinary } from '@/lib/cloudinary-upload';
import { notifyAdminsOfLocation } from '@/lib/notifications';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

import { PageContainer } from '@/components/ui/page-container';
interface WorkOrder {
  id: string;
  workOrderNumber?: string;
  title: string;
  status: string;
  priority?: string;
  locationId?: string;
  clientId?: string;
  createdAt?: { toDate?: () => Date };
}

interface Location {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  address: string | { street: string; city: string; state: string; zip: string; country: string; };
  city: string;
  state: string;
  zipCode: string;
  propertyType: string;
  status: string;
  images?: string[];
  notes?: string;
  createdAt: any;
  approvedAt?: any;
  rejectedReason?: string;
}

export default function ClientLocations() {
  const { auth, db } = useFirebaseInstance();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<{ id: string; name?: string } | null>(null);
  const [checkingCompany, setCheckingCompany] = useState(true);
  const [locationWorkOrders, setLocationWorkOrders] = useState<WorkOrder[]>([]);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [canCreateLocation, setCanCreateLocation] = useState(false);

  // Create Location modal
  const [showCreateLocationModal, setShowCreateLocationModal] = useState(false);
  const [createLocForm, setCreateLocForm] = useState({
    name: '', address: '', city: '', state: '', zipCode: '', propertyType: 'Commercial', notes: '',
  });
  const [createLocFiles, setCreateLocFiles] = useState<FileList | null>(null);
  const [createLocPreviews, setCreateLocPreviews] = useState<string[]>([]);
  const [uploadingLocImages, setUploadingLocImages] = useState(false);
  const [submittingLoc, setSubmittingLoc] = useState(false);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Tear down any prior snapshot before this auth change so we never
      // accumulate listeners across user switches or transient nulls.
      unsubscribeSnapshot?.();
      unsubscribeSnapshot = null;

      if (!user) {
        // Don't touch state on null callbacks — Firebase Auth's first emission
        // after a fresh page mount (or App Router page remount on nav) can be
        // null both as the callback arg AND `auth.currentUser` while the
        // persisted user is being restored from IndexedDB. Any state change
        // here flashes the "No company assigned" warning before the next
        // callback (~150ms later) arrives with the real user.
        // The layout's auth handler is the single source of truth for the
        // "user is genuinely signed out → redirect" decision; this page just
        // stays in loading state until a real user arrives.
        return;
      }

      // Real user — keep the spinner showing until we've decided whether
      // there's a company to show.
      setLoading(true);
      setCheckingCompany(true);

      // Read the client doc with retry-on-permission-error. Right after a
      // fresh login (or after the layout remounts on App Router nav), the
      // Firebase Auth token sometimes hasn't propagated to Firestore yet,
      // so the first getDoc rejects with permission-denied even though the
      // user is genuinely authenticated. Without retry, the catch block
      // would flip companyInfo=null + checkingCompany=false and paint the
      // "No company assigned" warning. Retrying with short backoff lets
      // the token catch up — the second try almost always succeeds.
      const readClientDoc = async () => {
        let lastErr: any = null;
        for (let i = 0; i < 4; i++) {
          try {
            return await getDoc(doc(db, 'clients', user.uid));
          } catch (err: any) {
            lastErr = err;
            const code = err?.code || '';
            const msg = String(err?.message || '');
            const isAuthRace =
              code === 'permission-denied' ||
              code === 'unauthenticated' ||
              /permission|insufficient|unauthenticated/i.test(msg);
            if (!isAuthRace || i === 3) throw err;
            await new Promise((r) => setTimeout(r, 250 * (i + 1)));
            // Force-refresh the ID token before retrying so Firestore picks
            // up the latest claims.
            try { await user.getIdToken(true); } catch {}
          }
        }
        throw lastErr;
      };

      try {
        const clientDoc = await readClientDoc();
        if (!clientDoc.exists()) {
          // POSITIVELY confirmed: there is no client doc for this uid.
          setCompanyInfo(null);
          setLocations([]);
          setLoading(false);
          setCheckingCompany(false);
          return;
        }

        const clientData = clientDoc.data();
        const permissions = clientData.permissions || {};
        setCanCreateLocation(!!permissions.createLocation);
        // The admin curates which subset of the parent company's locations
        // this client is allowed to see/work with via the Edit Client
        // modal. Capture that list now so the locations subscription
        // below can filter the company-wide query down to only the
        // assigned ones (instead of leaking every sibling location).
        const assignedLocationIds = new Set<string>(
          Array.isArray(clientData.assignedLocations) ? clientData.assignedLocations : []
        );
        const clientUid = user.uid;
        let clientCompanyId = clientData.companyId as string | undefined;
        if (!clientCompanyId) {
          const resolved = await resolveClientCompanyId(db, user.uid, user.email);
          if (resolved) {
            clientCompanyId = resolved.companyId;
          } else {
            setCompanyInfo(null);
            setLocations([]);
            setLoading(false);
            setCheckingCompany(false);
            return;
          }
        }

        // Fetch company info for UI context
        try {
          const companyDoc = await getDoc(doc(db, 'companies', clientCompanyId));
          if (companyDoc.exists()) {
            const data = companyDoc.data() as { name?: string };
            setCompanyInfo({ id: companyDoc.id, name: data.name || 'Assigned Company' });
          } else {
            setCompanyInfo({ id: clientCompanyId, name: 'Assigned Company' });
          }
        } catch {
          setCompanyInfo({ id: clientCompanyId, name: 'Assigned Company' });
        }
        // Mark the company-check phase as done now that companyInfo is set —
        // this is the only success path that flips checkingCompany to false
        // with companyInfo populated, so the "no company" render condition
        // can never match here.
        setCheckingCompany(false);

        const locationsQuery = query(
          collection(db, 'locations'),
          where('companyId', '==', clientCompanyId),
          orderBy('createdAt', 'desc'),
          limit(200)
        );

        unsubscribeSnapshot = onSnapshot(
          locationsQuery,
          (snapshot) => {
            const all = snapshot.docs.map(docSnap => ({
              id: docSnap.id,
              ...docSnap.data(),
            })) as Location[];

            // Filter to only locations the admin actually assigned to
            // this client. Mirrors the filter on the admin-side
            // "Assigned Locations" card (clients/[id]/page.tsx) so the
            // two views stay in lockstep instead of the client portal
            // leaking every sibling location under the parent company.
            // Two acceptance paths:
            //   1. Location id is in client.assignedLocations (the
            //      admin's curated list from the Edit Client modal).
            //   2. Legacy direct ownership — location.clientId equals
            //      this user's uid (older locations were tied 1:1 to a
            //      single client before assignment was multi-select).
            const visible = all.filter((loc) =>
              assignedLocationIds.has(loc.id) || loc.clientId === clientUid
            );

            setLocations(visible);
            setLoading(false);
          },
          (error) => {
            console.error('Error listening to company locations', error);
            setLocations([]);
            setLoading(false);
          }
        );
      } catch (error) {
        // Transient Firestore failure (network blip, exhausted retries on
        // post-login JWT race, rules layer hiccup). Do NOT conclude "no
        // company" — that's the bug that paints the wrong warning. Stay in
        // loading state. The next auth callback or a manual refresh will
        // retry the read; we'd rather show a spinner a moment longer than
        // a wrong empty state.
        console.error('Error loading client locations (will not flash "no company"):', error);
      }
      // No finally block — checkingCompany stays true unless one of the
      // positive-answer branches above explicitly turned it off. This
      // guarantees the "no company" warning is only ever shown when we
      // POSITIVELY confirmed the client doc has no companyId.
    });

    return () => {
      unsubscribeSnapshot?.();
      unsubscribeAuth();
    };
  }, [auth, db]);

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
    };
    return styles[status as keyof typeof styles] || 'bg-muted text-foreground border-border';
  };

  const sortWorkOrdersByCreatedDesc = (wos: WorkOrder[]) =>
    [...wos].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
      const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
      return bTime - aTime;
    });

  const closeCreateLocationModal = () => {
    setShowCreateLocationModal(false);
    setCreateLocForm({ name: '', address: '', city: '', state: '', zipCode: '', propertyType: 'Commercial', notes: '' });
    createLocPreviews.forEach(u => URL.revokeObjectURL(u));
    setCreateLocPreviews([]);
    setCreateLocFiles(null);
  };

  const handleLocFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setCreateLocFiles(files);
      setCreateLocPreviews(Array.from(files).map(f => URL.createObjectURL(f)));
    }
  };

  const handleLocRemoveImage = (index: number) => {
    if (createLocFiles) {
      const dt = new DataTransfer();
      Array.from(createLocFiles).filter((_, i) => i !== index).forEach(f => dt.items.add(f));
      setCreateLocFiles(dt.files.length > 0 ? dt.files : null);
    }
    const updated = [...createLocPreviews];
    URL.revokeObjectURL(updated[index]);
    updated.splice(index, 1);
    setCreateLocPreviews(updated);
  };

  const handleCreateLocation = async () => {
    if (!createLocForm.name.trim()) { toast.error('Please enter a location name'); return; }
    if (!createLocForm.address.trim()) { toast.error('Please enter a street address'); return; }
    if (!createLocForm.city.trim()) { toast.error('Please enter a city'); return; }
    if (!createLocForm.state.trim()) { toast.error('Please enter a state'); return; }
    if (!createLocForm.zipCode.trim()) { toast.error('Please enter a ZIP code'); return; }
    const currentUser = auth.currentUser;
    if (!currentUser) { toast.error('Not authenticated'); return; }
    if (!companyInfo) { toast.error('No company assigned to your profile'); return; }

    setSubmittingLoc(true);
    try {
      let imageUrls: string[] = [];
      if (createLocFiles && createLocFiles.length > 0) {
        setUploadingLocImages(true);
        try {
          imageUrls = await uploadMultipleToCloudinary(createLocFiles);
        } catch {
          toast.error('Failed to upload images');
          setUploadingLocImages(false);
          setSubmittingLoc(false);
          return;
        }
        setUploadingLocImages(false);
      }

      const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
      const clientData = clientDoc.data() as any;
      const clientName = clientData?.fullName || clientData?.companyName || '';

      const locationRef = await addDoc(collection(db, 'locations'), {
        clientId: currentUser.uid,
        clientName,
        clientEmail: clientData?.email || '',
        companyId: companyInfo.id,
        companyName: companyInfo.name || '',
        locationName: createLocForm.name,
        name: createLocForm.name,
        address: {
          street: createLocForm.address,
          city: createLocForm.city,
          state: createLocForm.state,
          zip: createLocForm.zipCode,
          country: 'USA',
        },
        city: createLocForm.city,
        state: createLocForm.state,
        zipCode: createLocForm.zipCode,
        propertyType: createLocForm.propertyType,
        contactPerson: '',
        contactPhone: '',
        notes: createLocForm.notes || '',
        images: imageUrls,
        status: 'pending',
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
        createdByName: clientName,
        creationSource: 'client_portal',
        systemNotes: [{
          action: 'created',
          userId: currentUser.uid,
          userName: clientName,
          timestamp: new Date().toISOString(),
          details: `Location submitted via Client Portal by ${clientName}. Status: pending approval.`,
        }],
      });

      notifyAdminsOfLocation(locationRef.id, createLocForm.name, clientName).catch(console.error);

      toast.success('Location created! Awaiting admin approval.');
      closeCreateLocationModal();
    } catch (err) {
      console.error('Error creating location:', err);
      toast.error('Failed to create location');
    } finally {
      setSubmittingLoc(false);
    }
  };

  const handleViewDetails = async (location: Location) => {
    setSelectedLocation(location);
    setShowModal(true);
    setLocationWorkOrders([]);
    setLoadingWorkOrders(true);
    const uid = auth.currentUser?.uid;
    const companyId = companyInfo?.id;

    const mapDocs = (snap: QuerySnapshot<DocumentData>) =>
      snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));

    try {
      if (!uid) {
        return;
      }

      // Firestore rejects broad `locationId`-only queries if any matching doc is unreadable.
      // Narrow queries (location + company / location + client) only return allowed docs.
      const tasks: Promise<WorkOrder[]>[] = [];

      if (companyId) {
        tasks.push(
          getDocs(
            query(
              collection(db, 'workOrders'),
              where('locationId', '==', location.id),
              where('companyId', '==', companyId),
              orderBy('createdAt', 'desc'),
              limit(5)
            )
          )
            .then(mapDocs)
            .catch((e) => {
              console.error('Error fetching company work orders for location', e);
              return [];
            })
        );
      }

      tasks.push(
        getDocs(
          query(
            collection(db, 'workOrders'),
            where('locationId', '==', location.id),
            where('clientId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(5)
          )
        )
          .then(mapDocs)
          .catch((e) => {
            console.error('Error fetching client work orders for location', e);
            return [];
          })
      );

      const batches = await Promise.all(tasks);
      const byId = new Map<string, WorkOrder>();
      for (const batch of batches) {
        for (const wo of batch) {
          byId.set(wo.id, wo);
        }
      }
      let merged = sortWorkOrdersByCreatedDesc([...byId.values()]).slice(0, 5);

      // Legacy rows: missing companyId on the work order — still tied to this user.
      if (merged.length === 0) {
        const fallbackSnap = await getDocs(
          query(
            collection(db, 'workOrders'),
            where('clientId', '==', uid),
            orderBy('createdAt', 'desc'),
            limit(100)
          )
        );
        merged = sortWorkOrdersByCreatedDesc(
          mapDocs(fallbackSnap).filter((wo) => wo.locationId === location.id)
        ).slice(0, 5);
      }

      setLocationWorkOrders(merged);
    } catch (e) {
      console.error('Error fetching work orders for location', e);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const filteredLocations = locations.filter(location => {
    const searchLower = searchQuery.toLowerCase();

    // Handle both old format (flat fields) and new format (nested address object)
    const addressStr = typeof location.address === 'object'
      ? location.address.street.toLowerCase()
      : location.address.toLowerCase();
    const city = typeof location.address === 'object'
      ? location.address.city.toLowerCase()
      : location.city.toLowerCase();
    const state = typeof location.address === 'object'
      ? location.address.state.toLowerCase()
      : location.state.toLowerCase();

    // Handle both 'name' and 'locationName' fields for compatibility
    const locationName = (location.name || (location as any).locationName || '').toLowerCase();

    return !searchQuery ||
      locationName.includes(searchLower) ||
      addressStr.includes(searchLower) ||
      city.includes(searchLower) ||
      state.includes(searchLower) ||
      location.propertyType.toLowerCase().includes(searchLower);
  });

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageContainer>
        <PageHeader
          title="My Locations"
          subtitle="Manage your property locations"
          icon={Building2}
          iconClassName="text-blue-600"
          action={canCreateLocation ? (
            <Button
              disabled={!companyInfo || checkingCompany}
              className="gap-2"
              onClick={() => setShowCreateLocationModal(true)}
            >
              <Plus className="h-4 w-4" />
              Add New Location
            </Button>
          ) : undefined}
        />

        {!companyInfo && !checkingCompany && (
          <div className="bg-card rounded-xl border border-amber-200 bg-amber-50/50 p-6">
            <p className="text-amber-800 font-medium">
              No company is assigned to your profile yet. Please contact an administrator to gain access to your company locations.
            </p>
          </div>
        )}

        {companyInfo && (
          <>
            <StatCards
              items={[
                { label: 'Total', value: locations.length, icon: Building2, color: 'blue' },
                { label: 'Approved', value: locations.filter(l => l.status === 'approved').length, icon: Building2, color: 'emerald' },
                { label: 'Pending', value: locations.filter(l => l.status === 'pending').length, icon: Building2, color: 'amber' },
              ]}
            />

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search locations by name, address, city, state, or property type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {filteredLocations.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No locations yet"
                subtitle="Get started by adding your first property location"
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLocations.map((location) => (
                  <div key={location.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                    {/* Row 1: name + status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {location.name || (location as any).locationName}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {typeof location.address === 'object'
                            ? `${location.address.street}, ${location.address.city}`
                            : `${location.address}, ${location.city}`}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(location.status)}`}>
                        {location.status}
                      </span>
                    </div>
                    {/* Row 2: property type + state/zip */}
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-muted-foreground truncate">{location.propertyType}</span>
                      <span className="text-foreground font-medium shrink-0 text-xs">
                        {typeof location.address === 'object'
                          ? `${location.address.state} ${location.address.zip}`
                          : `${location.state} ${location.zipCode}`}
                      </span>
                    </div>
                    {/* Row 3: actions */}
                    <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs gap-1"
                        onClick={() => handleViewDetails(location)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                      <Link href="/client-portal/work-orders?create=1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          title="Create Work Order"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Location Modal */}
        {showCreateLocationModal && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-10 overflow-y-auto">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl">
              <div className="sticky top-0 bg-card z-10 rounded-t-2xl border-b border-border px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Add New Location</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Submit a property location for approval</p>
                </div>
                <button onClick={closeCreateLocationModal} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Location Name */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                    Location Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={createLocForm.name}
                    onChange={(e) => setCreateLocForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., Main Office Building"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>

                {/* Street Address */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                    Street Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={createLocForm.address}
                    onChange={(e) => setCreateLocForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main St"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  />
                </div>

                {/* City / State / ZIP */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                      City <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={createLocForm.city}
                      onChange={(e) => setCreateLocForm(p => ({ ...p, city: e.target.value }))}
                      placeholder="Denver"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                      State <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={createLocForm.state}
                      onChange={(e) => setCreateLocForm(p => ({ ...p, state: e.target.value }))}
                      placeholder="CO"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                      ZIP <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={createLocForm.zipCode}
                      onChange={(e) => setCreateLocForm(p => ({ ...p, zipCode: e.target.value }))}
                      placeholder="80202"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Property Type */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">Property Type</label>
                  <SearchableSelect
                    value={createLocForm.propertyType}
                    onValueChange={(v) => setCreateLocForm(p => ({ ...p, propertyType: v }))}
                    options={['Commercial', 'Residential', 'Industrial', 'Retail', 'Office', 'Warehouse', 'Other'].map(t => ({ value: t, label: t }))}
                    placeholder="Select type…"
                  />
                </div>

                {/* Optional fields */}
                <details className="group">
                  <summary className="text-xs font-medium text-muted-foreground cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    Optional fields
                  </summary>
                  <div className="mt-3 space-y-4 pl-4 border-l border-border">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground uppercase tracking-wide">Notes</label>
                      <textarea
                        value={createLocForm.notes}
                        onChange={(e) => setCreateLocForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Any additional information about this location…"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent min-h-[72px] max-h-[120px] resize-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground uppercase tracking-wide">Images</label>
                      <label htmlFor="create-loc-images" className="border-2 border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:border-primary/50 transition-colors flex flex-col items-center gap-1">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Click or drag images</span>
                        <input id="create-loc-images" type="file" multiple accept="image/*" onChange={handleLocFileSelect} className="hidden" />
                      </label>
                      {createLocPreviews.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {createLocPreviews.map((url, i) => (
                            <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-border">
                              <img src={url} className="w-full h-full object-cover" alt="" />
                              <button type="button" onClick={() => handleLocRemoveImage(i)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                                <X className="h-2.5 w-2.5 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </div>

              <div className="sticky bottom-0 bg-card rounded-b-2xl border-t border-border px-6 py-4 flex gap-3">
                <Button variant="outline" onClick={closeCreateLocationModal} className="flex-1" disabled={submittingLoc || uploadingLocImages}>
                  Cancel
                </Button>
                <Button onClick={handleCreateLocation} className="flex-1" disabled={submittingLoc || uploadingLocImages}>
                  {uploadingLocImages ? 'Uploading…' : submittingLoc ? 'Creating…' : 'Add Location'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Details Modal */}
        {showModal && selectedLocation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-card rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
                <div className="flex justify-between items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold truncate">{selectedLocation.name || (selectedLocation as any).locationName}</h2>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(selectedLocation.status)}`}>
                    Status: {selectedLocation.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Address</p>
                    <p className="text-foreground font-medium">
                      {typeof selectedLocation.address === 'object'
                        ? selectedLocation.address.street
                        : selectedLocation.address}
                    </p>
                    <p className="text-foreground">
                      {typeof selectedLocation.address === 'object'
                        ? `${selectedLocation.address.city}, ${selectedLocation.address.state} ${selectedLocation.address.zip}`
                        : `${selectedLocation.city}, ${selectedLocation.state} ${selectedLocation.zipCode}`}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Property Type</p>
                    <p className="text-foreground font-medium">{selectedLocation.propertyType}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Created</p>
                    <p className="text-foreground font-medium">
                      {selectedLocation.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                    </p>
                  </div>

                  {selectedLocation.approvedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Approved</p>
                      <p className="text-foreground font-medium">
                        {selectedLocation.approvedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </p>
                    </div>
                  )}
                </div>

                {selectedLocation.status === 'rejected' && selectedLocation.rejectedReason && (
                  <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-semibold text-red-800 mb-2">Rejection Reason:</p>
                    <p className="text-sm text-red-700">{selectedLocation.rejectedReason}</p>
                  </div>
                )}

                {selectedLocation.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Notes</p>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{selectedLocation.notes}</p>
                    </div>
                  </div>
                )}

                {selectedLocation.images && selectedLocation.images.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Images</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedLocation.images.map((image, index) => (
                        <img
                          key={index}
                          src={image}
                          alt={`Location image ${index + 1}`}
                          className="w-full h-48 object-cover rounded-lg border"
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">Recent Work Orders at this Location</p>
                  </div>
                  {loadingWorkOrders ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  ) : locationWorkOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No work orders at this location.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 border border-border rounded-lg overflow-hidden">
                      {locationWorkOrders.map((wo) => (
                        <li key={wo.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors">
                          <Link
                            href={`/client-portal/work-orders/${wo.id}`}
                            className="text-sm text-blue-600 hover:underline font-medium truncate flex-1"
                            onClick={() => setShowModal(false)}
                          >
                            {wo.workOrderNumber ? `${wo.workOrderNumber} — ` : ''}{wo.title || 'Work order'}
                          </Link>
                          <span className="ml-3 text-xs text-muted-foreground flex-shrink-0 capitalize">{wo.status.replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
