'use client';

import { Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface InvoicesSectionProps {
  data: {
    completedNotInvoiced: number;
    openReviewed: { count: number; amount: string; mixedCurrency: boolean };
    onHold: { count: number; amount: string };
    rejected: { count: number; amount: string };
  };
  portalType: 'admin' | 'client' | 'subcontractor';
}

export default function InvoicesSection({ data, portalType }: InvoicesSectionProps) {
  const getInvoicesLink = () => {
    switch (portalType) {
      case 'admin':
        return '/admin-portal/invoices';
      case 'client':
        return '/client-portal/invoices';
      case 'subcontractor':
        return '/subcontractor-portal/invoices';
      default:
        return '#';
    }
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={getInvoicesLink()}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Invoices
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {/* Completed Not Invoiced Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Completed Not Invoiced</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.completedNotInvoiced}</div>
          </div>
        </div>

        {/* Open & Reviewed Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Open & Reviewed</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.openReviewed.count}</div>
            {data.openReviewed.mixedCurrency ? (
              <div className="text-xs text-blue-500 mt-1">Mixed Currency</div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">{data.openReviewed.amount}</div>
            )}
          </div>
        </div>

        {/* On Hold Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">On Hold</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.onHold.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.onHold.amount}</div>
          </div>
        </div>

        {/* Rejected Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-foreground text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{data.rejected.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{data.rejected.amount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
