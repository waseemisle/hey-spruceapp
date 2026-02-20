'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, AlertTriangle, BarChart2, MoreHorizontal, FileText } from 'lucide-react';

interface Quote {
  id: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  totalAmount: number;
  subcontractorName: string;
  status: string;
}

interface ProposalDecisionEngineProps {
  quote: Quote;
  allQuotes: Quote[];
  onApprove?: () => void;
  onReject?: () => void;
  onMore?: () => void;
  loading?: boolean;
}

export default function ProposalDecisionEngine({
  quote,
  allQuotes,
  onApprove,
  onReject,
  onMore,
  loading,
}: ProposalDecisionEngineProps) {
  const similarProposals = useMemo(() => {
    if (!quote.workOrderId) return [];
    return allQuotes.filter((q) => q.workOrderId === quote.workOrderId && q.id !== quote.id);
  }, [quote, allQuotes]);

  const { benchmarkAmount, recommendation, percentDiff, providerNegativeFeedback, providerCompliance } = useMemo(() => {
    const sameWoQuotes = quote.workOrderId
      ? allQuotes.filter((q) => q.workOrderId === quote.workOrderId && q.id !== quote.id)
      : [];
    const forBenchmark = sameWoQuotes.length >= 1 ? sameWoQuotes : allQuotes.filter((q) => q.id !== quote.id);
    const avg =
      forBenchmark.length === 0
        ? quote.totalAmount
        : forBenchmark.reduce((s, q) => s + (q.totalAmount || 0), 0) / forBenchmark.length;
    const diff = avg === 0 ? 0 : ((quote.totalAmount - avg) / avg) * 100;
    const recommendation: 'approve' | 'reject' = diff <= 15 ? 'approve' : 'reject';
    return {
      benchmarkAmount: Math.round(avg * 100) / 100,
      recommendation,
      percentDiff: Math.round(diff * 10) / 10,
      providerNegativeFeedback: 0,
      providerCompliance: 100,
    };
  }, [quote, allQuotes]);

  const maxBar = Math.max(quote.totalAmount, benchmarkAmount, 1);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart2 className="h-4 w-4" />
          Decision Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="font-medium text-muted-foreground mb-2">Your Cost vs Benchmarked Data</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0">This proposal</span>
              <div className="flex-1 h-6 bg-muted rounded overflow-hidden flex">
                <div
                  className="h-full bg-primary rounded"
                  style={{ width: `${Math.min(100, (quote.totalAmount / maxBar) * 100)}%` }}
                />
              </div>
              <span className="w-20 text-right font-medium">${quote.totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0">Average</span>
              <div className="flex-1 h-6 bg-muted rounded overflow-hidden flex">
                <div
                  className="h-full bg-muted-foreground/50 rounded"
                  style={{ width: `${Math.min(100, (benchmarkAmount / maxBar) * 100)}%` }}
                />
              </div>
              <span className="w-20 text-right text-muted-foreground">${benchmarkAmount.toLocaleString()}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {percentDiff > 0
              ? `${percentDiff}% above average`
              : percentDiff < 0
                ? `${Math.abs(percentDiff)}% below average`
                : 'At average'}
          </p>
        </div>

        <div>
          <p className="font-medium text-muted-foreground mb-1">Service Provider Performance</p>
          <ul className="text-muted-foreground space-y-0.5">
            <li>{providerNegativeFeedback}% Negative Feedback or Recalled</li>
            <li>{providerCompliance}% Provider Compliance</li>
          </ul>
        </div>

        <div className="flex items-center gap-2">
          {recommendation === 'approve' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
              <CheckCircle className="h-3.5 w-3.5" />
              Approval Recommended
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Rejection Recommended
            </span>
          )}
        </div>

        {similarProposals.length > 0 && (
          <div className="pt-2 border-t">
            <p className="font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Similar Work Orders and Proposals
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {similarProposals.slice(0, 5).map((q) => (
                <li key={q.id}>
                  {q.subcontractorName} — ${(q.totalAmount || 0).toLocaleString()} ({q.status})
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t">
          {quote.status === 'pending' && onApprove && (
            <Button size="sm" className="flex-1" onClick={onApprove} disabled={loading}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          )}
          {quote.status === 'pending' && onReject && (
            <Button size="sm" variant="outline" className="flex-1" onClick={onReject} disabled={loading}>
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          )}
          {onMore && (
            <Button size="sm" variant="outline" onClick={onMore} disabled={loading} title="More actions">
              <MoreHorizontal className="h-4 w-4" />
              More
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
