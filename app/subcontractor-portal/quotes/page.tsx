'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileText, Calendar, DollarSign, CheckCircle, XCircle, Clock, Search } from 'lucide-react';

interface Quote {
  id: string;
  workOrderId: string;
  workOrderNumber?: string;
  workOrderTitle: string;
  clientName: string;
  laborCost: number;
  materialCost: number;
  totalAmount: number;
  clientAmount?: number;
  markupPercent?: number;
  estimatedDuration: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  notes?: string;
  status: string;
  createdAt: any;
  forwardedToClient: boolean;
  forwardedAt?: any;
  acceptedAt?: any;
  rejectedAt?: any;
  rejectionReason?: string;
}

export default function SubcontractorQuotes() {
  const { auth, db } = useFirebaseInstance();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const quotesQuery = query(
          collection(db, 'quotes'),
          where('subcontractorId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

        const unsubscribeSnapshot = onSnapshot(quotesQuery, (snapshot) => {
          const quotesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Quote[];
          setQuotes(quotesData);
          setLoading(false);
        }, (error) => {
          console.error('Quotes listener error:', error);
          setLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [auth, db]);

  const getStatusBadge = (quote: Quote) => {
    if (quote.status === 'accepted') {
      return { style: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Accepted' };
    } else if (quote.status === 'rejected') {
      return { style: 'bg-red-100 text-red-800', icon: XCircle, text: 'Rejected' };
    } else if (quote.forwardedToClient) {
      return { style: 'bg-blue-100 text-blue-800', icon: Clock, text: 'Under Review' };
    } else {
      return { style: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending Admin' };
    }
  };

  const filteredQuotes = quotes.filter(quote => {
    // Filter by status
    let statusMatch = true;
    if (filter === 'pending') statusMatch = quote.status === 'pending' && !quote.forwardedToClient;
    else if (filter === 'review') statusMatch = quote.status === 'pending' && quote.forwardedToClient;
    else if (filter === 'accepted') statusMatch = quote.status === 'accepted';
    else if (filter === 'rejected') statusMatch = quote.status === 'rejected';

    // Filter by search query
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery ||
      quote.workOrderTitle.toLowerCase().includes(searchLower) ||
      quote.clientName.toLowerCase().includes(searchLower) ||
      (quote.notes && quote.notes.toLowerCase().includes(searchLower)) ||
      quote.estimatedDuration.toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const filterOptions = [
    { value: 'all', label: 'All', count: quotes.length },
    { value: 'pending', label: 'Pending Admin', count: quotes.filter(q => q.status === 'pending' && !q.forwardedToClient).length },
    { value: 'review', label: 'Client Review', count: quotes.filter(q => q.status === 'pending' && q.forwardedToClient).length },
    { value: 'accepted', label: 'Accepted', count: quotes.filter(q => q.status === 'accepted').length },
    { value: 'rejected', label: 'Rejected', count: quotes.filter(q => q.status === 'rejected').length },
  ];

  if (loading) {
    return (
      <SubcontractorLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Quotes</h1>
          <p className="text-muted-foreground mt-2">Track your submitted quotes and their status</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes by title, client, or estimated duration..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === option.value
                  ? 'bg-green-600 text-white'
                  : 'bg-card text-foreground border border-gray-300 hover:bg-muted'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {filter === 'all' ? 'No quotes yet' : `No ${filter} quotes`}
              </h3>
              <p className="text-muted-foreground text-center">
                {filter === 'all'
                  ? 'Start submitting quotes for available work orders'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuotes.map((quote) => {
              const statusInfo = getStatusBadge(quote);
              const StatusIcon = statusInfo.icon;

              return (
                <div
                  key={quote.id}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Row 1: title + status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{quote.workOrderTitle}</p>
                      {quote.workOrderNumber && (
                        <p className="text-xs text-muted-foreground">WO: {quote.workOrderNumber}</p>
                      )}
                    </div>
                    <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusInfo.style}`}>
                      <StatusIcon className="h-3 w-3" />
                      {statusInfo.text}
                    </span>
                  </div>

                  {/* Row 2: secondary info */}
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <span className="truncate">Client: {quote.clientName}</span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      <span className="font-semibold text-foreground">${(quote.totalAmount || 0).toFixed(2)}</span>
                      <span className="text-muted-foreground">total</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      Submitted {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                    </span>
                    {quote.estimatedDuration && (
                      <span className="truncate">Duration: {quote.estimatedDuration}</span>
                    )}
                  </div>

                  {/* Cost breakdown */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Labor: <span className="font-semibold text-foreground">${(quote.laborCost || 0).toFixed(2)}</span></span>
                    <span>Materials: <span className="font-semibold text-foreground">${(quote.materialCost || 0).toFixed(2)}</span></span>
                  </div>

                  {quote.forwardedToClient && (
                    <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      Sent to client for approval
                    </div>
                  )}

                  {quote.status === 'rejected' && quote.rejectionReason && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      <span className="font-semibold">Rejected: </span>{quote.rejectionReason}
                    </div>
                  )}

                  {quote.status === 'accepted' && quote.acceptedAt && (
                    <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                      Accepted on {quote.acceptedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                    </div>
                  )}

                  {quote.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{quote.notes}</p>
                  )}

                  {/* Actions row */}
                  <div className="border-t border-border pt-1 mt-auto" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SubcontractorLayout>
  );
}
