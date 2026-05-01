'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface QuotesSectionProps {
  data: {
    pendingApproval: { urgent: number; total: number };
    onHold: number;
    rejected: number;
    approved: number;
  };
  portalType: 'admin' | 'client' | 'subcontractor';
  items?: DashboardRecentItem[];
}

/**
 * Renders the "Quotes" dashboard section. (Filename kept as proposals-section.tsx
 * for compatibility — label was renamed Proposals → Quotes per UX request.)
 */
export default function ProposalsSection({ data, portalType, items = [] }: QuotesSectionProps) {
  const link =
    portalType === 'admin' ? '/admin-portal/quotes' :
    portalType === 'client' ? '/client-portal/quotes' :
    portalType === 'subcontractor' ? '/subcontractor-portal/quotes' : '#';

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href={link}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Quotes
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Pending Approval</h3>
          <div className="text-center">
            <div className="text-2xl font-bold">
              <span className="text-red-600">{data.pendingApproval.urgent}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">{data.pendingApproval.total}</span>
            </div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">On Hold</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.onHold}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.rejected}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Approved</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.approved}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No quotes are awaiting your review."
        viewAllHref={link}
        viewAllLabel="Open Quotes"
      />
    </div>
  );
}
