'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface CompletedJobsSectionProps {
  data: {
    total: number;
    pendingInvoice: number;
    completed: number;
  };
  items?: DashboardRecentItem[];
}

export default function CompletedJobsSection({ data, items = [] }: CompletedJobsSectionProps) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href="/subcontractor-portal/completed-jobs"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          My Completed Jobs
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <Link href="/subcontractor-portal/completed-jobs" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/completed-jobs" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending Invoice</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{data.pendingInvoice}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/completed-jobs" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Completed</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.completed}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No completed jobs yet."
        viewAllHref="/subcontractor-portal/completed-jobs"
        viewAllLabel="Open Completed Jobs"
      />
    </div>
  );
}
