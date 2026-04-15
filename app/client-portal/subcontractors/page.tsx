'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { User, Mail, Phone, Building, Award, Search, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
import { Users } from 'lucide-react';
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
    email: '', fullName: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '',
  });
  const [skillInput, setSkillInput] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const router = useRouter();

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
            router.push('/portal-login');
          }
        } else {
          router.push('/portal-login');
        }
      });

      return () => unsubscribe();
    };

    checkPermissionAndFetchData();
  }, [auth, db, router]);

  const handleCreateSubcontractor = async () => {
    if (!createForm.email || !createForm.fullName || !createForm.businessName || !createForm.phone) {
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
            fullName: createForm.fullName,
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
      setCreateForm({ email: '', fullName: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' });
      setSelectedSkills([]);
      setSkillInput('');
      await fetchSubcontractors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create subcontractor');
    } finally {
      setSubmitting(false);
    }
  };

  const addSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !selectedSkills.includes(trimmed)) {
      setSelectedSkills(prev => [...prev, trimmed]);
    }
    setSkillInput('');
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
      sub.fullName.toLowerCase().includes(searchLower) ||
      sub.businessName.toLowerCase().includes(searchLower) ||
      sub.email.toLowerCase().includes(searchLower) ||
      sub.phone.toLowerCase().includes(searchLower) ||
      (sub.licenseNumber && sub.licenseNumber.toLowerCase().includes(searchLower)) ||
      (sub.skills && sub.skills.some(skill => skill.toLowerCase().includes(searchLower)));
  });

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </ClientLayout>
    );
  }

  if (!hasViewPermission && !hasCreatePermission) {
    return (
      <ClientLayout>
        <PageContainer>
          <EmptyState
            icon={User}
            title="Access restricted"
            subtitle="You do not have permission to view or create subcontractors. Please contact your administrator to request access."
          />
        </PageContainer>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
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
              placeholder="Search by name, business, email, phone, license, or skills..."
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
                          {getInitials(sub.fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{sub.fullName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub.businessName}</p>
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        Approved
                      </span>
                    </div>
                    {/* Row 2: email */}
                    <div className="flex items-center justify-between text-sm gap-2">
                      <span className="text-muted-foreground truncate">{sub.email}</span>
                      <span className="text-foreground font-medium shrink-0 text-xs">{sub.phone}</span>
                    </div>
                    {/* Row 3: skills */}
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-6 border-b sticky top-0 bg-card z-10 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Add Subcontractor</h2>
                  <Button variant="outline" size="sm" onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({ email: '', fullName: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' });
                    setSelectedSkills([]);
                    setSkillInput('');
                  }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sub-email">Email <span className="text-red-500">*</span></Label>
                  <Input
                    id="sub-email"
                    type="email"
                    placeholder="subcontractor@example.com"
                    value={createForm.email}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-fullName">Full Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="sub-fullName"
                    placeholder="John Doe"
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, fullName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-businessName">Business Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="sub-businessName"
                    placeholder="Doe Contracting LLC"
                    value={createForm.businessName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, businessName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-phone">Phone <span className="text-red-500">*</span></Label>
                  <Input
                    id="sub-phone"
                    placeholder="(555) 000-0000"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-city">City</Label>
                    <Input
                      id="sub-city"
                      placeholder="New York"
                      value={createForm.city}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-state">State</Label>
                    <Input
                      id="sub-state"
                      placeholder="NY"
                      value={createForm.state}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-license">License Number</Label>
                  <Input
                    id="sub-license"
                    placeholder="Optional"
                    value={createForm.licenseNumber}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, licenseNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Skills</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill and press Enter"
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>Add</Button>
                  </div>
                  {selectedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedSkills.map((skill) => (
                        <span key={skill} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">
                          {skill}
                          <button onClick={() => setSelectedSkills(prev => prev.filter(s => s !== skill))} className="hover:text-blue-900">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">An invitation email will be sent to the subcontractor to set up their account. They will be in <strong>pending</strong> status until approved by an admin.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({ email: '', fullName: '', businessName: '', phone: '', city: '', state: '', licenseNumber: '' });
                    setSelectedSkills([]);
                    setSkillInput('');
                  }}>Cancel</Button>
                  <Button onClick={handleCreateSubcontractor} disabled={submitting}>
                    {submitting ? 'Creating...' : 'Create & Send Invite'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </ClientLayout>
  );
}
