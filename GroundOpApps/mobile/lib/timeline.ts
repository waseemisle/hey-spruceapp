// Timeline event builders — mirror web lib/timeline.ts.
import { Timestamp } from 'firebase/firestore';
import type {
  WorkOrderTimelineEvent,
  QuoteTimelineEvent,
  QuoteTimelineEventType,
  InvoiceTimelineEvent,
  InvoiceTimelineEventType,
} from '@/types';

function id() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createWorkOrderTimelineEvent(params: {
  type: WorkOrderTimelineEvent['type'];
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): WorkOrderTimelineEvent {
  return { id: id(), timestamp: Timestamp.now(), ...params };
}

export function createQuoteTimelineEvent(params: {
  type: QuoteTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): QuoteTimelineEvent {
  return { id: id(), timestamp: Timestamp.now(), ...params };
}

export function createInvoiceTimelineEvent(params: {
  type: InvoiceTimelineEventType;
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}): InvoiceTimelineEvent {
  return { id: id(), timestamp: Timestamp.now(), ...params };
}
