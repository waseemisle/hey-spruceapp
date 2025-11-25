'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Plus, MapPin, Calendar, Search, Eye, X } from 'lucide-react';
import Link from 'next/link';

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
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Locations</h1>
            <p className="text-gray-600 mt-2">Manage your property locations</p>
          </div>
          <Link href="/client-portal/locations/create">
            <Button disabled={!companyInfo || checkingCompany}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Location
            </Button>
          </Link>
        </div>

        {!companyInfo && !checkingCompany && (
          <Card>
            <CardContent className="py-6">
              <p className="text-red-600 font-medium">
                No company is assigned to your profile yet. Please contact an administrator to gain access to your company locations.
              </p>
            </CardContent>
          </Card>
        )}

        {companyInfo && (
          <>
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search locations by name, address, city, state, or property type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {filteredLocations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Building2 className="h-16 w-16 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No locations yet</h3>
                  <p className="text-gray-600 text-center mb-4">
                    Get started by adding your first property location
                  </p>
                  <Link href="/client-portal/locations/create">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLocations.map((location) => (
                  <Card key={location.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{location.name || (location as any).locationName}</CardTitle>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(location.status)}`}>
                          {location.status}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-gray-600">
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
                        <Building2 className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">{location.propertyType}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          Created {location.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                        </span>
                      </div>

                      {location.status === 'rejected' && location.rejectedReason && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg">
                          <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                          <p className="text-xs text-red-700">{location.rejectedReason}</p>
                        </div>
                      )}

                      {location.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-600">{location.notes}</p>
                        </div>
                      )}

                      <div className="pt-3 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleViewDetails(location)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Details Modal */}
        {showModal && selectedLocation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
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
      </div>
    </ClientLayout>
  );
}
