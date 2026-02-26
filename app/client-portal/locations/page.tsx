'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Plus, MapPin, Calendar, Search, Eye, X } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

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

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCheckingCompany(true);
        try {
          const clientDoc = await getDoc(doc(db, 'clients', user.uid));
          if (!clientDoc.exists()) {
            setCompanyInfo(null);
            setLocations([]);
            setLoading(false);
            setCheckingCompany(false);
            return;
          }

          const clientData = clientDoc.data();
          const clientCompanyId = clientData.companyId;
          if (!clientCompanyId) {
            setCompanyInfo(null);
            setLocations([]);
            setLoading(false);
            setCheckingCompany(false);
            return;
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

          const locationsQuery = query(
            collection(db, 'locations'),
            where('companyId', '==', clientCompanyId),
            orderBy('createdAt', 'desc'),
            limit(200)
          );

          unsubscribeSnapshot = onSnapshot(
            locationsQuery,
            (snapshot) => {
              const locationsData = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data(),
              })) as Location[];
              setLocations(locationsData);
              setLoading(false);
            },
            (error) => {
              console.error('Error listening to company locations', error);
              setLocations([]);
              setLoading(false);
            }
          );
        } catch (error) {
          console.error('Error loading client locations', error);
          setCompanyInfo(null);
          setLocations([]);
          setLoading(false);
        } finally {
          setCheckingCompany(false);
        }
      } else {
        setCompanyInfo(null);
        setLocations([]);
        setLoading(false);
        setCheckingCompany(false);
      }
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
    return styles[status as keyof typeof styles] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const handleViewDetails = (location: Location) => {
    setSelectedLocation(location);
    setShowModal(true);
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
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <PageContainer>
        <PageHeader
          title="My Locations"
          subtitle="Manage your property locations"
          icon={Building2}
          iconClassName="text-blue-600"
          action={
            <Link href="/client-portal/locations/create">
              <Button disabled={!companyInfo || checkingCompany} className="gap-2">
                <Plus className="h-4 w-4" />
                Add New Location
              </Button>
            </Link>
          }
        />

        {!companyInfo && !checkingCompany && (
          <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/50 p-6">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLocations.map((location) => (
                  <div
                    key={location.id}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-700" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <h3 className="font-semibold text-gray-900 text-sm truncate flex-1">
                          {location.name || (location as any).locationName}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${getStatusBadge(location.status)}`}>
                          {location.status}
                        </span>
                      </div>
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div>
                              {typeof location.address === 'object'
                                ? location.address.street
                                : location.address}
                            </div>
                            <div>
                              {typeof location.address === 'object'
                                ? `${location.address.city}, ${location.address.state} ${location.address.zip}`
                                : `${location.city}, ${location.state} ${location.zipCode}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>{location.propertyType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span>Created {location.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</span>
                        </div>
                      </div>
                      {location.status === 'rejected' && location.rejectedReason && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-lg">
                          <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                          <p className="text-xs text-red-700">{location.rejectedReason}</p>
                        </div>
                      )}
                      {location.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-600">{location.notes}</p>
                        </div>
                      )}
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full gap-2"
                          onClick={() => handleViewDetails(location)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Details Modal */}
        {showModal && selectedLocation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">{selectedLocation.name || (selectedLocation as any).locationName}</h2>
                  <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBadge(selectedLocation.status)}`}>
                    Status: {selectedLocation.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Address</p>
                    <p className="text-gray-900 font-medium">
                      {typeof selectedLocation.address === 'object'
                        ? selectedLocation.address.street
                        : selectedLocation.address}
                    </p>
                    <p className="text-gray-900">
                      {typeof selectedLocation.address === 'object'
                        ? `${selectedLocation.address.city}, ${selectedLocation.address.state} ${selectedLocation.address.zip}`
                        : `${selectedLocation.city}, ${selectedLocation.state} ${selectedLocation.zipCode}`}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600 mb-1">Property Type</p>
                    <p className="text-gray-900 font-medium">{selectedLocation.propertyType}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-600 mb-1">Created</p>
                    <p className="text-gray-900 font-medium">
                      {selectedLocation.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                    </p>
                  </div>

                  {selectedLocation.approvedAt && (
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Approved</p>
                      <p className="text-gray-900 font-medium">
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
                    <p className="text-sm text-gray-600 mb-2">Notes</p>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">{selectedLocation.notes}</p>
                    </div>
                  </div>
                )}

                {selectedLocation.images && selectedLocation.images.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Images</p>
                    <div className="grid grid-cols-2 gap-4">
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
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </ClientLayout>
  );
}
