'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Save, X, Search, Users, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Client { id: string; fullName: string; email: string }
interface Company { id: string; clientId: string; name: string; email?: string; phone?: string }

export default function AdminCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ clientId: '', name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [companiesSnap, clientsSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'))),
        getDocs(query(collection(db, 'clients'))),
      ]);
      const comps = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any as Company[];
      const cls = clientsSnap.docs.map((d) => ({ id: d.id, fullName: d.data().fullName, email: d.data().email })) as Client[];
      setCompanies(comps);
      setClients(cls);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleSave = async () => {
    if (!formData.clientId || !formData.name.trim()) {
      toast.error('Client and name are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'companies', editingId), {
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          updatedAt: serverTimestamp(),
        });
        toast.success('Company updated');
      } else {
        await addDoc(collection(db, 'companies'), {
          clientId: formData.clientId,
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Company created');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ clientId: '', name: '', email: '', phone: '' });
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create company');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ clientId: '', name: '', email: '', phone: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (c: Company) => {
    setEditingId(c.id);
    setFormData({ clientId: c.clientId, name: c.name, email: c.email || '', phone: c.phone || '' });
    setShowModal(true);
  };

  const performDelete = async (c: Company) => {
    try {
      // prevent deletion if locations exist for company
      const locSnap = await getDocs(query(collection(db, 'locations'), where('companyId', '==', c.id)));
      if (!locSnap.empty) {
        toast.error(`Cannot delete. ${locSnap.size} location(s) linked to this company.`);
        return;
      }
      await deleteDoc(doc(db, 'companies', c.id));
      toast.success('Company deleted');
      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete company');
    }
  };

  const filtered = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const client = clients.find((cl) => cl.id === c.clientId);
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (client?.fullName || '').toLowerCase().includes(q)
    );
  });

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
            <h1 className="text-3xl font-bold text-gray-900">Companies</h1>
            <p className="text-gray-600 mt-2">Manage client companies</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Company
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by company or client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No companies found</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((c) => {
              const client = clients.find((cl) => cl.id === c.clientId);
              return (
                <Card key={c.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{c.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{client ? `${client.fullName} (${client.email})` : c.clientId}</span>
                    </div>
                    {c.email && <div>Email: {c.email}</div>}
                    {c.phone && <div>Phone: {c.phone}</div>}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleOpenEdit(c)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => performDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-2xl font-bold">{editingId ? 'Edit Company' : 'Create Company'}</h2>
                <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
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
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} ({c.email})
                        </option>
                      ))}
                    </select>
                    {editingId && (
                      <p className="text-xs text-gray-500 mt-1">Client cannot be changed</p>
                    )}
                  </div>
                  <div>
                    <Label>Company Name *</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., West Coast Division"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t">
                  <Button className="flex-1" onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
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


