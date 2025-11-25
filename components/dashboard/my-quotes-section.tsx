'use client';

import { Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface MyQuotesSectionProps {
  data: {
    pending: number;
    underReview: number;
    accepted: number;
    rejected: number;
    total: number;
  };
}

export default function MyQuotesSection({ data }: MyQuotesSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/subcontractor-portal/quotes"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          My Quotes
          <ExternalLink className="w-4 h-4" />
        </Link>
        <button
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        {/* Total Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Total</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{data.total}</div>
          </div>
        </div>

        {/* Pending Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Pending</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pending}</div>
          </div>
        </div>

        {/* Under Review Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Under Review</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.underReview}</div>
          </div>
        </div>

        {/* Accepted Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Accepted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.accepted}</div>
          </div>
        </div>

        {/* Rejected Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{data.rejected}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

