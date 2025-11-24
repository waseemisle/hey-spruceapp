'use client';

import { Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ProposalsSectionProps {
  data: {
    pendingApproval: { urgent: number; total: number };
    onHold: number;
    rejected: number;
    approved: number;
  };
  portalType: 'admin' | 'client' | 'subcontractor';
}

export default function ProposalsSection({ data, portalType }: ProposalsSectionProps) {
  const getProposalsLink = () => {
    switch (portalType) {
      case 'admin':
        return '/admin-portal/quotes';
      case 'client':
        return '/client-portal/quotes';
      case 'subcontractor':
        return '/subcontractor-portal/quotes';
      default:
        return '#';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={getProposalsLink()}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Proposals
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {/* Pending Approval Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Pending Approval</h3>
          <div className="text-center">
            <div className="text-2xl font-bold">
              <span className="text-red-600">{data.pendingApproval.urgent}</span>
              <span className="text-gray-400">/</span>
              <span className="text-gray-900">{data.pendingApproval.total}</span>
            </div>
          </div>
        </div>

        {/* On Hold Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">On Hold</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{data.onHold}</div>
          </div>
        </div>

        {/* Rejected Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Rejected</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{data.rejected}</div>
          </div>
        </div>

        {/* Approved Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Approved</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.approved}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
