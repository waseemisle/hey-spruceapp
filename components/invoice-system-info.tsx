'use client';

import { useState } from 'react';
import { InvoiceTimelineEvent, InvoiceSystemInformation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Clock, FileText, Send, CheckCircle } from 'lucide-react';

interface InvoiceSystemInfoProps {
  timeline?: InvoiceTimelineEvent[];
  systemInformation?: InvoiceSystemInformation;
  /** Shown at top so creation source is always visible */
  creationSourceLabel?: string;
  /** When false, the entire Timeline card is hidden (e.g. client/subcontractor without permission). Default true for admin. */
  canViewTimeline?: boolean;
}

export default function InvoiceSystemInfo({
  timeline,
  systemInformation,
  creationSourceLabel,
  canViewTimeline = true,
}: InvoiceSystemInfoProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!canViewTimeline) return null;

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'sent':
        return <Send className="h-4 w-4 text-purple-600" />;
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
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
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const getEventLabel = (type: string) => {
    const labels: Record<string, string> = {
      created: 'Created',
      sent: 'Sent',
      paid: 'Payment Received',
    };
    return labels[type] || type;
  };

  const formatMetadataKey = (key: string) =>
    key === 'source'
      ? 'Source'
      : key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();

  if (!timeline?.length && !systemInformation && !creationSourceLabel) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Timeline</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
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
          {creationSourceLabel && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-800 mb-0.5">How this invoice was created</p>
              <p className="text-sm text-blue-900">{creationSourceLabel}</p>
            </div>
          )}

          {systemInformation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {systemInformation.createdBy && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Created By</p>
                  <p className="text-sm font-medium text-gray-900">{systemInformation.createdBy.name}</p>
                  <p className="text-xs text-gray-500">{formatTimestamp(systemInformation.createdBy.timestamp)}</p>
                </div>
              )}
              {systemInformation.sentBy && (
                <div className="bg-purple-50 p-3 rounded-lg">
                  <p className="text-xs text-purple-700 mb-1">Sent By</p>
                  <p className="text-sm font-medium text-purple-900">{systemInformation.sentBy.name}</p>
                  <p className="text-xs text-purple-600">{formatTimestamp(systemInformation.sentBy.timestamp)}</p>
                </div>
              )}
              {(systemInformation.paidAt || systemInformation.paidBy) && (
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-xs text-green-700 mb-1">Payment Received</p>
                  <p className="text-sm font-medium text-green-900">
                    {systemInformation.paidBy?.name || 'Payment completed'}
                  </p>
                  <p className="text-xs text-green-600">
                    {formatTimestamp(systemInformation.paidBy?.timestamp || systemInformation.paidAt)}
                  </p>
                </div>
              )}
            </div>
          )}

          {timeline && timeline.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Activity Timeline</h4>
              <div className="space-y-3">
                {timeline.map((event, index) => (
                  <div
                    key={event.id || index}
                    className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="mt-0.5">{getEventIcon(event.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{getEventLabel(event.type)}</p>
                          <p className="text-sm text-gray-600 mt-0.5">
                            {event.details || (event.type === 'created' ? 'Invoice created' : '')}
                          </p>
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                              {Object.entries(event.metadata).map(([key, value]) => {
                                const displayValue =
                                  value != null && value !== ''
                                    ? typeof value === 'object'
                                      ? JSON.stringify(value)
                                      : String(value)
                                    : '—';
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
                          <p className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">by {event.userName}</p>
                        </div>
                      </div>
                    </div>
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
