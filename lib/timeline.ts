import { Timestamp } from 'firebase/firestore';
import { WorkOrderTimelineEvent, QuoteTimelineEvent, QuoteTimelineEventType, InvoiceTimelineEvent, InvoiceTimelineEventType } from '@/types';

export function createTimelineEvent(params: {
  type: WorkOrderTimelineEvent['type'];
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): WorkOrderTimelineEvent {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Timestamp.now(),
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    details: params.details,
    metadata: params.metadata,
  };
}

export function createQuoteTimelineEvent(params: {
  type: QuoteTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): QuoteTimelineEvent {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Timestamp.now(),
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    details: params.details,
    metadata: params.metadata,
  };
}

export function createInvoiceTimelineEvent(params: {
  type: InvoiceTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): InvoiceTimelineEvent {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Timestamp.now(),
    type: params.type,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    details: params.details,
    metadata: params.metadata,
  };
}
