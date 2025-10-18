'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Plus, MapPin, Calendar, Search } from 'lucide-react';
import Link from 'next/link';

interface Location {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  address: string;
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
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const locationsQuery = query(
      collection(db, 'locations'),
      where('clientId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(locationsQuery, (snapshot) => {
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Location[];
      setLocations(locationsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const filteredLocations = locations.filter(location => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      location.name.toLowerCase().includes(searchLower) ||
      location.address.toLowerCase().includes(searchLower) ||
      location.city.toLowerCase().includes(searchLower) ||
      location.state.toLowerCase().includes(searchLower) ||
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
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add New Location
            </Button>
          </Link>
        </div>

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
                    <CardTitle className="text-lg">{location.name}</CardTitle>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(location.status)}`}>
                      {location.status}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-gray-600">
                      <div>{location.address}</div>
                      <div>{location.city}, {location.state} {location.zipCode}</div>
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
