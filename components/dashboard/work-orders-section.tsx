'use client';

import { Settings, ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';

interface WorkOrdersSectionProps {
  data: {
    workRequired: {
      total: number;
      dispatchNotConfirmed: { urgent: number; total: number };
      declinedByProvider: { urgent: number; total: number };
      lateToArrive: { urgent: number; total: number };
    };
    inProgress: {
      total: number;
      partsOnOrder: { urgent: number; total: number };
      waitingForQuote: { urgent: number; total: number };
      unsatisfactory: number;
    };
    awaitingAction: {
      total: number;
      pendingConfirmation: number;
      actionRequired: number;
      myActionRequired: number;
    };
  };
  portalType: 'admin' | 'client' | 'subcontractor';
}

export default function WorkOrdersSection({ data, portalType }: WorkOrdersSectionProps) {
  const getWorkOrdersLink = () => {
    switch (portalType) {
      case 'admin':
        return '/admin-portal/work-orders';
      case 'client':
        return '/client-portal/work-orders';
      case 'subcontractor':
        return '/subcontractor-portal/assigned';
      default:
        return '#';
    }
  };

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href={getWorkOrdersLink()}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-semibold text-lg"
        >
          Work Orders
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Work Required Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Work Required</h3>
            <span className="text-2xl font-bold text-foreground">{data.workRequired.total}</span>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Dispatch Not Confirmed</span>
              <span className="text-sm">
                <span className="text-red-600 font-medium">{data.workRequired.dispatchNotConfirmed.urgent}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{data.workRequired.dispatchNotConfirmed.total}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Declined By Provider</span>
              <span className="text-sm">
                <span className="text-red-600 font-medium">{data.workRequired.declinedByProvider.urgent}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{data.workRequired.declinedByProvider.total}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Late to Arrive</span>
              <span className="text-sm">
                <span className="text-red-600 font-medium">{data.workRequired.lateToArrive.urgent}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{data.workRequired.lateToArrive.total}</span>
              </span>
            </div>
          </div>
        </div>

        {/* In Progress Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">In Progress</h3>
            <span className="text-2xl font-bold text-foreground">{data.inProgress.total}</span>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Parts on Order</span>
              <span className="text-sm">
                <span className="text-red-600 font-medium">{data.inProgress.partsOnOrder.urgent}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{data.inProgress.partsOnOrder.total}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Waiting for Quote</span>
              <span className="text-sm">
                <span className="text-red-600 font-medium">{data.inProgress.waitingForQuote.urgent}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{data.inProgress.waitingForQuote.total}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Unsatisfactory</span>
              <span className="text-sm text-foreground font-medium">{data.inProgress.unsatisfactory}</span>
            </div>
          </div>
        </div>

        {/* Awaiting Action Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-foreground">Awaiting Action</h3>
            <span className="text-2xl font-bold text-foreground">{data.awaitingAction.total}</span>
          </div>
          <div className="space-y-2 pl-2 border-l-2 border-border">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pending Confirmation</span>
              <span className="text-sm text-blue-600 font-medium">{data.awaitingAction.pendingConfirmation}</span>
            </div>
            <div className="flex justify-between items-center gap-1">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">Action Required Work Orders</span>
                <Info className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="text-sm text-red-600 font-medium">{data.awaitingAction.actionRequired}</span>
            </div>
            <div className="flex justify-between items-center gap-1">
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">My Action Required Work Orders</span>
                <Info className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="text-sm text-red-600 font-medium">{data.awaitingAction.myActionRequired}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
