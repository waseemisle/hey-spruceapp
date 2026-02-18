'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Phone, Plus, Edit2, Save, X, Search, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface AdminUser {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  createdAt: any;
}

export default function AdminUsersManagement() {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<AdminUser | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    phone: '',
  });

  const fetchAdminUsers = async () => {
    try {
      const adminsQuery = query(collection(db, 'adminUsers'));
      const snapshot = await getDocs(adminsQuery);
      const adminsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id,
      })) as AdminUser[];
      setAdminUsers(adminsData);
    } catch (error) {
      console.error('Error fetching admin users:', error);
      toast.error('Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminUsers();
  }, []);

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      phone: '',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (admin: AdminUser) => {
    setFormData({
      email: admin.email,
      fullName: admin.fullName,
      phone: admin.phone,
    });
    setEditingId(admin.uid);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.fullName || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      if (editingId) {
        // Update existing admin user
        await updateDoc(doc(db, 'adminUsers', editingId), {
          fullName: formData.fullName,
          phone: formData.phone,
          updatedAt: serverTimestamp(),
        });

        toast.success('Admin user updated successfully');
      } else {
        // Create new admin user via API route with invitation email
        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            role: 'admin',
            sendInvitation: true,
            userData: {
              fullName: formData.fullName,
              phone: formData.phone,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create admin user');
        }

        toast.success('Admin user created successfully! An invitation email has been sent.');
      }

      resetForm();
      fetchAdminUsers();
    } catch (error: any) {
      console.error('Error saving admin user:', error);
      toast.error(error.message || 'Failed to save admin user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAdmin = (admin: AdminUser) => {
    // Prevent deleting yourself
    if (auth.currentUser?.uid === admin.uid) {
      toast.error('You cannot delete your own account');
      return;
    }
    setAdminToDelete(admin);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!adminToDelete) return;

    try {
      // Delete the admin user document
      // Note: This won't delete from Firebase Auth (would need Admin SDK for that)
      await deleteDoc(doc(db, 'adminUsers', adminToDelete.uid));

      toast.success('Admin user deleted successfully');
      setShowDeleteModal(false);
      setAdminToDelete(null);
      fetchAdminUsers();
    } catch (error) {
      console.error('Error deleting admin user:', error);
      toast.error('Failed to delete admin user');
    }
  };

  const filteredAdmins = adminUsers.filter(admin => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      admin.fullName.toLowerCase().includes(searchLower) ||
      admin.email.toLowerCase().includes(searchLower) ||
      admin.phone.toLowerCase().includes(searchLower);
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
            <h1 className="text-3xl font-bold text-gray-900">Admin Users</h1>
            <p className="text-gray-600 mt-2">Manage admin user accounts</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Admin User
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search admin users by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Admin Users Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAdmins.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No admin users found</p>
              </CardContent>
            </Card>
          ) : (
            filteredAdmins.map((admin) => (
              <Card key={admin.uid} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-blue-600" />
                      {admin.fullName}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{admin.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{admin.phone}</span>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleOpenEdit(admin)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    {auth.currentUser?.uid !== admin.uid && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteAdmin(admin)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                    {editingId ? 'Edit Admin User' : 'Create New Admin User'}
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
                    <Label>Phone *</Label>
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="admin@groundops.com"
                      disabled={!!editingId}
                    />
                    {editingId && (
                      <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                    )}
                    {!editingId && (
                      <p className="text-xs text-green-600 mt-1">An invitation email will be sent to set up password</p>
                    )}
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
        {showDeleteModal && adminToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Admin User</h2>
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete admin user <strong>"{adminToDelete.fullName}"</strong>?
                </p>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> This will remove their admin access.
                  </p>
                  <p className="text-sm text-yellow-800 mt-2 font-semibold">This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setAdminToDelete(null);
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
                    Delete Admin User
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
