'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, DollarSign, Send } from 'lucide-react';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Quote {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  notes: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  createdAt: any;
}

export default function QuotesManagement() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent_to_client' | 'accepted' | 'rejected'>('all');
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [markupPercent, setMarkupPercent] = useState('20');

  const fetchQuotes = async () => {
    try {
      const quotesQuery = query(collection(db, 'quotes'));
      const snapshot = await getDocs(quotesQuery);
      const quotesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Quote[];
      setQuotes(quotesData);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      alert('Failed to load quotes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  const handleApplyMarkupAndSend = async (quote: Quote, markup: number) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const markupDecimal = markup / 100;
      const clientAmount = quote.totalAmount * (1 + markupDecimal);

      await updateDoc(doc(db, 'quotes', quote.id), {
        markupPercentage: markup,
        clientAmount: clientAmount,
        originalAmount: quote.totalAmount,
        status: 'sent_to_client',
        sentToClientAt: serverTimestamp(),
        sentBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      });

      alert(`Quote forwarded to client with ${markup}% markup`);
      setSelectedQuote(null);
      fetchQuotes();
    } catch (error) {
      console.error('Error sending quote:', error);
      alert('Failed to send quote to client');
    }
  };

  const filteredQuotes = quotes.filter(quote => {
    if (filter === 'all') return true;
    return quote.status === filter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-50';
      case 'sent_to_client': return 'text-blue-600 bg-blue-50';
      case 'accepted': return 'text-green-600 bg-green-50';
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
            <h1 className="text-3xl font-bold text-gray-900">Quotes</h1>
            <p className="text-gray-600 mt-2">Review quotes from subcontractors and forward to clients</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'sent_to_client', 'accepted', 'rejected'].map((filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              onClick={() => setFilter(filterOption as typeof filter)}
              className="capitalize"
              size="sm"
            >
              {filterOption.replace('_', ' ')} ({quotes.filter(q => filterOption === 'all' || q.status === filterOption).length})
            </Button>
          ))}
        </div>

        {/* Quotes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredQuotes.length === 0 ? (
            <Card className="col-span-full">
              <CardContent className="p-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No quotes found</p>
              </CardContent>
            </Card>
          ) : (
            filteredQuotes.map((quote) => (
              <Card key={quote.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{quote.workOrderTitle}</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(quote.status)}`}>
                        {quote.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      WO: {quote.workOrderNumber}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">From:</span> {quote.subcontractorName}</div>
                    <div><span className="font-semibold">Client:</span> {quote.clientName}</div>
                  </div>

                  {/* Cost Breakdown */}
                  <div className="bg-gray-50 p-3 rounded-lg space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Labor Cost:</span>
                      <span className="font-semibold">${quote.laborCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Material Cost:</span>
                      <span className="font-semibold">${quote.materialCost.toLocaleString()}</span>
                    </div>
                    {quote.additionalCosts > 0 && (
                      <div className="flex justify-between">
                        <span>Additional Costs:</span>
                        <span className="font-semibold">${quote.additionalCosts.toLocaleString()}</span>
                      </div>
                    )}
                    {quote.taxAmount > 0 && (
                      <div className="flex justify-between">
                        <span>Tax ({quote.taxRate}%):</span>
                        <span className="font-semibold">${quote.taxAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-300">
                      <span className="font-bold">Subcontractor Total:</span>
                      <span className="font-bold text-lg">${quote.totalAmount.toLocaleString()}</span>
                    </div>
                    {quote.clientAmount && (
                      <>
                        <div className="flex justify-between text-purple-600">
                          <span>Markup ({quote.markupPercentage}%):</span>
                          <span className="font-semibold">
                            ${(quote.clientAmount - quote.totalAmount).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-purple-600 font-bold">
                          <span>Client Amount:</span>
                          <span className="text-lg">${quote.clientAmount.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Line Items */}
                  {quote.lineItems && quote.lineItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-semibold text-sm">Line Items:</div>
                      <div className="space-y-1 text-xs">
                        {quote.lineItems.map((item, index) => (
                          <div key={index} className="flex justify-between text-gray-600">
                            <span>{item.description} ({item.quantity}x)</span>
                            <span>${item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {quote.notes && (
                    <div className="text-sm">
                      <span className="font-semibold">Notes:</span>
                      <p className="text-gray-600 mt-1">{quote.notes}</p>
                    </div>
                  )}

                  {/* Action: Forward to Client with Markup */}
                  {quote.status === 'pending' && (
                    <div className="pt-4 border-t">
                      {selectedQuote?.id === quote.id ? (
                        <div className="space-y-3">
                          <Label>Markup Percentage</Label>
                          <Input
                            type="number"
                            value={markupPercent}
                            onChange={(e) => setMarkupPercent(e.target.value)}
                            placeholder="20"
                            min="0"
                            max="100"
                          />
                          <div className="text-sm text-gray-600">
                            Client will pay: ${(quote.totalAmount * (1 + parseFloat(markupPercent || '0') / 100)).toLocaleString()}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => handleApplyMarkupAndSend(quote, parseFloat(markupPercent))}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Send to Client
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedQuote(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setSelectedQuote(quote);
                            setMarkupPercent('20');
                          }}
                        >
                          <DollarSign className="h-4 w-4 mr-2" />
                          Forward to Client
                        </Button>
                      )}
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
