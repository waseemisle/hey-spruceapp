'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp, where, deleteDoc, getDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle, XCircle, User, Mail, Phone, Building, Award, Plus, Edit2, Save, X,
  Search, Trash2, Lock, Send, ChevronDown, Eye, LayoutGrid, List,
  Users, Clock, BadgeCheck, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';

interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  skills: string[];
  licenseNumber?: string;
  password?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

interface Category {
  id: string;
  name: string;
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

export default function SubcontractorsManagement() {
  const router = useRouter();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subToDelete, setSubToDelete] = useState<Subcontractor | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillsSearchQuery, setSkillsSearchQuery] = useState('');
  const [skillsDropdownOpen, setSkillsDropdownOpen] = useState(false);
  const skillsDropdownRef = useRef<HTMLDivElement>(null);
  const skillsInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    businessName: '',
    phone: '',
    licenseNumber: '',
    password: '',
    status: 'approved' as 'pending' | 'approved' | 'rejected',
  });

  const fetchSubcontractors = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'subcontractors')));
      setSubcontractors(snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as Subcontractor[]);
    } catch (error) {
      toast.error('Failed to load subcontractors');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const snapshot = await getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')));
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name })) as Category[]);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  useEffect(() => {
    fetchSubcontractors();
    fetchCategories();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (skillsDropdownRef.current && !skillsDropdownRef.current.contains(event.target as Node)) {
        setSkillsDropdownOpen(false);
      }
    };
    if (skillsDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [skillsDropdownOpen]);

  const handleApprove = async (subId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const subDoc = await getDoc(doc(db, 'subcontractors', subId));
      if (!subDoc.exists()) { toast.error('Subcontractor not found'); return; }
      const subData = subDoc.data();
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';
      await updateDoc(doc(db, 'subcontractors', subId), {
        status: 'approved', approvedBy: currentUser.uid, approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      try {
        await fetch('/api/email/send-subcontractor-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: subData.email, toName: subData.fullName, businessName: subData.businessName,
            approvedBy: adminName, portalLink: `${window.location.origin}/portal-login`,
          }),
        });
      } catch {}
      toast.success('Subcontractor approved and notified via email');
      fetchSubcontractors();
    } catch (error) {
      toast.error('Failed to approve subcontractor');
    }
  };

  const handleReject = async (subId: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      await updateDoc(doc(db, 'subcontractors', subId), {
        status: 'rejected', rejectedBy: currentUser.uid, rejectedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast.success('Subcontractor registration rejected');
      fetchSubcontractors();
    } catch (error) {
      toast.error('Failed to reject subcontractor');
    }
  };

  const handleResendApprovalEmail = async (subId: string) => {
    try {
      setResendingEmail(subId);
      const currentUser = auth.currentUser;
      if (!currentUser) { toast.error('You must be logged in'); setResendingEmail(null); return; }
      const subDoc = await getDoc(doc(db, 'subcontractors', subId));
      if (!subDoc.exists()) { toast.error('Subcontractor not found'); setResendingEmail(null); return; }
      const subData = subDoc.data();
      const adminDoc = await getDoc(doc(db, 'adminUsers', currentUser.uid));
      const adminName = adminDoc.exists() ? adminDoc.data().fullName : 'Admin';
      const response = await fetch('/api/email/send-subcontractor-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: subData.email, toName: subData.fullName, businessName: subData.businessName,
          approvedBy: adminName, portalLink: `${window.location.origin}/portal-login`,
        }),
      });
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to send email'); }
      toast.success('Approval email resent successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend approval email');
    } finally {
      setResendingEmail(null);
    }
  };

  const resetForm = () => {
    setFormData({ email: '', fullName: '', businessName: '', phone: '', licenseNumber: '', password: '', status: 'approved' });
    setSelectedSkills([]);
    setSkillsSearchQuery('');
    setSkillsDropdownOpen(false);
    setEditingId(null);
    setShowModal(false);
  };

  const handleOpenCreate = () => { resetForm(); setShowModal(true); };

  const handleOpenEdit = (sub: Subcontractor) => {
    setFormData({
      email: sub.email, fullName: sub.fullName, businessName: sub.businessName,
      phone: sub.phone, licenseNumber: sub.licenseNumber || '', password: sub.password || '', status: sub.status,
    });
    setSelectedSkills(sub.skills || []);
    setSkillsSearchQuery('');
    setSkillsDropdownOpen(false);
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
        await updateDoc(doc(db, 'subcontractors', editingId), {
          fullName: formData.fullName, businessName: formData.businessName, phone: formData.phone,
          licenseNumber: formData.licenseNumber, skills: selectedSkills, status: formData.status, updatedAt: serverTimestamp(),
        });
        toast.success('Subcontractor updated successfully');
      } else {
        const response = await fetch('/api/auth/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email, role: 'subcontractor', sendInvitation: true,
            userData: {
              fullName: formData.fullName, businessName: formData.businessName, phone: formData.phone,
              licenseNumber: formData.licenseNumber, skills: selectedSkills, status: formData.status,
            },
          }),
        });
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Failed to create subcontractor'); }
        toast.success('Subcontractor created! An invitation email has been sent.');
      }
      resetForm();
      fetchSubcontractors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save subcontractor');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev => prev.includes(skillName) ? prev.filter(s => s !== skillName) : [...prev, skillName]);
  };

  const removeSkill = (skillName: string) => setSelectedSkills(prev => prev.filter(s => s !== skillName));

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(skillsSearchQuery.toLowerCase()) && !selectedSkills.includes(c.name)
  );

  const handleDeleteSubcontractor = (sub: Subcontractor) => { setSubToDelete(sub); setShowDeleteModal(true); };

  const confirmDeleteSubcontractor = async () => {
    if (!subToDelete) return;
    try {
      await Promise.all([
        getDocs(query(collection(db, 'quotes'), where('subcontractorId', '==', subToDelete.uid))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
        getDocs(query(collection(db, 'biddingWorkOrders'), where('subcontractorId', '==', subToDelete.uid))).then(s => Promise.all(s.docs.map(d => deleteDoc(d.ref)))),
      ]);
      await deleteDoc(doc(db, 'subcontractors', subToDelete.uid));
      toast.success('Subcontractor and related data deleted');
      setShowDeleteModal(false);
      setSubToDelete(null);
      fetchSubcontractors();
    } catch (error) {
      toast.error('Failed to delete subcontractor');
    }
  };

  const filteredSubs = subcontractors.filter(sub => {
    const statusMatch = filter === 'all' || sub.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      sub.fullName.toLowerCase().includes(searchLower) ||
      sub.businessName.toLowerCase().includes(searchLower) ||
      sub.email.toLowerCase().includes(searchLower) ||
      sub.phone.toLowerCase().includes(searchLower) ||
      (sub.licenseNumber && sub.licenseNumber.toLowerCase().includes(searchLower)) ||
      (sub.skills && sub.skills.some(s => s.toLowerCase().includes(searchLower)));
    return statusMatch && searchMatch;
  });

  const stats = {
    total: subcontractors.length,
    approved: subcontractors.filter(s => s.status === 'approved').length,
    pending: subcontractors.filter(s => s.status === 'pending').length,
    rejected: subcontractors.filter(s => s.status === 'rejected').length,
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
              <Wrench className="h-7 w-7 text-blue-600" />
              Subcontractors
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage subcontractor registrations and approvals</p>
          </div>
          <Button onClick={handleOpenCreate} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Create Subcontractor
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
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, business, email, skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

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
        {filteredSubs.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <div className="h-14 w-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-7 w-7 text-gray-400" />
            </div>
            <p className="text-gray-900 font-medium">No subcontractors found</p>
            <p className="text-gray-500 text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && filteredSubs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubs.map((sub) => {
              const status = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
              const color = avatarColor(sub.uid);
              return (
                <div key={sub.uid} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className={`h-1 w-full bg-gradient-to-r ${color}`} />

                  <div className="p-5">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                          {getInitials(sub.fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{sub.fullName}</p>
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
                            <Building className="h-3 w-3 flex-shrink-0" />
                            {sub.businessName}
                          </p>
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
                        <span className="truncate">{sub.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span>{sub.phone}</span>
                      </div>
                      {sub.licenseNumber && (
                        <div className="flex items-center gap-2">
                          <Award className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-xs">{sub.licenseNumber}</span>
                        </div>
                      )}
                      {sub.password && (
                        <div className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{sub.password}</span>
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {sub.skills && sub.skills.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-1">
                          {sub.skills.slice(0, 3).map((skill, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">{skill}</span>
                          ))}
                          {sub.skills.length > 3 && (
                            <span className="text-xs text-gray-400">+{sub.skills.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-2">
                      <Button size="sm" variant="secondary" className="w-full gap-2" onClick={() => router.push(`/admin-portal/subcontractors/${sub.uid}`)}>
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => handleResendApprovalEmail(sub.uid)}
                        disabled={resendingEmail === sub.uid}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {resendingEmail === sub.uid ? 'Sending...' : 'Resend Approval Email'}
                      </Button>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleOpenEdit(sub)}>
                          <Edit2 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteSubcontractor(sub)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {sub.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(sub.uid)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => handleReject(sub.uid)}>
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
        {viewMode === 'list' && filteredSubs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Subcontractor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Skills</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-5 py-3 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSubs.map((sub) => {
                  const status = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
                  const color = avatarColor(sub.uid);
                  return (
                    <tr key={sub.uid} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                            {getInitials(sub.fullName)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{sub.fullName}</p>
                            <p className="text-xs text-gray-500">{sub.businessName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <p className="text-gray-700">{sub.email}</p>
                        <p className="text-xs text-gray-500">{sub.phone}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {sub.skills && sub.skills.slice(0, 2).map((skill, i) => (
                            <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded-full">{skill}</span>
                          ))}
                          {sub.skills && sub.skills.length > 2 && (
                            <span className="text-xs text-gray-400">+{sub.skills.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border ${status.className}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => router.push(`/admin-portal/subcontractors/${sub.uid}`)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleOpenEdit(sub)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                            onClick={() => handleResendApprovalEmail(sub.uid)} disabled={resendingEmail === sub.uid}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          {sub.status === 'pending' && (
                            <>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleApprove(sub.uid)}>
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleReject(sub.uid)}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteSubcontractor(sub)}>
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
                    {editingId ? 'Edit Subcontractor' : 'Create New Subcontractor'}
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
                    <Input value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="John Doe" className="mt-1" />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Business Name *</Label>
                    <Input value={formData.businessName} onChange={(e) => setFormData({ ...formData, businessName: e.target.value })} placeholder="ABC Services" className="mt-1" />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Email *</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="abc@gmail.com" disabled={!!editingId} className="mt-1" />
                    {!editingId && <p className="text-xs text-emerald-600 mt-1">An invitation email will be sent to set up password</p>}
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Phone *</Label>
                    <Input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(555) 123-4567" className="mt-1" />
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">License Number</Label>
                    <Input value={formData.licenseNumber} onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })} placeholder="Optional" className="mt-1" />
                  </div>

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

                  {editingId && (
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-700">Password (View Only)</Label>
                      <Input type="text" value={formData.password || ''} readOnly className="mt-1 bg-gray-50 cursor-default font-mono" placeholder="Not set yet" />
                      <p className={`text-xs mt-1 flex items-center gap-1 ${formData.password ? 'text-emerald-600' : 'text-amber-600'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${formData.password ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {formData.password ? 'Password set by subcontractor' : 'Waiting for subcontractor to set password'}
                      </p>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-gray-700">Skills *</Label>
                    <div className="relative mt-1" ref={skillsDropdownRef}>
                      <div
                        className="min-h-[42px] border border-gray-200 rounded-lg px-3 py-2 flex flex-wrap gap-2 items-center bg-white cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500"
                        onClick={() => { setSkillsDropdownOpen(true); skillsInputRef.current?.focus(); }}
                      >
                        {selectedSkills.map((skill) => (
                          <span key={skill} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs">
                            {skill}
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeSkill(skill); }} className="hover:text-blue-900">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <input
                          ref={skillsInputRef}
                          type="text"
                          placeholder={selectedSkills.length === 0 ? 'Type to search skills...' : 'Add more...'}
                          value={skillsSearchQuery}
                          onChange={(e) => { setSkillsSearchQuery(e.target.value); setSkillsDropdownOpen(true); }}
                          onFocus={() => setSkillsDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { setSkillsDropdownOpen(false); skillsInputRef.current?.blur(); }
                            else if (e.key === 'Enter' && filteredCategories.length > 0) {
                              e.preventDefault();
                              toggleSkill(filteredCategories[0].name);
                              setSkillsSearchQuery('');
                            }
                          }}
                          className="flex-1 min-w-[150px] outline-none text-sm bg-transparent"
                          autoComplete="off"
                        />
                        <button type="button" onClick={(e) => { e.stopPropagation(); setSkillsDropdownOpen(!skillsDropdownOpen); }} className="text-gray-400 hover:text-gray-600">
                          <ChevronDown className={`h-4 w-4 transition-transform ${skillsDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {skillsDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-auto">
                          <div className="p-1">
                            {filteredCategories.length === 0 ? (
                              <div className="px-3 py-3 text-sm text-gray-400 text-center">
                                {skillsSearchQuery ? 'No categories found' : 'No more categories available'}
                              </div>
                            ) : (
                              filteredCategories.map((category) => (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleSkill(category.name); setSkillsSearchQuery(''); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg flex items-center justify-between transition-colors"
                                >
                                  {category.name}
                                  {selectedSkills.includes(category.name) && <span className="text-blue-600 text-xs">✓</span>}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <Button className="flex-1 gap-2" onClick={handleSubmit} disabled={submitting}>
                    <Save className="h-4 w-4" />
                    {submitting ? 'Saving...' : editingId ? 'Update Subcontractor' : 'Create Subcontractor'}
                  </Button>
                  <Button variant="outline" onClick={resetForm} disabled={submitting}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && subToDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Trash2 className="h-5 w-5 text-red-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">Delete Subcontractor</h2>
                </div>
                <p className="text-gray-600 text-sm mb-4">
                  Are you sure you want to delete <strong className="text-gray-900">"{subToDelete.fullName}"</strong>?
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-800">
                  <p className="font-medium mb-1">This will also delete:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                    <li>All their quotes</li>
                    <li>All bidding work orders assigned to them</li>
                  </ul>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => { setShowDeleteModal(false); setSubToDelete(null); }} className="flex-1">Cancel</Button>
                  <Button variant="destructive" onClick={confirmDeleteSubcontractor} className="flex-1">Delete Subcontractor</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
