'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where, doc, getDoc, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableMultiSelect } from '@/components/ui/searchable-select';
import { User, Mail, Phone, Building, Award, Search, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
import { Users } from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/ui/page-container';
interface Subcontractor {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  skills: string[];
  licenseNumber?: string;
  status: 'pending' | 'approved' | 'rejected';
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

export default function ClientSubcontractorsView() {
  const { auth, db } = useFirebaseInstance();
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasViewPermission, setHasViewPermission] = useState(false);
  const [hasCreatePermission, setHasCreatePermission] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const router = useRouter();

  // Categories drive the Skills picker (same source as admin portal).
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')));
        setCategoryOptions(
          snap.docs.map((d) => ({ value: (d.data() as any).name, label: (d.data() as any).name })),
        );
      } catch (err) {
        console.error('Error fetching categories', err);
      }
    };
    fetchCategories();
  }, [db]);

  useEffect(() => {
    const checkPermissionAndFetchData = async () => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
          if (clientDoc.exists() && clientDoc.data().status === 'approved') {
            const clientData = clientDoc.data();
            const permissions = clientData.permissions || {};

            const canView = !!permissions.viewSubcontractors;
            const canCreate = !!permissions.createSubcontractors;

            setHasViewPermission(canView);
            setHasCreatePermission(canCreate);

            if (canView || canCreate) {
              await fetchSubcontractors();
            } else {
              setLoading(false);
            }
          } else {
            if (!auth.currentUser) router.push('/portal-login');
          }
        } else {
          if (!auth.currentUser) router.push('/portal-login');
        }
      });

      return () => unsubscribe();
    };

    checkPermissionAndFetchData();
  }, [auth, db, router]);

  const handleCreateSubcontractor = async () => {
    if (!createForm.email || !createForm.businessName || !createForm.phone) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          role: 'subcontractor',
          sendInvitation: true,
          userData: {
            fullName: createForm.businessName,
            businessName: createForm.businessName,
            phone: createForm.phone,
            city: createForm.city,
            state: createForm.state,
            licenseNumber: createForm.licenseNumber,
            skills: selectedSkills,
            status: 'pending',
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create subcontractor');
      if (result.emailError) {
        toast.success('Subcontractor created! The invitation email failed to send — an admin can resend it.');
      } else {
        toast.success('Subcontractor created! An invitation email has been sent.');
      }
      setShowCreateModal(false);
      setCreateForm({ email: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' });
      setSelectedSkills([]);
      await fetchSubcontractors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create subcontractor');
    } finally {
      setSubmitting(false);
    }
  };


  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(subsQuery);
      const allSubs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, uid: doc.id };
      }) as Subcontractor[];

      // Apply company-level "Subcontractor State Access". Empty/missing array
      // = ALL allowed (backward compatible). Lookup failure never blocks the page.
      let allowedStates: string[] = [];
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const clientSnap = await getDoc(doc(db, 'clients', currentUser.uid));
          const companyId = clientSnap.data()?.companyId;
          if (companyId) {
            const compSnap = await getDoc(doc(db, 'companies', companyId));
            const list = compSnap.data()?.allowedSubcontractorStates;
            if (Array.isArray(list)) allowedStates = list;
          }
        }
      } catch (err) {
        console.warn('[client subs page] state-permission lookup failed', err);
      }
      const { isSubcontractorAllowedByStates } = await import('@/lib/us-states');
      const subsData = allSubs.filter((s: any) =>
        isSubcontractorAllowedByStates(s.state, allowedStates)
      );
      setSubcontractors(subsData);
    } catch (error) {
      console.error('Error fetching subcontractors:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubcontractors = subcontractors.filter(sub => {
    const searchLower = searchQuery.toLowerCase();
    return !searchQuery ||
      sub.businessName.toLowerCase().includes(searchLower) ||
      (sub.licenseNumber && sub.licenseNumber.toLowerCase().includes(searchLower)) ||
      (sub.skills && sub.skills.some(skill => skill.toLowerCase().includes(searchLower)));
  });

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
        </div>
      </>
    );
  }

  if (!hasViewPermission && !hasCreatePermission) {
    return (
      <>
        <PageContainer>
          <EmptyState
            icon={User}
            title="Access restricted"
            subtitle="You do not have permission to view or create subcontractors. Please contact your administrator to request access."
          />
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Subcontractors"
          subtitle={hasViewPermission ? 'View all approved subcontractors' : 'Create new subcontractors'}
          icon={Users}
          action={hasCreatePermission ? (
            <Button className="gap-2" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Add Subcontractor
            </Button>
          ) : undefined}
        />

        {hasViewPermission && (
          <StatCards
            items={[
              { label: 'Total', value: subcontractors.length, icon: Users, color: 'blue' },
            ]}
          />
        )}

        {hasViewPermission && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by business, license, or skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {hasViewPermission && (
          filteredSubcontractors.length === 0 ? (
            <EmptyState
              icon={User}
              title="No subcontractors found"
              subtitle={searchQuery ? 'Try adjusting your search' : 'No approved subcontractors yet'}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSubcontractors.map((sub) => {
                const color = avatarColor(sub.uid);
                return (
                  <div key={sub.uid} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                    {/* Row 1: avatar + name/business + status badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                          {getInitials(sub.businessName)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{sub.businessName}</p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        Approved
                      </span>
                    </div>
                    {/* Row 2: skills */}
                    {sub.skills && sub.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {sub.skills.slice(0, 3).map((skill, i) => (
                          <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">{skill}</span>
                        ))}
                        {sub.skills.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{sub.skills.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Create Subcontractor Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
            <div className="my-auto flex w-full max-w-xl max-h-[min(92dvh,92vh)] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
              <div className="flex shrink-0 items-start justify-between gap-4 rounded-t-2xl border-b border-border bg-card px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Add Subcontractor</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">An invitation email will be sent to set up their account</p>
                </div>
                <button onClick={() => { setShowCreateModal(false); setCreateForm({ email: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' }); setSelectedSkills([]); }} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input type="email" placeholder="subcontractor@example.com" value={createForm.email} onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))} />
                </div>

                {/* Business Name + Phone */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                      Business Name <span className="text-destructive">*</span>
                    </label>
                    <Input placeholder="Doe Contracting LLC" value={createForm.businessName} onChange={(e) => setCreateForm(prev => ({ ...prev, businessName: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">
                      Phone <span className="text-destructive">*</span>
                    </label>
                    <Input placeholder="(555) 000-0000" value={createForm.phone} onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))} />
                  </div>
                </div>

                {/* City + State */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">City</label>
                    <Input placeholder="New York" value={createForm.city} onChange={(e) => setCreateForm(prev => ({ ...prev, city: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground uppercase tracking-wide">State</label>
                    <Input placeholder="NY" value={createForm.state} onChange={(e) => setCreateForm(prev => ({ ...prev, state: e.target.value }))} />
                  </div>
                </div>

                {/* License + Skills */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">License Number</label>
                  <Input placeholder="Optional" value={createForm.licenseNumber} onChange={(e) => setCreateForm(prev => ({ ...prev, licenseNumber: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground uppercase tracking-wide">Skills</label>
                  <SearchableMultiSelect
                    values={selectedSkills}
                    onValuesChange={setSelectedSkills}
                    options={categoryOptions}
                    placeholder="Type to search or add skills..."
                    addMorePlaceholder="Add more..."
                    emptyMessage="No categories found"
                    noMoreMessage="No more categories available"
                    allowFreeText
                  />
                </div>
              </div>

              <div className="flex shrink-0 gap-3 rounded-b-2xl border-t border-border bg-card px-6 py-4">
                <Button variant="outline" className="flex-1" onClick={() => { setShowCreateModal(false); setCreateForm({ email: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' }); setSelectedSkills([]); }} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSubcontractor} disabled={submitting} className="flex-1">
                  {submitting ? 'Creating…' : 'Create & Send Invite'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}
