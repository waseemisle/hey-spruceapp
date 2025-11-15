'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, getDoc, doc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, User, Mail, Phone, Building, Plus, Edit2, Save, X, Search, Trash2, LogIn } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  assignedLocations?: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

interface Company {
  id: string;
  name: string;
  clientId?: string;
}

interface Location {
  id: string;
  locationName: string;
  companyId?: string;
  companyName?: string;
  address?: any;
}

export default function ClientsManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    companyId: '',
    phone: '',
    assignedLocations: [] as string[],
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id,
      })) as Client[];
      setClients(clientsData);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const companiesQuery = query(collection(db, 'companies'));
      const snapshot = await getDocs(companiesQuery);
      const companiesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Company[];
      setCompanies(companiesData);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Failed to load companies');
    }
  };

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
    }
  };

  useEffect(() => {
    fetchClients();
    fetchCompanies();
    fetchLocations();
  }, []);

  const handleApprove = async (clientId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Get client data to check assigned locations and email
      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (!clientDoc.exists()) {
        toast.error('Client not found');
        return;
      }

      const clientData = clientDoc.data();
      const assignedLocations = clientData.assignedLocations || [];

      // Validate: Client must have at least one assigned location
      if (assignedLocations.length === 0) {
        toast.error('Cannot approve client without assigned locations. Please assign at least one location first.');
        return;
      }

      // Get admin name
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      await updateDoc(doc(db, 'clients', clientId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Send approval email to client
      try {
        await fetch('/api/email/send-client-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: clientData.email,
            toName: clientData.fullName,
            approvedBy: adminName,
            portalLink: `${window.location.origin}/portal-login`,
          }),
        });
      } catch (emailError) {
        console.error('Failed to send approval email:', emailError);
        // Don't fail the whole operation if email fails
      }

      toast.success('Client has been approved successfully and notified via email');

      fetchClients();
    } catch (error) {
      console.error('Error approving client:', error);
      toast.error('Failed to approve client');
    }
  };

  const handleReject = async (clientId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'clients', clientId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Client registration has been rejected');

      fetchClients();
    } catch (error) {
      console.error('Error rejecting client:', error);
      toast.error('Failed to reject client');
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      companyId: '',
      phone: '',
      assignedLocations: [],
      status: 'approved',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (client: Client) => {
    setFormData({
      email: client.email,
      fullName: client.fullName,
      companyId: client.companyId || '',
      phone: client.phone,
      assignedLocations: client.assignedLocations || [],
      status: client.status,
    });
    setEditingId(client.uid);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.fullName || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      // Get company name from companyId if selected
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      const companyName = selectedCompany ? selectedCompany.name : '';

      if (editingId) {
        // Update existing client
        await updateDoc(doc(db, 'clients', editingId), {
          fullName: formData.fullName,
          companyId: formData.companyId || null,
          companyName: companyName,
          phone: formData.phone,
          assignedLocations: formData.assignedLocations,
          status: formData.status,
          updatedAt: serverTimestamp(),
        });

        toast.success('Client updated successfully');
      } else {
        // Create new client via API route with invitation email
        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            role: 'client',
            sendInvitation: true,
            userData: {
              fullName: formData.fullName,
              companyId: formData.companyId || null,
              companyName: companyName,
              phone: formData.phone,
              assignedLocations: formData.assignedLocations,
              status: formData.status,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create client');
        }

        toast.success('Client created successfully! An invitation email has been sent.');
      }

      resetForm();
      fetchClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      toast.error(error.message || 'Failed to save client');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClient = (client: Client) => {
    setClientToDelete(client);
    setShowDeleteModal(true);
  };

  const handleImpersonate = async (clientId: string) => {
    try {
      setImpersonating(clientId);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error('You must be logged in to impersonate');
        return;
      }

      // Get the current user's ID token
      const idToken = await currentUser.getIdToken();

      // Call the impersonation API
      const response = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId: clientId,
          role: 'client',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate impersonation link');
      }

      // Redirect to the impersonation URL
      window.location.href = data.impersonationUrl;
    } catch (error: any) {
      console.error('Error impersonating client:', error);
      toast.error(error.message || 'Failed to impersonate client');
      setImpersonating(null);
    }
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;

    try {
      // Delete all client locations and their related data
      const locationsQuery = query(
        collection(db, 'locations'),
        where('clientId', '==', clientToDelete.uid)
      );
      const locationsSnapshot = await getDocs(locationsQuery);

      for (const locationDoc of locationsSnapshot.docs) {
        const locationId = locationDoc.id;

        // Find work orders at this location
        const workOrdersQuery = query(
          collection(db, 'workOrders'),
          where('locationId', '==', locationId)
        );
        const workOrdersSnapshot = await getDocs(workOrdersQuery);

        // Delete work orders and their related data
        for (const workOrderDoc of workOrdersSnapshot.docs) {
          const workOrderId = workOrderDoc.id;

          // Delete quotes
          const quotesQuery = query(collection(db, 'quotes'), where('workOrderId', '==', workOrderId));
          const quotesSnapshot = await getDocs(quotesQuery);
          await Promise.all(quotesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

          // Delete bidding work orders
          const biddingQuery = query(collection(db, 'biddingWorkOrders'), where('workOrderId', '==', workOrderId));
          const biddingSnapshot = await getDocs(biddingQuery);
          await Promise.all(biddingSnapshot.docs.map(doc => deleteDoc(doc.ref)));

          // Delete invoices
          const invoicesQuery = query(collection(db, 'invoices'), where('workOrderId', '==', workOrderId));
          const invoicesSnapshot = await getDocs(invoicesQuery);
          await Promise.all(invoicesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

          // Delete work order
          await deleteDoc(workOrderDoc.ref);
        }

        // Delete location
        await deleteDoc(locationDoc.ref);
      }

      // Delete any work orders directly associated with this client
      const clientWorkOrdersQuery = query(
        collection(db, 'workOrders'),
        where('clientId', '==', clientToDelete.uid)
      );
      const clientWorkOrdersSnapshot = await getDocs(clientWorkOrdersQuery);

      for (const workOrderDoc of clientWorkOrdersSnapshot.docs) {
        const workOrderId = workOrderDoc.id;

        // Delete related data
        const quotesQuery = query(collection(db, 'quotes'), where('workOrderId', '==', workOrderId));
        const quotesSnapshot = await getDocs(quotesQuery);
        await Promise.all(quotesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        const biddingQuery = query(collection(db, 'biddingWorkOrders'), where('workOrderId', '==', workOrderId));
        const biddingSnapshot = await getDocs(biddingQuery);
        await Promise.all(biddingSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        const invoicesQuery = query(collection(db, 'invoices'), where('workOrderId', '==', workOrderId));
        const invoicesSnapshot = await getDocs(invoicesQuery);
        await Promise.all(invoicesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

        await deleteDoc(workOrderDoc.ref);
      }

      // Delete the client from authentication would need admin SDK, so we just delete from Firestore
      await deleteDoc(doc(db, 'clients', clientToDelete.uid));

      toast.success('Client and all related data deleted successfully');
      setShowDeleteModal(false);
      setClientToDelete(null);
      fetchClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Failed to delete client');
    }
  };

  const filteredClients = clients.filter(client => {
    // Filter by status
    const statusMatch = filter === 'all' || client.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      client.fullName.toLowerCase().includes(searchLower) ||
      client.email.toLowerCase().includes(searchLower) ||
      client.phone.toLowerCase().includes(searchLower) ||
      (client.companyName && client.companyName.toLowerCase().includes(searchLower));

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
            <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-600 mt-2">Manage client registrations and approvals</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Client
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search clients by name, email, phone, or company..."
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
              {filterOption} ({clients.filter(c => filterOption === 'all' || c.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Clients Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No clients found</p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map((client) => (
              <Card key={client.uid} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{client.fullName}</CardTitle>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(client.status)}`}>
                      {client.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {client.companyName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Building className="h-4 w-4" />
                      <span>{client.companyName}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{client.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{client.phone}</span>
                  </div>

                  {client.assignedLocations && client.assignedLocations.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mt-2">
                      <p className="text-xs font-semibold text-blue-900 mb-1">Assigned Locations ({client.assignedLocations.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {client.assignedLocations.slice(0, 3).map((locId) => {
                          const location = locations.find(l => l.id === locId);
                          return location ? (
                            <span key={locId} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {location.locationName}
                            </span>
                          ) : null;
                        })}
                        {client.assignedLocations.length > 3 && (
                          <span className="text-xs text-blue-600">+{client.assignedLocations.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {(!client.assignedLocations || client.assignedLocations.length === 0) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mt-2">
                      <p className="text-xs font-semibold text-yellow-900">⚠️ No locations assigned</p>
                      <p className="text-xs text-yellow-700">Cannot approve without assigned locations</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="default"
                      className="w-full"
                      onClick={() => handleImpersonate(client.uid)}
                      disabled={impersonating === client.uid}
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      {impersonating === client.uid ? 'Logging in...' : 'Login as Client'}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleOpenEdit(client)}
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteClient(client)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {client.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => handleApprove(client.uid)}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => handleReject(client.uid)}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    {editingId ? 'Edit Client' : 'Create New Client'}
                  </h2>
                  <Button variant="outline" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name *</Label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <Label>Company</Label>
                    <select
                      value={formData.companyId}
                      onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                      className="w-full border border-gray-300 rounded-md p-2"
                    >
                      <option value="">Select a company (optional)</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <Label>Assigned Locations *</Label>
                    <div className="border border-gray-300 rounded-md p-3 max-h-60 overflow-y-auto bg-white">
                      {formData.companyId ? (
                        locations.filter(loc => loc.companyId === formData.companyId).length > 0 ? (
                          locations
                            .filter(loc => loc.companyId === formData.companyId)
                            .map((location) => (
                              <label key={location.id} className="flex items-center gap-2 py-2 hover:bg-gray-50 px-2 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.assignedLocations.includes(location.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData({
                                        ...formData,
                                        assignedLocations: [...formData.assignedLocations, location.id]
                                      });
                                    } else {
                                      setFormData({
                                        ...formData,
                                        assignedLocations: formData.assignedLocations.filter(id => id !== location.id)
                                      });
                                    }
                                  }}
                                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{location.locationName}</span>
                              </label>
                            ))
                        ) : (
                          <p className="text-sm text-gray-500 italic">No locations found for this company. Please create locations first.</p>
                        )
                      ) : (
                        <p className="text-sm text-gray-500 italic">Please select a company first to see available locations.</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Client will only see work orders for these locations. Select at least one location.
                    </p>
                  </div>

                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="xyz@gmail.com"
                      disabled={!!editingId}
                    />
                    {editingId && (
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    )}
                    {!editingId && (
                      <p className="text-xs text-green-600 mt-1">An invitation email will be sent to set up password</p>
                    )}
                  </div>

                  <div>
                    <Label>Phone *</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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

        {/* Delete Confirmation Modal */}
        {showDeleteModal && clientToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Client</h2>
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete client <strong>"{clientToDelete.fullName || clientToDelete.companyName}"</strong>?
                </p>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> This will permanently delete:
                  </p>
                  <ul className="list-disc list-inside text-sm text-yellow-800 mt-2">
                    <li>All their locations</li>
                    <li>All their work orders</li>
                    <li>All related quotes</li>
                    <li>All related invoices</li>
                    <li>All bidding work orders</li>
                  </ul>
                  <p className="text-sm text-yellow-800 mt-2 font-semibold">This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setClientToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDelete}
                    className="flex-1"
                  >
                    Delete Client
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
