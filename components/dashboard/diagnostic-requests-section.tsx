'use client';

import { ExternalLink, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface DiagnosticRequestsSectionProps {
  data: {
    pendingReview: number;
    accepted: number;
    rejected: number;
    total: number;
  };
  items?: DashboardRecentItem[];
}

export default function DiagnosticRequestsSection({ data, items = [] }: DiagnosticRequestsSectionProps) {
  const link = '/client-portal/diagnostic-requests';
  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href={link}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          <Stethoscope className="w-5 h-5" />
          Diagnostic Requests
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.total}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending Review</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pendingReview}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Accepted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.accepted}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.rejected}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No diagnostic requests need your decision."
        viewAllHref={link}
        viewAllLabel="Open Diagnostic Requests"
      />
    </div>
  );
}
