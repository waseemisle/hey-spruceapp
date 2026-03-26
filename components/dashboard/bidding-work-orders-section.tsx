'use client';

import { Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface BiddingWorkOrdersSectionProps {
  data: {
    pending: number;
    quoteSubmitted: number;
    total: number;
  };
}

export default function BiddingWorkOrdersSection({ data }: BiddingWorkOrdersSectionProps) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/subcontractor-portal/bidding"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Bidding Work Orders
          <ExternalLink className="w-4 h-4" />
        </Link>
        <button
          className="text-muted-foreground hover:text-muted-foreground transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {/* Total Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </div>

        {/* Pending Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pending}</div>
          </div>
        </div>

        {/* Quote Submitted Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Quote Submitted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.quoteSubmitted}</div>
          </div>
        </div>
      </div>
    </div>
  );
}



