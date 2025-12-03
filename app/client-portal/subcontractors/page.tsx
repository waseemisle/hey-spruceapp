'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { User, Mail, Phone, Building, Award, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

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

export default function ClientSubcontractorsView() {
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

            // Check if user has viewSubcontractors permission
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
  }, [router]);

  const fetchSubcontractors = async () => {
    try {
      // Fetch only approved subcontractors
      const subsQuery = query(
        collection(db, 'subcontractors'),
        where('status', '==', 'approved')
      );
      const snapshot = await getDocs(subsQuery);
      const subsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: doc.id,
        };
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!hasPermission) {
    return (
      <ClientLayout>
        <Card>
          <CardContent className="p-12 text-center">
            <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">You do not have permission to view subcontractors.</p>
            <p className="text-sm text-gray-500 mt-2">Please contact your administrator to request access.</p>
          </CardContent>
        </Card>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subcontractors</h1>
          <p className="text-gray-600 mt-2">View all approved subcontractors</p>
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
                  <CardTitle className="text-lg">{sub.fullName}</CardTitle>
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
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
