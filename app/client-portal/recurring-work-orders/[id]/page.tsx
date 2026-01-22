'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import ClientLayout from '@/components/client-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, Edit2, Calendar, Clock, RotateCcw, 
  CheckCircle, MapPin, AlertCircle, DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { RecurringWorkOrder } from '@/types';
import { formatAddress } from '@/lib/utils';
import Link from 'next/link';

export default function ClientRecurringWorkOrderDetails() {
  const { auth, db } = useFirebaseInstance();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [recurringWorkOrder, setRecurringWorkOrder] = useState<RecurringWorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

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
            toast.error('You do not have permission to view recurring work orders');
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
            
            setRecurringWorkOrder({
              id: docSnap.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate(),
              nextExecution: data.nextExecution?.toDate(),
              lastExecution: data.lastExecution?.toDate(),
              lastServiced: data.lastServiced?.toDate(),
              nextServiceDates: nextServiceDates,
            } as RecurringWorkOrder);
          } else {
            toast.error('Recurring work order not found');
            router.push('/client-portal/recurring-work-orders');
          }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'cancelled': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-orange-600 bg-orange-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatRecurrencePattern = (rwo: { recurrencePattern?: any; recurrencePatternLabel?: string }) => {
    const label = (rwo as any).recurrencePatternLabel;
    if (label && ['SEMIANNUALLY', 'QUARTERLY', 'MONTHLY', 'BI-WEEKLY'].includes(label)) return label;
    const pattern = rwo.recurrencePattern;
    if (!pattern) return 'Unknown pattern';
    if (pattern.type === 'weekly') return `Every ${pattern.interval} week(s)`;
    if (pattern.type === 'monthly') return `Every ${pattern.interval} month(s)`;
    return 'Unknown pattern';
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
            <p className="text-gray-600">You do not have permission to view this recurring work order</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/client-portal/recurring-work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{recurringWorkOrder.title}</h1>
            {recurringWorkOrder.workOrderNumber && (
              <p className="text-gray-600 mt-1">Work Order: {recurringWorkOrder.workOrderNumber}</p>
            )}
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(recurringWorkOrder.status)}`}>
              {recurringWorkOrder.status.toUpperCase()}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getPriorityColor(recurringWorkOrder.priority)}`}>
              {recurringWorkOrder.priority.toUpperCase()} PRIORITY
            </span>
          </div>
          <Link href={`/client-portal/recurring-work-orders/${recurringWorkOrder.id}/edit`}>
            <Button size="sm">
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Main Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Description</p>
                <p className="text-gray-900">{recurringWorkOrder.description}</p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-1">Category</p>
                <p className="text-gray-900">{recurringWorkOrder.category}</p>
              </div>

              {recurringWorkOrder.locationName && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Location</p>
                    <p className="text-gray-900">{recurringWorkOrder.locationName}</p>
                    {recurringWorkOrder.locationAddress && (
                      <p className="text-sm text-gray-600 mt-1">
                        {formatAddress(recurringWorkOrder.locationAddress)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {recurringWorkOrder.estimateBudget && (
                <div className="flex items-start gap-2">
                  <DollarSign className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Estimate Budget</p>
                    <p className="text-gray-900">${recurringWorkOrder.estimateBudget.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recurrence & Schedule */}
          <Card>
            <CardHeader>
              <CardTitle>Recurrence & Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2">
                <RotateCcw className="h-5 w-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Recurrence Pattern</p>
                  <p className="text-gray-900">{formatRecurrencePattern(recurringWorkOrder)}</p>
                </div>
              </div>

              {recurringWorkOrder.nextExecution && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Next Execution</p>
                    <p className="text-gray-900">
                      {new Date(recurringWorkOrder.nextExecution).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              )}

              {recurringWorkOrder.lastExecution && (
                <div className="flex items-start gap-2">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Last Execution</p>
                    <p className="text-gray-900">
                      {new Date(recurringWorkOrder.lastExecution).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Execution Statistics</p>
                  <p className="text-gray-900">
                    {recurringWorkOrder.successfulExecutions} successful / {recurringWorkOrder.totalExecutions} total
                  </p>
                  {recurringWorkOrder.failedExecutions > 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      {recurringWorkOrder.failedExecutions} failed
                    </p>
                  )}
                </div>
              </div>

              {recurringWorkOrder.invoiceSchedule && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Invoice Schedule</p>
                  <p className="text-gray-900">
                    {recurringWorkOrder.invoiceSchedule.type === 'monthly' 
                      ? `Monthly on day ${recurringWorkOrder.invoiceSchedule.dayOfMonth || 1}`
                      : 'Custom schedule'}
                  </p>
                  {recurringWorkOrder.invoiceSchedule.time && (
                    <p className="text-sm text-gray-600 mt-1">
                      Time: {recurringWorkOrder.invoiceSchedule.time}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {recurringWorkOrder.notes && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 whitespace-pre-wrap">{recurringWorkOrder.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ClientLayout>
  );
}
