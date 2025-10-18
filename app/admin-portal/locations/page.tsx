'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, MapPin, Building, User, Phone, Plus, Edit2, Save, X, Search } from 'lucide-react';

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

interface Client {
  id: string;
  fullName: string;
  email: string;
}

export default function LocationsManagement() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    locationName: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'USA',
    propertyType: '',
    contactPerson: '',
    contactPhone: '',
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

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

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        id: doc.id,
        fullName: doc.data().fullName,
        email: doc.data().email,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  useEffect(() => {
    fetchLocations();
    fetchClients();
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

  const resetForm = () => {
    setFormData({
      clientId: '',
      locationName: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'USA',
      propertyType: '',
      contactPerson: '',
      contactPhone: '',
      status: 'approved',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (location: Location) => {
    setFormData({
      clientId: location.clientId,
      locationName: location.locationName,
      street: location.address.street,
      city: location.address.city,
      state: location.address.state,
      zip: location.address.zip,
      country: location.address.country,
      propertyType: location.propertyType,
      contactPerson: location.contactPerson,
      contactPhone: location.contactPhone,
      status: location.status,
    });
    setEditingId(location.id);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.clientId || !formData.locationName || !formData.street || !formData.city || !formData.state || !formData.zip) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const client = clients.find(c => c.id === formData.clientId);
      if (!client) {
        alert('Invalid client selected');
        return;
      }

      const locationData = {
        clientId: formData.clientId,
        clientName: client.fullName,
        clientEmail: client.email,
        locationName: formData.locationName,
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          country: formData.country,
        },
        propertyType: formData.propertyType,
        contactPerson: formData.contactPerson,
        contactPhone: formData.contactPhone,
        status: formData.status,
        updatedAt: serverTimestamp(),
      };

      if (editingId) {
        // Update existing location
        await updateDoc(doc(db, 'locations', editingId), locationData);
        alert('Location updated successfully');
      } else {
        // Create new location
        await addDoc(collection(db, 'locations'), {
          ...locationData,
          createdAt: serverTimestamp(),
        });
        alert('Location created successfully');
      }

      resetForm();
      fetchLocations();
    } catch (error: any) {
      console.error('Error saving location:', error);
      alert(error.message || 'Failed to save location');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLocations = locations.filter(location => {
    // Filter by status
    const statusMatch = filter === 'all' || location.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      location.locationName.toLowerCase().includes(searchLower) ||
      location.clientName.toLowerCase().includes(searchLower) ||
      location.address.street.toLowerCase().includes(searchLower) ||
      location.address.city.toLowerCase().includes(searchLower) ||
      location.address.state.toLowerCase().includes(searchLower) ||
      (location.propertyType && location.propertyType.toLowerCase().includes(searchLower));

    return statusMatch && searchMatch;
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
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Location
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search locations by name, client, address, or property type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    <span>{location.clientName}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4 mt-0.5" />
                    <div>
                      <div>{location.address.street}</div>
                      <div>{location.address.city}, {location.address.state} {location.address.zip}</div>
                    </div>
                  </div>
                  {location.propertyType && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building className="h-4 w-4" />
                      <span>{location.propertyType}</span>
                    </div>
                  )}
                  {location.contactPhone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-4 w-4" />
                      <span>{location.contactPhone}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleOpenEdit(location)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    {location.status === 'pending' && (
                      <>
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
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {editingId ? 'Edit Location' : 'Create New Location'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Select Client *</Label>
                    <select
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                      disabled={!!editingId}
                    >
                      <option value="">Choose a client...</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>
                          {client.fullName} ({client.email})
                        </option>
                      ))}
                    </select>
                    {editingId && (
                      <p className="text-xs text-gray-500 mt-1">Client cannot be changed</p>
                    )}
                  </div>

                  <div>
                    <Label>Location Name *</Label>
                    <Input
                      value={formData.locationName}
                      onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                      placeholder="e.g., Main Office"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Street Address *</Label>
                    <Input
                      value={formData.street}
                      onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                      placeholder="123 Main St"
                    />
                  </div>

                  <div>
                    <Label>City *</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="San Francisco"
                    />
                  </div>

                  <div>
                    <Label>State *</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      placeholder="CA"
                    />
                  </div>

                  <div>
                    <Label>ZIP Code *</Label>
                    <Input
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      placeholder="94104"
                    />
                  </div>

                  <div>
                    <Label>Country</Label>
                    <Input
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="USA"
                    />
                  </div>

                  <div>
                    <Label>Property Type</Label>
                    <select
                      value={formData.propertyType}
                      onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Select type...</option>
                      <option value="Restaurant">Restaurant</option>
                      <option value="Bar">Bar</option>
                      <option value="Hotel">Hotel</option>
                      <option value="Office">Office</option>
                      <option value="Retail">Retail</option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <Label>Contact Person</Label>
                    <Input
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <Label>Contact Phone</Label>
                    <Input
                      type="tel"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div>
                    <Label>Status *</Label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
