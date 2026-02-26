'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Save, X, Search, Edit2, Trash2, Eye, Upload, Mail, Phone, Users, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';

interface Company { id: string; clientId?: string; name: string; email?: string; phone?: string; logoUrl?: string }

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-purple-500 to-purple-700',
  'from-green-500 to-green-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
  'from-teal-500 to-teal-700',
];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AdminCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  const [locationCounts, setLocationCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', logoUrl: '' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [companiesSnap, clientsSnap, locationsSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'))),
        getDocs(query(collection(db, 'clients'))),
        getDocs(query(collection(db, 'locations'))),
      ]);

      const comps = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any as Company[];
      setCompanies(comps);

      const ccounts: Record<string, number> = {};
      clientsSnap.docs.forEach((d) => {
        const companyId = d.data().companyId;
        if (companyId) ccounts[companyId] = (ccounts[companyId] || 0) + 1;
      });
      setClientCounts(ccounts);

      const lcounts: Record<string, number> = {};
      locationsSnap.docs.forEach((d) => {
        const companyId = d.data().companyId;
        if (companyId) lcounts[companyId] = (lcounts[companyId] || 0) + 1;
      });
      setLocationCounts(lcounts);
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

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
      if (file.size > 5 * 1024 * 1024) { toast.error('Image size should be less than 5MB'); return; }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Company name is required'); return; }
    setSaving(true);
    try {
      let logoUrl = formData.logoUrl;
      if (logoFile) {
        setUploadingLogo(true);
        try {
          logoUrl = await uploadToCloudinary(logoFile);
          toast.success('Logo uploaded successfully');
        } catch (error: any) {
          toast.error('Failed to upload logo: ' + error.message);
          setUploadingLogo(false); setSaving(false); return;
        }
        setUploadingLogo(false);
      }
      if (editingId) {
        await updateDoc(doc(db, 'companies', editingId), {
          name: formData.name, email: formData.email || '', phone: formData.phone || '',
          logoUrl: logoUrl || '', updatedAt: serverTimestamp(),
        });
        toast.success('Company updated');
      } else {
        await addDoc(collection(db, 'companies'), {
          name: formData.name, email: formData.email || '', phone: formData.phone || '',
          logoUrl: logoUrl || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        toast.success('Company created');
      }
      setShowModal(false); setEditingId(null);
      setFormData({ name: '', email: '', phone: '', logoUrl: '' });
      setLogoFile(null); setLogoPreview('');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save company');
    } finally {
      setSaving(false); setUploadingLogo(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null); setFormData({ name: '', email: '', phone: '', logoUrl: '' });
    setLogoFile(null); setLogoPreview(''); setShowModal(true);
  };

  const handleOpenEdit = (c: Company) => {
    setEditingId(c.id);
    setFormData({ name: c.name, email: c.email || '', phone: c.phone || '', logoUrl: c.logoUrl || '' });
    setLogoFile(null); setLogoPreview(c.logoUrl || ''); setShowModal(true);
  };

  const performDelete = async (c: Company) => {
    try {
      const locSnap = await getDocs(query(collection(db, 'locations'), where('companyId', '==', c.id)));
      if (!locSnap.empty) { toast.error(`Cannot delete. ${locSnap.size} location(s) linked to this company.`); return; }
      await deleteDoc(doc(db, 'companies', c.id));
      toast.success('Company deleted');
      fetchAll();
    } catch (e) {
      console.error(e); toast.error('Failed to delete company');
    }
  };

  const filtered = companies.filter((c) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
  });

  const totalClients = Object.values(clientCounts).reduce((a, b) => a + b, 0);
  const totalLocations = Object.values(locationCounts).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="h-8 w-8 text-blue-600" />
              Companies
            </h1>
            <p className="text-gray-500 mt-1">Manage client companies and their details</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Companies', value: companies.length, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Total Clients', value: totalClients, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Total Locations', value: totalLocations, icon: MapPin, color: 'text-green-600', bg: 'bg-green-50' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
              <div className={`${s.bg} rounded-lg p-3`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Company Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No companies found</p>
              {searchQuery && <p className="text-sm text-gray-400 mt-1">Try adjusting your search</p>}
            </div>
          ) : (
            filtered.map((c) => {
              const clients = clientCounts[c.id] || 0;
              const locations = locationCounts[c.id] || 0;
              return (
                <Card
                  key={c.id}
                  className="hover:shadow-lg transition-all duration-200 border border-gray-200 overflow-hidden group"
                >
                  {/* Color accent bar */}
                  <div className={`h-1 w-full bg-gradient-to-r ${avatarColor(c.id)}`} />

                  <CardContent className="p-5 space-y-4">
                    {/* Company Identity */}
                    <div className="flex items-start gap-4">
                      {c.logoUrl ? (
                        <img
                          src={c.logoUrl}
                          alt={c.name}
                          className="h-14 w-14 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1 flex-shrink-0"
                        />
                      ) : (
                        <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${avatarColor(c.id)} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                          {getInitials(c.name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 text-base leading-tight truncate">{c.name}</h3>
                        {c.email && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-500">
                            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{c.email}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-500">
                            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Users className="h-4 w-4 text-purple-500" />
                        <span className="font-semibold">{clients}</span>
                        <span className="text-gray-400">{clients === 1 ? 'client' : 'clients'}</span>
                      </div>
                      <div className="w-px h-4 bg-gray-200" />
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <MapPin className="h-4 w-4 text-green-500" />
                        <span className="font-semibold">{locations}</span>
                        <span className="text-gray-400">{locations === 1 ? 'location' : 'locations'}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => router.push(`/admin-portal/subsidiaries/${c.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => handleOpenEdit(c)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                        onClick={() => performDelete(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Company' : 'Add Company'}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editingId ? 'Update company details' : 'Create a new company'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., West Coast Division"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="company@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Company Logo</Label>
                  <div className="mt-2 space-y-2">
                    {(logoPreview || formData.logoUrl) && (
                      <div className="relative inline-block">
                        <img
                          src={logoPreview || formData.logoUrl}
                          alt="Logo preview"
                          className="h-24 w-24 object-contain border rounded-lg p-2 bg-gray-50"
                        />
                        {logoFile && (
                          <button
                            type="button"
                            onClick={() => { setLogoFile(null); setLogoPreview(formData.logoUrl || ''); }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50">
                        <Upload className="h-4 w-4" />
                        <span className="text-sm">{logoPreview || formData.logoUrl ? 'Change Logo' : 'Upload Logo'}</span>
                        <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" disabled={uploadingLogo} />
                      </label>
                      {uploadingLogo && <span className="text-sm text-gray-500">Uploading...</span>}
                    </div>
                    <p className="text-xs text-gray-400">Square image recommended, max 5MB</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t">
                <Button className="flex-1" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : editingId ? 'Update Company' : 'Create Company'}
                </Button>
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
