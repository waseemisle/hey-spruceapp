'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface MyQuotesSectionProps {
  data: {
    pending: number;
    underReview: number;
    accepted: number;
    rejected: number;
    total: number;
  };
  items?: DashboardRecentItem[];
}

export default function MyQuotesSection({ data, items = [] }: MyQuotesSectionProps) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href="/subcontractor-portal/quotes"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          My Quotes
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-6">
        <Link href="/subcontractor-portal/quotes" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/quotes" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pending}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/quotes" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Under Review</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.underReview}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/quotes" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Accepted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.accepted}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/quotes" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{data.rejected}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="You haven't submitted any quotes yet."
        viewAllHref="/subcontractor-portal/quotes"
        viewAllLabel="Open My Quotes"
      />
    </div>
  );
}
