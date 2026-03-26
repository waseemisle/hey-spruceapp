'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Input } from '@/components/ui/input';
import { User, Mail, Phone, Building, Award, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/ui/page-container';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCards } from '@/components/ui/stat-cards';
import { Users } from 'lucide-react';

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
  const [hasPermission, setHasPermission] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkPermissionAndFetchData = async () => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
          if (clientDoc.exists() && clientDoc.data().status === 'approved') {
            const clientData = clientDoc.data();
            const permissions = clientData.permissions || {};

            if (permissions.viewSubcontractors) {
              setHasPermission(true);
              await fetchSubcontractors();
            } else {
              setHasPermission(false);
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

  const fetchSubcontractors = async () => {
    try {
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, uid: doc.id };
      }) as Subcontractor[];
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

  if (!hasPermission) {
    return (
      <ClientLayout>
        <PageContainer>
          <EmptyState
            icon={User}
            title="Access restricted"
            subtitle="You do not have permission to view subcontractors. Please contact your administrator to request access."
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
          subtitle="View all approved subcontractors"
          icon={Users}
        />

        <StatCards
          items={[
            { label: 'Total', value: subcontractors.length, icon: Users, color: 'blue' },
          ]}
        />

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, business, email, phone, license, or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredSubcontractors.length === 0 ? (
          <EmptyState
            icon={User}
            title="No subcontractors found"
            subtitle="Try adjusting your search"
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
        )}
      </PageContainer>
    </ClientLayout>
  );
}
