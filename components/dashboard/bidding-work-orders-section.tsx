'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface BiddingWorkOrdersSectionProps {
  data: {
    pending: number;
    quoteSubmitted: number;
    total: number;
  };
  items?: DashboardRecentItem[];
}

export default function BiddingWorkOrdersSection({ data, items = [] }: BiddingWorkOrdersSectionProps) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href="/subcontractor-portal/bidding"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Bidding Work Orders
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Stat columns — each card links to the bidding list page so users can drill in */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <Link href="/subcontractor-portal/bidding" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/bidding" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pending}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/bidding" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Quote Submitted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.quoteSubmitted}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No bidding requests waiting for your quote."
        viewAllHref="/subcontractor-portal/bidding"
        viewAllLabel="Open Bidding Work Orders"
      />
    </div>
  );
}
