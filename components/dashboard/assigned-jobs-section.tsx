'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface AssignedJobsSectionProps {
  data: {
    pendingAcceptance: number;
    accepted: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  items?: DashboardRecentItem[];
}

export default function AssignedJobsSection({ data, items = [] }: AssignedJobsSectionProps) {
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href="/subcontractor-portal/assigned"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Assigned Jobs
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-6">
        <Link href="/subcontractor-portal/assigned" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/assigned" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending Acceptance</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pendingAcceptance}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/assigned" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Accepted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.accepted}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/assigned" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">In Progress</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.inProgress}</div>
          </div>
        </Link>
        <Link href="/subcontractor-portal/assigned" className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Completed</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.completed}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No assigned jobs need your attention right now."
        viewAllHref="/subcontractor-portal/assigned"
        viewAllLabel="Open Assigned Jobs"
      />
    </div>
  );
}
