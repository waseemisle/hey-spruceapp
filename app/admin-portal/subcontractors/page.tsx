'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, User, Mail, Phone, Building, Award, Plus, Edit2, Save, X, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  skills: string[];
  licenseNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export default function SubcontractorsManagement() {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subToDelete, setSubToDelete] = useState<Subcontractor | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    businessName: '',
    phone: '',
    licenseNumber: '',
    skills: '',
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(collection(db, 'subcontractors'));
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.id,
      })) as Subcontractor[];
      setSubcontractors(subsData);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
      toast.error('Failed to load subcontractors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubcontractors();
  }, []);

  const handleApprove = async (subId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'subcontractors', subId), {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Subcontractor has been approved successfully');

      fetchSubcontractors();
    } catch (error) {
      console.error('Error approving subcontractor:', error);
      toast.error('Failed to approve subcontractor');
    }
  };

  const handleReject = async (subId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      await updateDoc(doc(db, 'subcontractors', subId), {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success('Subcontractor registration has been rejected');

      fetchSubcontractors();
    } catch (error) {
      console.error('Error rejecting subcontractor:', error);
      toast.error('Failed to reject subcontractor');
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      fullName: '',
      businessName: '',
      phone: '',
      licenseNumber: '',
      skills: '',
      status: 'approved',
    });
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const handleOpenEdit = (sub: Subcontractor) => {
    setFormData({
      email: sub.email,
      fullName: sub.fullName,
      businessName: sub.businessName,
      phone: sub.phone,
      licenseNumber: sub.licenseNumber || '',
      skills: sub.skills?.join(', ') || '',
      status: sub.status,
    });
    setEditingId(sub.uid);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formData.email || !formData.fullName || !formData.businessName || !formData.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      if (editingId) {
        // Update existing subcontractor
        const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s);
        await updateDoc(doc(db, 'subcontractors', editingId), {
          fullName: formData.fullName,
          businessName: formData.businessName,
          phone: formData.phone,
          licenseNumber: formData.licenseNumber,
          skills: skillsArray,
          status: formData.status,
          updatedAt: serverTimestamp(),
        });

        toast.success('Subcontractor updated successfully');
      } else {
        // Create new subcontractor via API route with invitation email
        const skillsArray = formData.skills.split(',').map(s => s.trim()).filter(s => s);

        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            role: 'subcontractor',
            sendInvitation: true,
            userData: {
              fullName: formData.fullName,
              businessName: formData.businessName,
              phone: formData.phone,
              licenseNumber: formData.licenseNumber,
              skills: skillsArray,
              status: formData.status,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create subcontractor');
        }

        toast.success('Subcontractor created successfully! An invitation email has been sent.');
      }

      resetForm();
      fetchSubcontractors();
    } catch (error: any) {
      console.error('Error saving subcontractor:', error);
      toast.error(error.message || 'Failed to save subcontractor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSubcontractor = (subcontractor: Subcontractor) => {
    setSubToDelete(subcontractor);
    setShowDeleteModal(true);
  };

  const confirmDeleteSubcontractor = async () => {
    if (!subToDelete) return;

    try {
      // Delete all quotes by this subcontractor
      const quotesQuery = query(
        collection(db, 'quotes'),
        where('subcontractorId', '==', subToDelete.uid)
      );
      const quotesSnapshot = await getDocs(quotesQuery);
      await Promise.all(quotesSnapshot.docs.map(doc => deleteDoc(doc.ref)));

      // Delete all bidding work orders for this subcontractor
      const biddingQuery = query(
        collection(db, 'biddingWorkOrders'),
        where('subcontractorId', '==', subToDelete.uid)
      );
      const biddingSnapshot = await getDocs(biddingQuery);
      await Promise.all(biddingSnapshot.docs.map(doc => deleteDoc(doc.ref)));

      // Delete the subcontractor document
      await deleteDoc(doc(db, 'subcontractors', subToDelete.uid));

      toast.success('Subcontractor and all related data deleted successfully');
      setShowDeleteModal(false);
      setSubToDelete(null);
      fetchSubcontractors();
    } catch (error) {
      console.error('Error deleting subcontractor:', error);
      toast.error('Failed to delete subcontractor');
    }
  };

  const filteredSubcontractors = subcontractors.filter(sub => {
    // Filter by status
    const statusMatch = filter === 'all' || sub.status === filter;

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      sub.fullName.toLowerCase().includes(searchLower) ||
      sub.businessName.toLowerCase().includes(searchLower) ||
      sub.email.toLowerCase().includes(searchLower) ||
      sub.phone.toLowerCase().includes(searchLower) ||
      (sub.licenseNumber && sub.licenseNumber.toLowerCase().includes(searchLower)) ||
      (sub.skills && sub.skills.some(skill => skill.toLowerCase().includes(searchLower)));

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
            <h1 className="text-3xl font-bold text-gray-900">Subcontractors</h1>
            <p className="text-gray-600 mt-2">Manage subcontractor registrations and approvals</p>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Subcontractor
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search subcontractors by name, business, email, phone, license, or skills..."
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
              {filterOption} ({subcontractors.filter(s => filterOption === 'all' || s.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Subcontractors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSubcontractors.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No subcontractors found</p>
              </CardContent>
            </Card>
          ) : (
            filteredSubcontractors.map((sub) => (
              <Card key={sub.uid} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{sub.fullName}</CardTitle>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(sub.status)}`}>
                      {sub.status.toUpperCase()}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building className="h-4 w-4" />
                    <span>{sub.businessName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="h-4 w-4" />
                    <span>{sub.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{sub.phone}</span>
                  </div>
                  {sub.licenseNumber && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Award className="h-4 w-4" />
                      <span>{sub.licenseNumber}</span>
                    </div>
                  )}
                  {sub.skills && sub.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {sub.skills.map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleOpenEdit(sub)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteSubcontractor(sub)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {sub.status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(sub.uid)}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={() => handleReject(sub.uid)}
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
                    {editingId ? 'Edit Subcontractor' : 'Create New Subcontractor'}
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
                    <Label>Business Name *</Label>
                    <Input
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      placeholder="ABC Services"
                    />
                  </div>

                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="abc@gmail.com"
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
                    <Label>License Number</Label>
                    <Input
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      placeholder="Optional"
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

                  <div className="md:col-span-2">
                    <Label>Skills (comma-separated)</Label>
                    <Input
                      value={formData.skills}
                      onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                      placeholder="HVAC, Plumbing, Electrical"
                    />
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
        {showDeleteModal && subToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">Delete Subcontractor</h2>
                <p className="text-gray-700 mb-4">
                  Are you sure you want to delete subcontractor <strong>"{subToDelete.fullName}"</strong>?
                </p>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> This will also delete:
                  </p>
                  <ul className="list-disc list-inside text-sm text-yellow-800 mt-2">
                    <li>All their quotes</li>
                    <li>All bidding work orders assigned to them</li>
                  </ul>
                  <p className="text-sm text-yellow-800 mt-2 font-semibold">This action cannot be undone.</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setSubToDelete(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={confirmDeleteSubcontractor}
                    className="flex-1"
                  >
                    Delete Subcontractor
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
