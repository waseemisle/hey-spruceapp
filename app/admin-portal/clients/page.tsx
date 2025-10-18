'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, User, Mail, Phone, Building, Plus, Edit2, Save, X, Search } from 'lucide-react';

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export default function ClientsManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    companyName: '',
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
      toast({
        title: 'Error',
        description: 'Failed to load clients',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
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

      toast({
        title: 'Client Approved',
        description: 'Client has been approved successfully',
      });

      fetchClients();
    } catch (error) {
      console.error('Error approving client:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve client',
        variant: 'destructive',
      });
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

      toast({
        title: 'Client Rejected',
        description: 'Client registration has been rejected',
      });

      fetchClients();
    } catch (error) {
      console.error('Error rejecting client:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject client',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      fullName: '',
      companyName: '',
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
      password: '',
      fullName: client.fullName,
      companyName: client.companyName || '',
      phone: client.phone,
      status: client.status,
    });
    setEditingId(client.uid);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.fullName || !formData.phone) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (!editingId && !formData.password) {
      toast({
        title: 'Validation Error',
        description: 'Password is required for new clients',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      if (editingId) {
        // Update existing client
        await updateDoc(doc(db, 'clients', editingId), {
          fullName: formData.fullName,
          companyName: formData.companyName,
          phone: formData.phone,
          status: formData.status,
          updatedAt: serverTimestamp(),
        });

        toast({
          title: 'Success',
          description: 'Client updated successfully',
        });
      } else {
        // Create new client via API route (doesn't log out admin)
        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            role: 'client',
            userData: {
              fullName: formData.fullName,
              companyName: formData.companyName,
              phone: formData.phone,
              status: formData.status,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create client');
        }

        toast({
          title: 'Success',
          description: 'Client created successfully',
        });
      }

      resetForm();
      fetchClients();
    } catch (error: any) {
      console.error('Error saving client:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save client',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
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
                    <Label>Company Name</Label>
                    <Input
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      placeholder="Optional"
                    />
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
                  </div>

                  {!editingId && (
                    <div>
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="Minimum 6 characters"
                      />
                    </div>
                  )}

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
      </div>
    </AdminLayout>
  );
}
