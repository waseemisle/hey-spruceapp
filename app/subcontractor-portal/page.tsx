'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot, Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList, FileText, CheckSquare, DollarSign } from 'lucide-react';
import SubcontractorCalendar from '@/components/calendar/subcontractor-calendar';

export default function SubcontractorDashboard() {
  const [availableJobsCount, setAvailableJobsCount] = useState(0);
  const [submittedQuotesCount, setSubmittedQuotesCount] = useState(0);
  const [assignedJobsCount, setAssignedJobsCount] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch available jobs for bidding
      const biddingQuery = query(
        collection(db, 'biddingWorkOrders'),
        where('subcontractorId', '==', user.uid),
        where('status', '==', 'pending')
      );

      const unsubscribeBidding = onSnapshot(biddingQuery, (snapshot) => {
        setAvailableJobsCount(snapshot.size);
      });

      // Fetch submitted quotes
      const quotesQuery = query(
        collection(db, 'quotes'),
        where('subcontractorId', '==', user.uid),
        where('status', 'in', ['pending', 'sent_to_client'])
      );

      const unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
        setSubmittedQuotesCount(snapshot.size);
      });

      // Fetch assigned jobs
      const assignedQuery = query(
        collection(db, 'assignedJobs'),
        where('subcontractorId', '==', user.uid),
        where('status', 'in', ['pending_acceptance', 'accepted'])
      );

      const unsubscribeAssigned = onSnapshot(assignedQuery, async (snapshot) => {
        setAssignedJobsCount(snapshot.size);

        // Calculate earnings from completed work orders this month
        const workOrderIds = snapshot.docs.map(doc => doc.data().workOrderId);
        if (workOrderIds.length > 0) {
          const workOrdersQuery = query(
            collection(db, 'workOrders'),
            where('__name__', 'in', workOrderIds.slice(0, 10)) // Firestore limit
          );
          const workOrdersSnapshot = await getDocs(workOrdersQuery);
          
          const now = new Date();
          const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          
          let earnings = 0;
          workOrdersSnapshot.docs.forEach(woDoc => {
            const woData = woDoc.data();
            if (woData.status === 'completed' && woData.completedAt) {
              const completedDate = woData.completedAt instanceof Timestamp
                ? woData.completedAt.toDate()
                : new Date(woData.completedAt);
              
              if (completedDate >= firstDayOfMonth) {
                // Get quote amount if available
                const quotesQuery = query(
                  collection(db, 'quotes'),
                  where('workOrderId', '==', woDoc.id),
                  where('subcontractorId', '==', user.uid),
                  where('status', '==', 'accepted')
                );
                getDocs(quotesQuery).then(quotesSnapshot => {
                  if (!quotesSnapshot.empty) {
                    const quoteAmount = quotesSnapshot.docs[0].data().totalAmount || 0;
                    setTotalEarnings(prev => prev + quoteAmount);
                  }
                });
              }
            }
          });
        }
      });

      setLoading(false);

      return () => {
        unsubscribeBidding();
        unsubscribeQuotes();
        unsubscribeAssigned();
      };
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subcontractor Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage your bids and assignments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Available Jobs</CardTitle>
              <ClipboardList className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : availableJobsCount}</div>
              <p className="text-xs text-gray-600">Ready for bidding</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Submitted Quotes</CardTitle>
              <FileText className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : submittedQuotesCount}</div>
              <p className="text-xs text-gray-600">Pending approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Assigned Jobs</CardTitle>
              <CheckSquare className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : assignedJobsCount}</div>
              <p className="text-xs text-gray-600">In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-gray-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : `$${totalEarnings.toLocaleString()}`}</div>
              <p className="text-xs text-gray-600">This month</p>
            </CardContent>
          </Card>
        </div>

        <SubcontractorCalendar />
      </div>
    </SubcontractorLayout>
  );
}
