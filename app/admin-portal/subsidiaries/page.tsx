'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Save, X, Search, Edit2, Trash2, Eye, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';

interface Company { id: string; clientId?: string; name: string; email?: string; phone?: string; logoUrl?: string }

export default function AdminCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
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
      const companiesSnap = await getDocs(query(collection(db, 'companies')));
      const comps = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any as Company[];
      setCompanies(comps);
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
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB');
        return;
      }
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Company name is required');
      return;
    }
    setSaving(true);
    try {
      let logoUrl = formData.logoUrl;

      // Upload logo if a new file is selected
      if (logoFile) {
        setUploadingLogo(true);
        try {
          logoUrl = await uploadToCloudinary(logoFile);
          toast.success('Logo uploaded successfully');
        } catch (error: any) {
          toast.error('Failed to upload logo: ' + error.message);
          setUploadingLogo(false);
          setSaving(false);
          return;
        }
        setUploadingLogo(false);
      }

      if (editingId) {
        await updateDoc(doc(db, 'companies', editingId), {
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          logoUrl: logoUrl || '',
          updatedAt: serverTimestamp(),
        });
        toast.success('Company updated');
      } else {
        await addDoc(collection(db, 'companies'), {
          name: formData.name,
          email: formData.email || '',
          phone: formData.phone || '',
          logoUrl: logoUrl || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success('Company created');
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', email: '', phone: '', logoUrl: '' });
      setLogoFile(null);
      setLogoPreview('');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to create company');
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: '', email: '', phone: '', logoUrl: '' });
    setLogoFile(null);
    setLogoPreview('');
    setShowModal(true);
  };

  const handleOpenEdit = (c: Company) => {
    setEditingId(c.id);
    setFormData({ name: c.name, email: c.email || '', phone: c.phone || '', logoUrl: c.logoUrl || '' });
    setLogoFile(null);
    setLogoPreview(c.logoUrl || '');
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
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
            placeholder="Search by company name, email, or phone..."
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
              return (
                <Card key={c.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      {c.logoUrl && (
                        <img
                          src={c.logoUrl}
                          alt={c.name}
                          className="h-12 w-12 object-contain rounded"
                        />
                      )}
                      <CardTitle className="text-lg">{c.name}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-gray-600">
                    {c.email && <div>Email: {c.email}</div>}
                    {c.phone && <div>Phone: {c.phone}</div>}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/admin-portal/subsidiaries/${c.id}`)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleOpenEdit(c)}>
                        <Edit2 className="h-4 w-4" />
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
                  <div className="md:col-span-2">
                    <Label>Company Logo</Label>
                    <div className="mt-2 space-y-2">
                      {(logoPreview || formData.logoUrl) && (
                        <div className="relative inline-block">
                          <img
                            src={logoPreview || formData.logoUrl}
                            alt="Logo preview"
                            className="h-24 w-24 object-contain border rounded p-2 bg-gray-50"
                          />
                          {logoFile && (
                            <button
                              type="button"
                              onClick={() => {
                                setLogoFile(null);
                                setLogoPreview(formData.logoUrl || '');
                              }}
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
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoChange}
                            className="hidden"
                            disabled={uploadingLogo}
                          />
                        </label>
                        {uploadingLogo && (
                          <span className="text-sm text-gray-500">Uploading...</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Recommended: Square image, max 5MB</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t">
                  <Button className="flex-1" onClick={handleSave} loading={saving} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowModal(false)} loading={saving} disabled={saving}>
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


