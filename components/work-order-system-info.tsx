'use client';

import { useState } from 'react';
import { WorkOrderTimelineEvent, WorkOrderSystemInformation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Clock, User, CheckCircle, XCircle, Share2, FileText, Calendar, DollarSign } from 'lucide-react';

const ADMIN_ONLY_EVENTS = ['shared_for_bidding', 'quote_received'];

interface WorkOrderSystemInfoProps {
  timeline?: WorkOrderTimelineEvent[];
  systemInformation?: WorkOrderSystemInformation;
  viewerRole?: 'admin' | 'client' | 'subcontractor';
  /** Shown at top of Timeline so creation source is always visible */
  creationSourceLabel?: string;
  /** When false, the entire Timeline card is hidden (e.g. client/subcontractor without permission). Default true for admin. */
  canViewTimeline?: boolean;
}

export default function WorkOrderSystemInfo({ timeline, systemInformation, viewerRole = 'admin', creationSourceLabel, canViewTimeline = true }: WorkOrderSystemInfoProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!canViewTimeline) return null;

  const visibleTimeline = viewerRole === 'client'
    ? timeline?.filter(e => !ADMIN_ONLY_EVENTS.includes(e.type))
    : timeline;

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'shared_for_bidding':
        return <Share2 className="h-4 w-4 text-purple-600" />;
      case 'quote_received':
        return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'quote_shared_with_client':
      case 'quote_approved_by_client':
      case 'quote_rejected_by_client':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'assigned':
        return <User className="h-4 w-4 text-indigo-600" />;
      case 'schedule_set':
      case 'schedule_shared':
        return <Calendar className="h-4 w-4 text-orange-600" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'invoice_sent':
      case 'payment_received':
        return <DollarSign className="h-4 w-4 text-green-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'N/A';

    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      created: 'Created',
      approved: 'Approved',
      rejected: 'Rejected',
      shared_for_bidding: 'Shared for Bidding',
      quote_received: 'Quote Received',
      quote_shared_with_client: 'Quote Shared with Client',
      quote_approved_by_client: 'Quote Approved by Client',
      quote_rejected_by_client: 'Quote Rejected by Client',
      assigned: 'Assigned to Subcontractor',
      schedule_set: 'Schedule Set',
      schedule_shared: 'Schedule Shared with Client',
      started: 'Work Started',
      completed: 'Work Completed',
      invoice_sent: 'Invoice Sent',
      payment_received: 'Payment Received',
    };
    return labels[type] || type;
  };

  const metadataLabelMap: Record<string, string> = {
    source: 'Source',
    workOrderNumber: 'Work Order Number',
    priority: 'Priority',
    clientName: 'Client',
    locationName: 'Location',
  };

  const formatMetadataKey = (key: string) => metadataLabelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();

  if (!visibleTimeline?.length && !systemInformation) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Timeline</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Expand
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* How work order was created - always visible */}
          {creationSourceLabel && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-800 mb-0.5">How this work order was created</p>
              <p className="text-sm text-blue-900">{creationSourceLabel}</p>
            </div>
          )}
          {/* System Information Summary */}
          {systemInformation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemInformation.createdBy && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Created By</p>
                  <p className="text-sm font-medium text-gray-900">{systemInformation.createdBy.name}</p>
                  <p className="text-xs text-gray-500">{formatTimestamp(systemInformation.createdBy.timestamp)}</p>
                </div>
              )}

              {systemInformation.approvedBy && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-700 mb-1">Approved By</p>
                  <p className="text-sm font-medium text-green-900">{systemInformation.approvedBy.name}</p>
                  <p className="text-xs text-green-600">{formatTimestamp(systemInformation.approvedBy.timestamp)}</p>
                </div>
              )}

              {systemInformation.assignment && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-xs text-blue-700 mb-1">Assigned To</p>
                  <p className="text-sm font-medium text-blue-900">{systemInformation.assignment.subcontractorName}</p>
                  <p className="text-xs text-blue-600">
                    by {systemInformation.assignment.assignedBy.name} on {formatTimestamp(systemInformation.assignment.timestamp)}
                  </p>
                </div>
              )}

              {systemInformation.completion && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-700 mb-1">Completed By</p>
                  <p className="text-sm font-medium text-green-900">{systemInformation.completion.completedBy.name}</p>
                  <p className="text-xs text-green-600">{formatTimestamp(systemInformation.completion.timestamp)}</p>
                </div>
              )}
            </div>
          )}

          {/* Timeline Events */}
          {visibleTimeline && visibleTimeline.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Activity Timeline</h4>
              <div className="space-y-3">
                {visibleTimeline.map((event, index) => (
                  <div key={event.id || index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
                    <div className="mt-0.5">
                      {getEventIcon(event.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {getEventLabel(event.type)}
                          </p>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {event.details || (event.type === 'created' ? 'Work order created' : '')}
                          </p>
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                              {Object.entries(event.metadata).map(([key, value]) => {
                                const displayValue = value != null && value !== '' ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : '—';
                                return (
                                  <span key={key} className="inline text-gray-600">
                                    <span className="font-medium text-gray-500">{formatMetadataKey(key)}:</span>{' '}
                                    <span className="text-gray-700">{displayValue}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-gray-500">
                            {formatTimestamp(event.timestamp)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            by {event.userName}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quotes Received Summary - hidden for clients */}
          {viewerRole !== 'client' && systemInformation?.quotesReceived && systemInformation.quotesReceived.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Quotes Received ({systemInformation.quotesReceived.length})</h4>
              <div className="space-y-2">
                {systemInformation.quotesReceived.map((quote, index) => (
                  <div key={quote.quoteId || index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{quote.subcontractorName}</p>
                      <p className="text-xs text-gray-500">{formatTimestamp(quote.timestamp)}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">${quote.amount.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
