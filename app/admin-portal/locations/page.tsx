'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, MapPin, Building, User, Phone } from 'lucide-react';

interface Location {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  locationName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  propertyType: string;
  contactPerson: string;
  contactPhone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export default function LocationsManagement() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const fetchLocations = async () => {
    try {
      const locationsQuery = query(collection(db, 'locations'));
      const snapshot = await getDocs(locationsQuery);
      const locationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Location[];
      setLocations(locationsData);
    } catch (error) {
      console.error('Error fetching locations:', error);
      alert('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleApprove = async (locationId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'locations', locationId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert('Location approved successfully');
      fetchLocations();
    } catch (error) {
      console.error('Error approving location:', error);
      alert('Failed to approve location');
    }
  };

  const handleReject = async (locationId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const reason = prompt('Enter rejection reason:');
      if (!reason) return;

      await updateDoc(doc(db, 'locations', locationId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      });

      alert('Location rejected');
      fetchLocations();
    } catch (error) {
      console.error('Error rejecting location:', error);
      alert('Failed to reject location');
    }
  };

  const filteredLocations = locations.filter(location => {
    if (filter === 'all') return true;
    return location.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'approved': return 'text-green-600 bg-green-50';
      case 'rejected': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Locations</h1>
            <p className="text-gray-600 mt-2">Manage client location requests and approvals</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
            >
              {filterOption} ({locations.filter(l => filterOption === 'all' || l.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Locations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLocations.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No locations found</p>
              </CardContent>
            </Card>
          ) : (
            filteredLocations.map((location) => (
              <Card key={location.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{location.locationName}</CardTitle>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(location.status)}`}>
                      {location.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <Building className="h-4 w-4 mt-1 flex-shrink-0" />
                    <div>
                      <div>{location.address.street}</div>
                      <div>{location.address.city}, {location.address.state} {location.address.zip}</div>
                      <div>{location.address.country}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    <span>{location.clientName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{location.contactPhone}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-semibold">Type:</span> {location.propertyType}
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-semibold">Contact:</span> {location.contactPerson}
                  </div>

                  {location.status === 'pending' && (
                    <div className="flex gap-2 pt-4">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(location.id)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleReject(location.id)}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
