'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, User, Mail, Phone, Building, Award } from 'lucide-react';

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
  const { toast } = useToast();

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
      toast({
        title: 'Error',
        description: 'Failed to load subcontractors',
        variant: 'destructive',
      });
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

      toast({
        title: 'Subcontractor Approved',
        description: 'Subcontractor has been approved successfully',
      });

      fetchSubcontractors();
    } catch (error) {
      console.error('Error approving subcontractor:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve subcontractor',
        variant: 'destructive',
      });
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

      toast({
        title: 'Subcontractor Rejected',
        description: 'Subcontractor registration has been rejected',
      });

      fetchSubcontractors();
    } catch (error) {
      console.error('Error rejecting subcontractor:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject subcontractor',
        variant: 'destructive',
      });
    }
  };

  const filteredSubcontractors = subcontractors.filter(sub => {
    if (filter === 'all') return true;
    return sub.status === filter;
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

                  {sub.status === 'pending' && (
                    <div className="flex gap-2 pt-4">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
