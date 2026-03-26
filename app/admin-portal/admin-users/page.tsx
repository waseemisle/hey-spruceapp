'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Phone, Plus, Edit2, Save, X, Search, Trash2, ShieldCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';

interface AdminUser {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  createdAt: any;
  workOrderEmailNotifications: boolean;
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
      const adminsData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        uid: docSnap.id,
        workOrderEmailNotifications: docSnap.data().workOrderEmailNotifications !== false,
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
        // Pass the current admin's token so the server can write to Firestore on their behalf
        const currentUser = auth.currentUser;
        const adminToken = currentUser ? await currentUser.getIdToken() : null;

        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
          },
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

  const handleToggleWorkOrderEmail = async (admin: AdminUser) => {
    const newValue = !admin.workOrderEmailNotifications;
    try {
      await updateDoc(doc(db, 'adminUsers', admin.uid), {
        workOrderEmailNotifications: newValue,
        updatedAt: serverTimestamp(),
      });
      setAdminUsers(prev =>
        prev.map(a => a.uid === admin.uid ? { ...a, workOrderEmailNotifications: newValue } : a)
      );
      toast.success(`Work order email notifications ${newValue ? 'enabled' : 'disabled'} for ${admin.fullName}`);
    } catch (error) {
      console.error('Error updating notification preference:', error);
      toast.error('Failed to update notification preference');
    }
  };

  const filteredAdmins = adminUsers.filter(admin => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      admin.fullName.toLowerCase().includes(searchLower) ||
      admin.email.toLowerCase().includes(searchLower) ||
      admin.phone.toLowerCase().includes(searchLower);
  });

  return (
    <AdminLayout>
      <PageContainer>
        <PageHeader
          title="Admin Users"
          subtitle="Manage admin user accounts"
          icon={ShieldCheck}
          iconClassName="text-blue-600"
          action={
            <Button onClick={handleOpenCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Create New Admin User
            </Button>
          }
        />

        <StatCards items={[{ label: 'Total', value: adminUsers.length, icon: User, color: 'blue' }]} />

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredAdmins.length === 0 ? (
          <EmptyState icon={User} title="No admin users found" subtitle="Try adjusting your search" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAdmins.map((admin) => (
              <div key={admin.uid} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Row 1: name + role badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{admin.fullName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{admin.email}</p>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold text-blue-700 bg-blue-50">Admin</span>
                </div>
                {/* Row 2: phone */}
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground truncate">{admin.phone}</span>
                </div>
                {/* Row 3: email notifications toggle */}
                <div className="flex items-center justify-between text-sm gap-2 py-1 border-t border-border">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5" />
                    WO Emails
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleWorkOrderEmail(admin)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0 ${
                      admin.workOrderEmailNotifications ? 'bg-blue-600' : 'bg-muted-foreground/30'
                    }`}
                    title={admin.workOrderEmailNotifications ? 'Disable work order email notifications' : 'Enable work order email notifications'}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        admin.workOrderEmailNotifications ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-border">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handleOpenEdit(admin)}>
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {auth.currentUser?.uid !== admin.uid && (
                    <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeleteAdmin(admin)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
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
                      <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
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
                    loading={submitting} disabled={submitting}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {submitting ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetForm}
                    loading={submitting} disabled={submitting}
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Admin User</h2>
                <p className="text-foreground mb-4">
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
      </PageContainer>
    </AdminLayout>
  );
}
