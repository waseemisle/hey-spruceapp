'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import SubcontractorLayout from '@/components/subcontractor-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  taxRate: number;
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </SubcontractorLayout>
    );
  }

  return (
    <SubcontractorLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Quotes</h1>
          <p className="text-gray-600 mt-2">Track your submitted quotes and their status</p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {filter === 'all' ? 'No quotes yet' : `No ${filter} quotes`}
              </h3>
              <p className="text-gray-600 text-center">
                {filter === 'all'
                  ? 'Start submitting quotes for available work orders'
                  : 'Try a different filter'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredQuotes.map((quote) => {
              const statusInfo = getStatusBadge(quote);
              const StatusIcon = statusInfo.icon;

              return (
                <Card key={quote.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl mb-2">{quote.workOrderTitle}</CardTitle>
                        {quote.workOrderNumber && (
                          <p className="text-sm text-gray-600">WO: {quote.workOrderNumber}</p>
                        )}
                        <p className="text-sm text-gray-600">Client: {quote.clientName}</p>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${statusInfo.style}`}>
                        <StatusIcon className="h-4 w-4" />
                        {statusInfo.text}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm text-gray-600">Quote Amount</p>
                          <p className="text-2xl font-bold text-gray-900">
                            ${(quote.totalAmount || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm text-gray-600">Estimated Duration</p>
                        <p className="text-lg font-semibold text-gray-900">{quote.estimatedDuration || 'N/A'}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="text-sm text-gray-600">Submitted</p>
                          <p className="text-sm font-medium text-gray-900">
                            {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Cost Breakdown</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Labor Cost</p>
                          <p className="font-semibold">${(quote.laborCost || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Material Cost</p>
                          <p className="font-semibold">${(quote.materialCost || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Tax ({((quote.taxRate || 0) * 100).toFixed(1)}%)</p>
                          <p className="font-semibold">${(((quote.laborCost || 0) + (quote.materialCost || 0)) * (quote.taxRate || 0)).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Total</p>
                          <p className="font-semibold">${(quote.totalAmount || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    {quote.forwardedToClient && quote.clientAmount && quote.markupPercent && (
                      <div className="border-t pt-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Client Pricing</h4>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Your Quote</p>
                              <p className="font-semibold">${(quote.totalAmount || 0).toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Markup ({(quote.markupPercent || 0).toFixed(1)}%)</p>
                              <p className="font-semibold">${((quote.clientAmount || 0) - (quote.totalAmount || 0)).toFixed(2)}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-600">Client Amount</p>
                              <p className="text-xl font-bold text-blue-600">${(quote.clientAmount || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {quote.lineItems && quote.lineItems.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Line Items</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-700">Description</th>
                                <th className="px-4 py-2 text-center font-semibold text-gray-700">Qty</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-700">Rate</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-700">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {quote.lineItems.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="px-4 py-2">{item.description}</td>
                                  <td className="px-4 py-2 text-center">{item.quantity || 0}</td>
                                  <td className="px-4 py-2 text-right">${(item.rate || 0).toFixed(2)}</td>
                                  <td className="px-4 py-2 text-right font-semibold">${(item.amount || 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {quote.notes && (
                      <div className="border-t pt-4">
                        <h4 className="font-semibold text-gray-900 mb-2">Additional Notes</h4>
                        <p className="text-sm text-gray-700">{quote.notes}</p>
                      </div>
                    )}

                    {quote.status === 'rejected' && quote.rejectionReason && (
                      <div className="border-t pt-4">
                        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                          <h4 className="font-semibold text-red-800 mb-2">Rejection Reason</h4>
                          <p className="text-sm text-red-700">{quote.rejectionReason}</p>
                        </div>
                      </div>
                    )}

                    {quote.status === 'accepted' && quote.acceptedAt && (
                      <div className="border-t pt-4">
                        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="font-semibold text-green-800">Quote Accepted!</p>
                              <p className="text-sm text-green-700">
                                Accepted on {quote.acceptedAt?.toDate?.().toLocaleDateString() || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </SubcontractorLayout>
  );
}
