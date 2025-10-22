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
interface Subsidiary { id: string; clientId: string; name: string; email?: string; phone?: string }

export default function AdminSubsidiaries() {
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
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
      const [subsSnap, clientsSnap] = await Promise.all([
        getDocs(query(collection(db, 'subsidiaries'))),
        getDocs(query(collection(db, 'clients'))),
      ]);
      const subs = subsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any as Subsidiary[];
      const cls = clientsSnap.docs.map((d) => ({ id: d.id, fullName: d.data().fullName, email: d.data().email })) as Client[];
      setSubsidiaries(subs);
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
        await updateDoc(doc(db, 'subsidiaries', editingId), {
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          updatedAt: serverTimestamp(),
        });
        toast.success('Subsidiary updated');
      } else {
        await addDoc(collection(db, 'subsidiaries'), {
          clientId: formData.clientId,
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Subsidiary created');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ clientId: '', name: '', email: '', phone: '' });
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create subsidiary');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ clientId: '', name: '', email: '', phone: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (s: Subsidiary) => {
    setEditingId(s.id);
    setFormData({ clientId: s.clientId, name: s.name, email: s.email || '', phone: s.phone || '' });
    setShowModal(true);
  };

  const performDelete = async (s: Subsidiary) => {
    try {
      // prevent deletion if locations exist for subsidiary
      const locSnap = await getDocs(query(collection(db, 'locations'), where('subsidiaryId', '==', s.id)));
      if (!locSnap.empty) {
        toast.error(`Cannot delete. ${locSnap.size} location(s) linked to this subsidiary.`);
        return;
      }
      await deleteDoc(doc(db, 'subsidiaries', s.id));
      toast.success('Subsidiary deleted');
      fetchAll();
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete subsidiary');
    }
  };

  const filtered = subsidiaries.filter((s) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    const client = clients.find((c) => c.id === s.clientId);
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
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
            <h1 className="text-3xl font-bold text-gray-900">Subsidiaries</h1>
            <p className="text-gray-600 mt-2">Manage client subsidiaries</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Subsidiary
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by subsidiary or client..."
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
                <p className="text-gray-600">No subsidiaries found</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((s) => {
              const client = clients.find((c) => c.id === s.clientId);
              return (
                <Card key={s.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{client ? `${client.fullName} (${client.email})` : s.clientId}</span>
                    </div>
                    {s.email && <div>Email: {s.email}</div>}
                    {s.phone && <div>Phone: {s.phone}</div>}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => handleOpenEdit(s)}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => performDelete(s)}>
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
                <h2 className="text-2xl font-bold">{editingId ? 'Edit Subsidiary' : 'Create Subsidiary'}</h2>
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
                    <Label>Subsidiary Name *</Label>
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


