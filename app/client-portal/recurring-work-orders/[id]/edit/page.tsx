'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, getDocs, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, Save, RotateCcw, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder } from '@/types';
import Link from 'next/link';

interface Category {
  id: string;
  name: string;
}

export default function ClientEditRecurringWorkOrder() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    estimateBudget: '',
    notes: '',
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/portal-login');
        return;
      }

      try {
        // Check permission
        const clientDoc = await getDoc(doc(db, 'clients', user.uid));
        if (clientDoc.exists() && clientDoc.data().status === 'approved') {
          const clientData = clientDoc.data();
          const hasRecurringPermission = clientData?.permissions?.viewRecurringWorkOrders === true;
          setHasPermission(hasRecurringPermission);

          if (!hasRecurringPermission) {
            toast.error('You do not have permission to edit recurring work orders');
            router.push('/client-portal');
            return;
          }

          // Fetch recurring work order
          const docRef = doc(db, 'recurringWorkOrders', id);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Check if client has access to this recurring work order
            const assignedLocations = clientData?.assignedLocations || [];
            const isClientOwner = data.clientId === user.uid;
            const hasLocationAccess = assignedLocations.includes(data.locationId);
            
            if (!isClientOwner && !hasLocationAccess) {
              toast.error('You do not have access to this recurring work order');
              router.push('/client-portal/recurring-work-orders');
              return;
            }

            const nextServiceDates = data.nextServiceDates
              ? (Array.isArray(data.nextServiceDates)
                  ? data.nextServiceDates.map((d: any) => {
                      if (d instanceof Date) return d;
                      if (d?.toDate) return d.toDate();
                      return new Date(d);
                    })
                  : [])
              : undefined;
            
            const rwoData = {
              id: docSnap.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate(),
              nextExecution: data.nextExecution?.toDate(),
              lastExecution: data.lastExecution?.toDate(),
              lastServiced: data.lastServiced?.toDate(),
              nextServiceDates: nextServiceDates,
            } as RecurringWorkOrder;

            setRecurringWorkOrder(rwoData);

            // Populate form
            setFormData({
              title: rwoData.title || '',
              description: rwoData.description || '',
              category: rwoData.category || '',
              priority: rwoData.priority || 'medium',
              estimateBudget: rwoData.estimateBudget?.toString() || '',
              notes: rwoData.notes || '',
            });
          } else {
            toast.error('Recurring work order not found');
            router.push('/client-portal/recurring-work-orders');
          }

          // Fetch categories
          const categoriesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
          const categoriesSnapshot = await getDocs(categoriesQuery);
          const categoriesData = categoriesSnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
          })) as Category[];
          setCategories(categoriesData);
        } else {
          router.push('/portal-login');
        }
      } catch (error: any) {
        console.error('Error fetching recurring work order:', error);
        toast.error(error.message || 'Failed to load recurring work order');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db, router, id]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.description || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    try {
      const updateData: any = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        priority: formData.priority,
        estimateBudget: formData.estimateBudget ? parseFloat(formData.estimateBudget) : null,
        notes: formData.notes || null,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'recurringWorkOrders', id), updateData);

      toast.success('Recurring work order updated successfully');
      router.push(`/client-portal/recurring-work-orders/${id}`);
    } catch (error: any) {
      console.error('Error updating recurring work order:', error);
      toast.error(error.message || 'Failed to update recurring work order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  if (!hasPermission || !recurringWorkOrder) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-600">You do not have permission to edit this recurring work order</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/client-portal/recurring-work-orders/${id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Recurring Work Order</h1>
            <p className="text-gray-600 mt-2">Update recurring work order details</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Work Order Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Work Order Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Monthly HVAC Maintenance"
              />
            </div>

            <div>
              <Label>Description *</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full border border-gray-300 rounded-md p-2 min-h-[100px]"
                placeholder="Detailed description of the recurring work..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category *</Label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-md p-2"
                >
                  <option value="">Select category...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Priority *</Label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-md p-2"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Estimate Budget (Optional)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={formData.estimateBudget}
                onChange={(e) => setFormData({ ...formData, estimateBudget: e.target.value })}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="e.g., 5000"
              />
              <p className="text-xs text-gray-500 mt-1">Estimated budget per occurrence in USD</p>
            </div>

            <div>
              <Label>Notes (Optional)</Label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border border-gray-300 rounded-md p-2 min-h-[80px]"
                placeholder="Additional notes about this recurring work order..."
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSubmit}
                loading={submitting} disabled={submitting}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {submitting ? 'Saving...' : 'Save Changes'}
              </Button>
              <Link href={`/client-portal/recurring-work-orders/${id}`} className="flex-1">
                <Button variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientLayout>
  );
}
