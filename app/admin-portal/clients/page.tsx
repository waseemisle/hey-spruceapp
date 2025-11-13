'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, User, Mail, Phone, Building, Plus, Edit2, Save, X, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

interface Company {
  id: string;
  name: string;
  clientId?: string;
}

export default function ClientsManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    companyId: '',
    phone: '',
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

  useEffect(() => {
    fetchClients();
    fetchCompanies();
  }, []);

  const handleApprove = async (clientId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'clients', clientId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Client has been approved successfully');

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

                  <div className="flex gap-2 pt-4">
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
