'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, addDoc, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { CheckCircle, XCircle, MapPin, Building, Building2, User, Phone, Plus, Edit2, Save, X, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useViewControls } from '@/contexts/view-controls-context';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

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
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingLocationId, setRejectingLocationId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const { viewMode, sortOption } = useViewControls();

  const [formData, setFormData] = useState({
    clientId: '',
    companyId: '',
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
  const [companies, setCompanies] = useState<{ id: string; name: string; clientId: string }[]>([]);

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
      toast.error('Failed to load locations');
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

  const fetchCompanies = async () => {
    try {
      const companiesQuery = query(collection(db, 'companies'));
      const snapshot = await getDocs(companiesQuery);
      const companiesData = snapshot.docs.map(d => {
        const data = d.data();
        return { 
          id: d.id, 
          name: data.name as string || '', 
          clientId: (data.clientId as string) || '' 
        };
      }).filter(c => c.name); // Only include companies with names
      setCompanies(companiesData);
      console.log('Fetched companies:', companiesData.length, companiesData);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to load companies');
    }
  };

  useEffect(() => {
    fetchLocations();
    fetchClients();
    fetchCompanies();
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

      toast.success('Location approved successfully');
      fetchLocations();
    } catch (error) {
      console.error('Error approving location:', error);
      toast.error('Failed to approve location');
    }
  };

  const handleReject = (locationId: string) => {
    setRejectingLocationId(locationId);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectingLocationId) return;

    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'locations', rejectingLocationId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: rejectionReason,
        updatedAt: serverTimestamp(),
      });

      toast.success('Location rejected');
      setShowRejectModal(false);
      setRejectingLocationId(null);
      setRejectionReason('');
      fetchLocations();
    } catch (error) {
      console.error('Error rejecting location:', error);
      toast.error('Failed to reject location');
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      companyId: '',
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
      companyId: (location as any).companyId || '',
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
    if (!formData.companyId || !formData.locationName || !formData.street || !formData.city || !formData.state || !formData.zip) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      if (!selectedCompany) {
        toast.error('Invalid company selected');
        return;
      }

      // Get client info from the company
      const client = formData.clientId ? clients.find(c => c.id === formData.clientId) : null;
      const locationData = {
        clientId: formData.clientId || selectedCompany.clientId || '',
        clientName: client?.fullName || '',
        clientEmail: client?.email || '',
        companyId: formData.companyId,
        companyName: selectedCompany.name,
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
        toast.success('Location updated successfully');
      } else {
        // Create new location
        await addDoc(collection(db, 'locations'), {
          ...locationData,
          createdAt: serverTimestamp(),
        });
        toast.success('Location created successfully');
      }

      resetForm();
      fetchLocations();
    } catch (error: any) {
      console.error('Error saving location:', error);
      toast.error(error.message || 'Failed to save location');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLocation = async (location: Location) => {
    // Show confirmation toast with action buttons
    toast(`Delete location "${location.locationName}"?`, {
      description: 'This will also delete all work orders at this location and all related quotes and invoices. This action cannot be undone.',
      action: {
        label: 'Delete',
        onClick: async () => {
          await performDeleteLocation(location);
        }
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {}
      }
    });
  };

  const performDeleteLocation = async (location: Location) => {
    try {
      // Find all work orders at this location
      const workOrdersQuery = query(
        collection(db, 'workOrders'),
        where('locationId', '==', location.id)
      );
      const workOrdersSnapshot = await getDocs(workOrdersQuery);

      // For each work order, delete related data
      for (const workOrderDoc of workOrdersSnapshot.docs) {
        const workOrderId = workOrderDoc.id;

        // Delete related quotes
        const quotesQuery = query(
          collection(db, 'quotes'),
          where('workOrderId', '==', workOrderId)
        );
        const quotesSnapshot = await getDocs(quotesQuery);
        await Promise.all(quotesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        // Delete related bidding work orders
        const biddingQuery = query(
          collection(db, 'biddingWorkOrders'),
          where('workOrderId', '==', workOrderId)
        );
        const biddingSnapshot = await getDocs(biddingQuery);
        await Promise.all(biddingSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        // Delete related invoices
        const invoicesQuery = query(
          collection(db, 'invoices'),
          where('workOrderId', '==', workOrderId)
        );
        const invoicesSnapshot = await getDocs(invoicesQuery);
        await Promise.all(invoicesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        // Delete the work order itself
        await deleteDoc(workOrderDoc.ref);
      }

      // Delete the location itself
      await deleteDoc(doc(db, 'locations', location.id));

      toast.success('Location and all related data deleted successfully');
      fetchLocations();
    } catch (error) {
      console.error('Error deleting location:', error);
      toast.error('Failed to delete location');
    }
  };

  const getTimestampValue = (value: any) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && value?.toDate) {
      const dateValue = value.toDate();
      return dateValue instanceof Date ? dateValue.getTime() : 0;
    }
    return 0;
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

  const sortedLocations = [...filteredLocations].sort((a, b) => {
    switch (sortOption) {
      case 'updatedAt':
        return (
          getTimestampValue((b as any).updatedAt || b.createdAt) -
          getTimestampValue((a as any).updatedAt || a.createdAt)
        );
      case 'createdAt':
      default:
        return getTimestampValue(b.createdAt) - getTimestampValue(a.createdAt);
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'approved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const stats = {
    total: locations.length,
    approved: locations.filter(l => l.status === 'approved').length,
    pending: locations.filter(l => l.status === 'pending').length,
    rejected: locations.filter(l => l.status === 'rejected').length,
  };

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
      <PageContainer>
        <PageHeader
          title="Locations"
          subtitle="Manage client location requests and approvals"
          icon={Building2}
          iconClassName="text-blue-600"
          action={
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Location
            </Button>
          }
        />

        <StatCards
          items={[
            { label: 'Total', value: stats.total, icon: Building2, color: 'blue' },
            { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'emerald' },
            { label: 'Pending', value: stats.pending, icon: MapPin, color: 'amber' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'red' },
          ]}
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, client, address, or property type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'approved', 'pending', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f} ({f === 'all' ? stats.total : f === 'approved' ? stats.approved : f === 'pending' ? stats.pending : stats.rejected})
              </button>
            ))}
          </div>
        </div>

        {sortedLocations.length === 0 ? (
          <EmptyState icon={MapPin} title="No locations found" subtitle="Try adjusting your search or filters" />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Location Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Address</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Property Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedLocations.map((location) => (
                  <tr key={location.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-gray-900">{location.locationName}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{location.clientName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>{location.address.street}</div>
                      <div className="text-xs text-gray-500">{location.address.city}, {location.address.state} {location.address.zip}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{location.propertyType || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{location.contactPhone || '-'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${getStatusColor(location.status)}`}>
                        {location.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(location)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {location.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleApprove(location.id)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleReject(location.id)}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteLocation(location)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedLocations.map((location) => (
              <div
                key={location.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-700" />
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-gray-900 text-sm break-words">{location.locationName}</h3>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border flex-shrink-0 ${getStatusColor(location.status)}`}>
                      {location.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="break-words">{location.clientName}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                    <div className="break-words">
                      <div>{location.address.street}</div>
                      <div className="text-xs text-gray-500">{location.address.city}, {location.address.state} {location.address.zip}</div>
                    </div>
                  </div>
                  {location.propertyType && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span>{location.propertyType}</span>
                    </div>
                  )}
                  {location.contactPhone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span>{location.contactPhone}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
                    <Link href={`/admin-portal/locations/${location.id}`}>
                      <Button size="sm" variant="secondary" className="gap-2">
                        <Building2 className="h-3.5 w-3.5" />
                        View
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => handleOpenEdit(location)}>
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteLocation(location)} aria-label="Delete location">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {location.status === 'pending' && (
                      <>
                        <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(location.id)}>
                          <CheckCircle className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-2" onClick={() => handleReject(location.id)}>
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
                <div className="flex justify-between items-center gap-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    {editingId ? 'Edit Location' : 'Create New Location'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Select Client (Optional)</Label>
                    <select
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full border border-input bg-background rounded-md p-2 text-foreground"
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
                      <p className="text-xs text-muted-foreground mt-1">Client cannot be changed</p>
                    )}
                  </div>

                  <div>
                    <Label>Company *</Label>
                    <input
                      list="companies-list"
                      value={companies.find(c => c.id === formData.companyId)?.name || ''}
                      onChange={(e) => {
                        const selectedCompany = companies.find(c => c.name === e.target.value);
                        setFormData({ ...formData, companyId: selectedCompany?.id || '' });
                      }}
                      className="w-full border border-input bg-background rounded-md p-2 text-foreground"
                      placeholder="Search companies..."
                    />
                    <datalist id="companies-list">
                      {companies.map(c => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                    {companies.length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        No companies found. Create a company first in the Companies section.
                      </p>
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
                      className="w-full border border-input bg-background rounded-md p-2 text-foreground"
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

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 w-full sm:w-auto"
                    onClick={handleSubmit}
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reject Reason Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-4 sm:p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
                <div className="flex justify-between items-center gap-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">Reject Location</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectingLocationId(null);
                      setRejectionReason('');
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div>
                  <Label>Rejection Reason *</Label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full border border-input bg-background rounded-md p-2 min-h-[100px] text-foreground"
                    placeholder="Please provide a reason for rejecting this location..."
                    autoFocus
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 w-full sm:w-auto"
                    variant="destructive"
                    onClick={confirmReject}
                    disabled={!rejectionReason.trim()}
                  >
                    Reject Location
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectingLocationId(null);
                      setRejectionReason('');
                    }}
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </AdminLayout>
  );
}
