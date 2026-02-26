'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, getDoc, doc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle, XCircle, User, Mail, Phone, Building, Plus, Edit2, Save, X,
  Search, Trash2, Lock, Eye, LayoutGrid, List, MapPin, Users, Clock, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  assignedLocations?: string[];
  password?: string;
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

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-purple-500 to-purple-700',
  'from-green-500 to-green-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
  'from-teal-500 to-teal-700',
  'from-indigo-500 to-indigo-700',
  'from-amber-500 to-amber-700',
];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const STATUS_CONFIG = {
  approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
};

export default function ClientsManagement() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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
    assignedLocations: [] as string[],
    password: '',
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

  const fetchClients = async () => {
    try {
      const clientsQuery = query(collection(db, 'clients'));
      const snapshot = await getDocs(clientsQuery);
      const clientsData = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as Client[];
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
      const snapshot = await getDocs(query(collection(db, 'companies')));
      setCompanies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Company[]);
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'locations')));
      setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Location[]);
    } catch (error) {
      console.error('Error fetching locations:', error);
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

      const clientDoc = await getDoc(doc(db, 'clients', clientId));
      if (!clientDoc.exists()) { toast.error('Client not found'); return; }

      const clientData = clientDoc.data();
      if ((clientData.assignedLocations || []).length === 0) {
        toast.error('Cannot approve client without assigned locations.');
        return;
      }

      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';

      await updateDoc(doc(db, 'clients', clientId), {
        status: 'approved', approvedBy: currentUser.uid, approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });

      try {
        await fetch('/api/email/send-client-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: clientData.email, toName: clientData.fullName,
            approvedBy: adminName, portalLink: `${window.location.origin}/portal-login`,
          }),
        });
      } catch {}

      toast.success('Client approved and notified via email');
      fetchClients();
    } catch (error) {
      toast.error('Failed to approve client');
    }
  };

  const handleReject = async (clientId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      await updateDoc(doc(db, 'clients', clientId), {
        status: 'rejected', rejectedBy: currentUser.uid, rejectedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast.success('Client registration rejected');
      fetchClients();
    } catch (error) {
      toast.error('Failed to reject client');
    }
  };

  const resetForm = () => {
    setFormData({ email: '', fullName: '', companyId: '', phone: '', assignedLocations: [], password: '', status: 'approved' });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => { resetForm(); setShowModal(true); };

  const handleOpenEdit = (client: Client) => {
    setFormData({
      email: client.email, fullName: client.fullName, companyId: client.companyId || '',
      phone: client.phone, assignedLocations: client.assignedLocations || [],
      status: client.status, password: client.password || '',
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
      const selectedCompany = companies.find(c => c.id === formData.companyId);
      const companyName = selectedCompany ? selectedCompany.name : '';

      if (editingId) {
        await updateDoc(doc(db, 'clients', editingId), {
          fullName: formData.fullName, companyId: formData.companyId || null,
          companyName, phone: formData.phone,
          assignedLocations: formData.assignedLocations, status: formData.status, updatedAt: serverTimestamp(),
        });
        toast.success('Client updated successfully');
      } else {
        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email, role: 'client', sendInvitation: true,
            userData: { fullName: formData.fullName, companyId: formData.companyId || null, companyName, phone: formData.phone, assignedLocations: formData.assignedLocations, status: formData.status },
          }),
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to create client'); }
        const result = await response.json();
        if (result.emailSent) {
          toast.success('Client created! Invitation email sent.');
        } else {
          toast.success('Client created successfully!');
        }
      }
      resetForm();
      fetchClients();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save client');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClient = (client: Client) => { setClientToDelete(client); setShowDeleteModal(true); };

  const confirmDelete = async () => {
    if (!clientToDelete) return;
    try {
      const locationsQuery = query(collection(db, 'locations'), where('clientId', '==', clientToDelete.uid));
      const locationsSnapshot = await getDocs(locationsQuery);
      for (const locationDoc of locationsSnapshot.docs) {
        const locationId = locationDoc.id;
        const workOrdersSnapshot = await getDocs(query(collection(db, 'workOrders'), where('locationId', '==', locationId)));
        for (const workOrderDoc of workOrdersSnapshot.docs) {
          const workOrderId = workOrderDoc.id;
          await Promise.all([
            getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
            getDocs(query(collection(db, 'biddingWorkOrders'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
            getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
          ]);
          await deleteDoc(workOrderDoc.ref);
        }
        await deleteDoc(locationDoc.ref);
      }
      const clientWOSnapshot = await getDocs(query(collection(db, 'workOrders'), where('clientId', '==', clientToDelete.uid)));
      for (const workOrderDoc of clientWOSnapshot.docs) {
        const workOrderId = workOrderDoc.id;
        await Promise.all([
          getDocs(query(collection(db, 'quotes'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
          getDocs(query(collection(db, 'biddingWorkOrders'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
          getDocs(query(collection(db, 'invoices'), where('workOrderId', '==', workOrderId))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
        ]);
        await deleteDoc(workOrderDoc.ref);
      }
      await deleteDoc(doc(db, 'clients', clientToDelete.uid));
      toast.success('Client and all related data deleted');
      setShowDeleteModal(false);
      setClientToDelete(null);
      fetchClients();
    } catch (error) {
      toast.error('Failed to delete client');
    }
  };

  const filteredClients = clients.filter(client => {
    const statusMatch = filter === 'all' || client.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      client.fullName.toLowerCase().includes(searchLower) ||
      client.email.toLowerCase().includes(searchLower) ||
      client.phone.toLowerCase().includes(searchLower) ||
      (client.companyName && client.companyName.toLowerCase().includes(searchLower));
    return statusMatch && searchMatch;
  });

  const stats = {
    total: clients.length,
    approved: clients.filter(c => c.status === 'approved').length,
    pending: clients.filter(c => c.status === 'pending').length,
    rejected: clients.filter(c => c.status === 'rejected').length,
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
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-7 w-7 text-blue-600" />
              Clients
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage client registrations and approvals</p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Create Client
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: Users, color: 'text-blue-600 bg-blue-50 border-blue-100' },
            { label: 'Approved', value: stats.approved, icon: BadgeCheck, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-100' },
            { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600 bg-red-50 border-red-100' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
              <Icon className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="text-xs mt-0.5 opacity-75">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, email, phone, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['all', 'approved', 'pending', 'rejected'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f} {f === 'all' ? `(${stats.total})` : f === 'approved' ? `(${stats.approved})` : f === 'pending' ? `(${stats.pending})` : `(${stats.rejected})`}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {filteredClients.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="h-14 w-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium">No clients found</p>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && filteredClients.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => {
              const status = STATUS_CONFIG[client.status] || STATUS_CONFIG.pending;
              const color = avatarColor(client.uid);
              return (
                <div key={client.uid} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  {/* Color bar */}
                  <div className={`h-1 w-full bg-gradient-to-r ${color}`} />

                  <div className="p-5">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                          {getInitials(client.fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{client.fullName}</p>
                          {client.companyName && (
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                              <Building className="h-3 w-3 flex-shrink-0" />
                              {client.companyName}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border flex-shrink-0 ${status.className}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                      {client.password && (
                        <div className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{client.password}</span>
                        </div>
                      )}
                    </div>

                    {/* Locations */}
                    {client.assignedLocations && client.assignedLocations.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1.5">
                          <MapPin className="h-3 w-3" />
                          {client.assignedLocations.length} location{client.assignedLocations.length !== 1 ? 's' : ''}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {client.assignedLocations.slice(0, 2).map((locId) => {
                            const location = locations.find(l => l.id === locId);
                            return location ? (
                              <span key={locId} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                                {location.locationName}
                              </span>
                            ) : null;
                          })}
                          {client.assignedLocations.length > 2 && (
                            <span className="text-xs text-gray-400">+{client.assignedLocations.length - 2}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          No locations assigned
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
                      <Button size="sm" variant="secondary" className="w-full gap-2" onClick={() => router.push(`/admin-portal/clients/${client.uid}`)}>
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleOpenEdit(client)}>
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteClient(client)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {client.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(client.uid)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => handleReject(client.uid)}>
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && filteredClients.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Locations</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClients.map((client) => {
                  const status = STATUS_CONFIG[client.status] || STATUS_CONFIG.pending;
                  const color = avatarColor(client.uid);
                  return (
                    <tr key={client.uid} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                            {getInitials(client.fullName)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{client.fullName}</p>
                            {client.companyName && <p className="text-xs text-gray-500">{client.companyName}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <p className="text-gray-700">{client.email}</p>
                        <p className="text-xs text-gray-500">{client.phone}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {client.assignedLocations && client.assignedLocations.length > 0 ? (
                          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                            {client.assignedLocations.length} location{client.assignedLocations.length !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">No locations</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${status.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => router.push(`/admin-portal/clients/${client.uid}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleOpenEdit(client)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {client.status === 'pending' && (
                            <>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleApprove(client.uid)}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleReject(client.uid)}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteClient(client)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingId ? 'Edit Client' : 'Create New Client'}
                  </h2>
                  <button onClick={resetForm} className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Full Name *</Label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="John Doe"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Company</Label>
                    <select
                      value={formData.companyId}
                      onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a company (optional)</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-gray-700">Assigned Locations *</Label>
                    <div className="mt-1 border border-gray-200 rounded-lg p-3 max-h-52 overflow-y-auto bg-white">
                      {formData.companyId ? (
                        locations.filter(loc => loc.companyId === formData.companyId).length > 0 ? (
                          locations.filter(loc => loc.companyId === formData.companyId).map((location) => (
                            <label key={location.id} className="flex items-center gap-2.5 py-2 px-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.assignedLocations.includes(location.id)}
                                onChange={(e) => {
                                  setFormData({
                                    ...formData,
                                    assignedLocations: e.target.checked
                                      ? [...formData.assignedLocations, location.id]
                                      : formData.assignedLocations.filter(id => id !== location.id),
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{location.locationName}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm text-gray-400 italic text-center py-4">No locations for this company.</p>
                        )
                      ) : (
                        <p className="text-sm text-gray-400 italic text-center py-4">Select a company to see locations.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="xyz@gmail.com"
                      disabled={!!editingId}
                      className="mt-1"
                    />
                    {!editingId && <p className="text-xs text-emerald-600 mt-1">An invitation email will be sent to set up password</p>}
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Phone *</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                      className="mt-1"
                    />
                  </div>

                  {editingId && (
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-700">Password (View Only)</Label>
                      <Input
                        type="text"
                        value={formData.password || ''}
                        readOnly
                        className="mt-1 bg-gray-50 cursor-default font-mono"
                        placeholder="Not set yet"
                      />
                      <p className={`text-xs mt-1 flex items-center gap-1 ${formData.password ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${formData.password ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {formData.password ? 'Password set by client' : 'Waiting for client to set password'}
                      </p>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Status *</Label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
                    <Save className="h-4 w-4" />
                    {submitting ? 'Saving...' : editingId ? 'Update Client' : 'Create Client'}
                  </Button>
                  <Button variant="outline" onClick={resetForm} disabled={submitting}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && clientToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Delete Client</h2>
                </div>
                <p className="text-gray-600 text-sm mb-4">
                  Are you sure you want to delete <strong className="text-gray-900">"{clientToDelete.fullName || clientToDelete.companyName}"</strong>?
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-800">
                  <p className="font-medium mb-1">This will permanently delete:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    <li>All their locations</li>
                    <li>All their work orders</li>
                    <li>All related quotes &amp; invoices</li>
                    <li>All bidding work orders</li>
                  </ul>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setShowDeleteModal(false); setClientToDelete(null); }} className="flex-1">Cancel</Button>
                  <Button variant="destructive" onClick={confirmDelete} className="flex-1">Delete Client</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
