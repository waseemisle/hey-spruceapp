'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, DollarSign, Check, X, Calendar, User } from 'lucide-react';
import { toast } from 'sonner';

interface Quote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
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
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  notes?: string;
  status: 'pending' | 'sent_to_client' | 'accepted' | 'rejected';
  estimatedDuration?: string;
  createdAt: any;
}

interface QuoteComparisonProps {
  quotes: Quote[];
  workOrderId: string;
  onAcceptQuote?: (quoteId: string) => void;
  onRejectQuote?: (quoteId: string) => void;
}

export default function QuoteComparison({ quotes, workOrderId, onAcceptQuote, onRejectQuote }: QuoteComparisonProps) {
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'price' | 'date' | 'subcontractor'>('price');

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

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">No quotes available for comparison</p>
        </CardContent>
      </Card>
    );
  }

  if (quotes.length === 1) {
    const quote = quotes[0];
    return (
      <Card>
        <CardHeader>
          <CardTitle>Single Quote</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-lg">{quote.subcontractorName}</p>
                <p className="text-sm text-gray-600">{quote.subcontractorEmail}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Submitted {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-purple-600">
                  ${quote.totalAmount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 capitalize">{quote.status}</p>
              </div>
            </div>
            
            {quote.lineItems && quote.lineItems.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Line Items</h4>
                <div className="space-y-2">
                  {quote.lineItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{item.description} (Qty: {item.quantity})</span>
                      <span className="font-semibold">${item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {quote.notes && (
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Notes</h4>
                <p className="text-sm text-gray-600">{quote.notes}</p>
              </div>
            )}

            {quote.estimatedDuration && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Estimated Duration: {quote.estimatedDuration}</span>
              </div>
            )}

            {quote.status === 'pending' || quote.status === 'sent_to_client' ? (
              <div className="flex gap-2 pt-4 border-t">
                {onAcceptQuote && (
                  <Button
                    onClick={() => onAcceptQuote(quote.id)}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Accept Quote
                  </Button>
                )}
                {onRejectQuote && (
                  <Button
                    variant="outline"
                    onClick={() => onRejectQuote(quote.id)}
                    className="flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                )}
              </div>
            ) : quote.status === 'accepted' ? (
              <div className="pt-4 border-t">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-800">
                    <Check className="h-4 w-4" />
                    <span className="font-semibold">Quote Accepted</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="pt-4 border-t">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-800">
                    <X className="h-4 w-4" />
                    <span className="font-semibold">Quote Rejected</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Compare {quotes.length} Quotes</h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'price' | 'date' | 'subcontractor')}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="price">Sort by Price</option>
          <option value="date">Sort by Date</option>
          <option value="subcontractor">Sort by Subcontractor</option>
        </select>
      </div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedQuotes.map((quote, index) => {
          const isLowest = index === 0 && sortBy === 'price';
          const isSelected = selectedQuote === quote.id;
          
          return (
            <Card
              key={quote.id}
              className={`relative ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isLowest ? 'border-green-500 border-2' : ''}`}
            >
              {isLowest && sortBy === 'price' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  Best Price
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {quote.subcontractorName}
                    </CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{quote.subcontractorEmail}</p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Total Amount - Highlight */}
                <div className="text-center py-3 bg-purple-50 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-purple-600">
                    ${quote.totalAmount.toLocaleString()}
                  </p>
                </div>

                {/* Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labor Cost:</span>
                    <span className="font-semibold">${quote.laborCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Material Cost:</span>
                    <span className="font-semibold">${quote.materialCost.toLocaleString()}</span>
                  </div>
                  {quote.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount:</span>
                      <span className="font-semibold">-${quote.discountAmount.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Line Items Summary */}
                {quote.lineItems && quote.lineItems.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Line Items ({quote.lineItems.length})</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {quote.lineItems.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="text-xs flex justify-between">
                          <span className="text-gray-600 truncate">{item.description}</span>
                          <span className="font-semibold ml-2">${item.amount.toLocaleString()}</span>
                        </div>
                      ))}
                      {quote.lineItems.length > 3 && (
                        <p className="text-xs text-gray-500">+{quote.lineItems.length - 3} more items</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Estimated Duration */}
                {quote.estimatedDuration && (
                  <div className="flex items-center gap-2 text-xs text-gray-600 border-t pt-3">
                    <Calendar className="h-3 w-3" />
                    <span>{quote.estimatedDuration}</span>
                  </div>
                )}

                {/* Notes Preview */}
                {quote.notes && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-gray-700 mb-1">Notes</p>
                    <p className="text-xs text-gray-600 line-clamp-2">{quote.notes}</p>
                  </div>
                )}

                {/* Submitted Date */}
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500">
                    Submitted {quote.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}
                  </p>
                </div>

                {/* Actions */}
                {quote.status === 'pending' || quote.status === 'sent_to_client' ? (
                  <div className="flex gap-2 pt-3 border-t">
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedQuote(quote.id);
                        if (onAcceptQuote) {
                          onAcceptQuote(quote.id);
                        }
                      }}
                      className="flex-1"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Accept
                    </Button>
                    {onRejectQuote && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRejectQuote(quote.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ) : quote.status === 'accepted' ? (
                  <div className="pt-3 border-t">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                      <div className="flex items-center gap-2 text-green-800 text-xs">
                        <Check className="h-3 w-3" />
                        <span className="font-semibold">Accepted</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                      <div className="flex items-center gap-2 text-red-800 text-xs">
                        <X className="h-3 w-3" />
                        <span className="font-semibold">Rejected</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

