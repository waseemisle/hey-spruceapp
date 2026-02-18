'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, User, Calendar, FileText, DollarSign, CheckCircle, TrendingUp } from 'lucide-react';

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
  subcontractorId: string;
  subcontractorName: string;
  subcontractorEmail: string;
  laborCost: number;
  materialCost: number;
  additionalCosts: number;
  discountAmount: number;
  totalAmount: number;
  originalAmount: number;
  clientAmount?: number;
  markupPercentage?: number;
  lineItems: LineItem[];
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  estimatedDuration?: string;
  createdAt: any;
}

interface CompareQuotesDialogProps {
  quotes: Quote[];
  isOpen: boolean;
  onClose: () => void;
}

export default function CompareQuotesDialog({ quotes, isOpen, onClose }: CompareQuotesDialogProps) {
  const [sortBy, setSortBy] = useState<'price' | 'date' | 'subcontractor'>('price');

  if (!isOpen) return null;

  // Sort quotes
  const sortedQuotes = [...quotes].sort((a, b) => {
    switch (sortBy) {
      case 'price':
        return a.totalAmount - b.totalAmount;
      case 'date':
        const aDate = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bDate = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      case 'subcontractor':
        return a.subcontractorName.localeCompare(b.subcontractorName);
      default:
        return 0;
    }
  });

  const lowestPriceQuote = sortedQuotes.length > 0 && sortBy === 'price' ? sortedQuotes[0] : null;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-start justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Compare Quotes</h2>
            <p className="text-gray-600 mt-1">Comparing {quotes.length} quotes for work order</p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'price' | 'date' | 'subcontractor')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="price">Sort by Price</option>
              <option value="date">Sort by Date</option>
              <option value="subcontractor">Sort by Subcontractor</option>
            </select>
            <Button variant="outline" onClick={onClose} size="sm">
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedQuotes.map((quote, index) => {
              const isLowest = lowestPriceQuote?.id === quote.id;

              return (
                <Card
                  key={quote.id}
                  className={`relative ${isLowest ? 'border-green-500 border-2 shadow-lg' : ''}`}
                >
                  {isLowest && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Best Price
                    </div>
                  )}

                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {quote.subcontractorName}
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{quote.subcontractorEmail}</p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Total Amount - Highlight */}
                    <div className="text-center py-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs text-gray-600 mb-1 font-medium">Total Amount</p>
                      <p className="text-3xl font-bold text-blue-600">
                        ${quote.totalAmount.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 capitalize">{quote.status.replace(/_/g, ' ')}</p>
                    </div>

                    {/* Cost Breakdown */}
                    <div className="space-y-2 text-sm border-t pt-3">
                      <p className="font-semibold text-gray-700 mb-2 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Cost Breakdown
                      </p>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Labor Cost:</span>
                        <span className="font-semibold">${quote.laborCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Material Cost:</span>
                        <span className="font-semibold">${quote.materialCost.toLocaleString()}</span>
                      </div>
                      {quote.additionalCosts > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Additional Costs:</span>
                          <span className="font-semibold">${quote.additionalCosts.toLocaleString()}</span>
                        </div>
                      )}
                      {quote.discountAmount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount:</span>
                          <span className="font-semibold">-${quote.discountAmount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Line Items */}
                    {quote.lineItems && quote.lineItems.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Line Items ({quote.lineItems.length})
                        </p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {quote.lineItems.map((item, idx) => (
                            <div key={idx} className="text-xs flex justify-between items-start bg-gray-50 p-2 rounded">
                              <div className="flex-1">
                                <p className="font-medium text-gray-700">{item.description}</p>
                                <p className="text-gray-500">Qty: {item.quantity} × ${item.unitPrice.toLocaleString()}</p>
                              </div>
                              <span className="font-semibold ml-2">${item.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Estimated Duration */}
                    {quote.estimatedDuration && (
                      <div className="flex items-center gap-2 text-xs text-gray-600 border-t pt-3">
                        <Calendar className="h-3 w-3" />
                        <span><strong>Duration:</strong> {quote.estimatedDuration}</span>
                      </div>
                    )}

                    {/* Notes */}
                    {quote.notes && (
                      <div className="border-t pt-3">
                        <p className="text-xs font-semibold text-gray-700 mb-1">Notes</p>
                        <p className="text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">{quote.notes}</p>
                      </div>
                    )}

                    {/* Submitted Date */}
                    <div className="border-t pt-3">
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Submitted: {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    {quote.status === 'accepted' && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                        <div className="flex items-center gap-2 text-green-800 text-xs">
                          <CheckCircle className="h-3 w-3" />
                          <span className="font-semibold">Accepted Quote</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
