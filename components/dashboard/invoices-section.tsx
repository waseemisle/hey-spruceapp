'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import DashboardRecentList, { DashboardRecentItem } from './dashboard-recent-list';

interface InvoicesSectionProps {
  data: {
    completedNotInvoiced: number;
    openReviewed: { count: number; amount: string; mixedCurrency: boolean };
    onHold: { count: number; amount: string };
    rejected: { count: number; amount: string };
  };
  portalType: 'admin' | 'client' | 'subcontractor';
  items?: DashboardRecentItem[];
}

export default function InvoicesSection({ data, portalType, items = [] }: InvoicesSectionProps) {
  const link =
    portalType === 'admin' ? '/admin-portal/invoices' :
    portalType === 'client' ? '/client-portal/invoices' :
    portalType === 'subcontractor' ? '/subcontractor-portal/invoices' : '#';

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <Link
          href={link}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Invoices
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Completed Not Invoiced</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.completedNotInvoiced}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Open &amp; Reviewed</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.openReviewed.count}</div>
            {data.openReviewed.mixedCurrency ? (
              <div className="text-xs text-blue-500 mt-1">Mixed Currency</div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">{data.openReviewed.amount}</div>
            )}
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">On Hold</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.onHold.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.onHold.amount}</div>
          </div>
        </Link>
        <Link href={link} className="block rounded-md hover:bg-accent/50 transition-colors p-2 -m-2 space-y-2">
          <h3 className="font-medium text-foreground text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.rejected.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.rejected.amount}</div>
          </div>
        </Link>
      </div>

      <DashboardRecentList
        items={items}
        emptyText="No open invoices right now."
        viewAllHref={link}
        viewAllLabel="Open Invoices"
      />
    </div>
  );
}
