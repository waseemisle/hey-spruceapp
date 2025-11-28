'use client';

import { Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface AssignedJobsSectionProps {
  data: {
    pendingAcceptance: number;
    accepted: number;
    inProgress: number;
    completed: number;
    total: number;
  };
}

export default function AssignedJobsSection({ data }: AssignedJobsSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/subcontractor-portal/assigned"
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Assigned Jobs
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

        {/* Pending Acceptance Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Pending Acceptance</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{data.pendingAcceptance}</div>
          </div>
        </div>

        {/* Accepted Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Accepted</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.accepted}</div>
          </div>
        </div>

        {/* In Progress Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">In Progress</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{data.inProgress}</div>
          </div>
        </div>

        {/* Completed Column */}
        <div className="space-y-2">
          <h3 className="font-medium text-gray-700 text-sm">Completed</h3>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.completed}</div>
          </div>
        </div>
      </div>
    </div>
  );
}


