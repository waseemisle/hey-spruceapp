// Status + priority color maps — mirror of web lib/status-utils.ts.
// Mobile returns Tailwind class strings compatible with the tokens in tailwind.config.js.

type ClassPair = { bg: string; text: string };

const STATUS_MAP: Record<string, ClassPair> = {
  pending: { bg: 'bg-status-yellow-bg', text: 'text-status-yellow-fg' },
  approved: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  rejected: { bg: 'bg-status-red-bg', text: 'text-status-red-fg' },
  bidding: { bg: 'bg-status-purple-bg', text: 'text-status-purple-fg' },
  quote_received: { bg: 'bg-status-indigo-bg', text: 'text-status-indigo-fg' },
  quotes_received: { bg: 'bg-status-indigo-bg', text: 'text-status-indigo-fg' },
  to_be_started: { bg: 'bg-status-cyan-bg', text: 'text-status-cyan-fg' },
  assigned: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  'in-progress': { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  pending_invoice: { bg: 'bg-status-cyan-bg', text: 'text-status-cyan-fg' },
  completed: { bg: 'bg-status-green-bg', text: 'text-status-green-fg' },
  archived: { bg: 'bg-muted', text: 'text-muted-foreground' },
  accepted_by_subcontractor: { bg: 'bg-status-teal-bg', text: 'text-status-teal-fg' },
  rejected_by_subcontractor: { bg: 'bg-status-red-bg', text: 'text-status-red-fg' },
  // Invoices
  draft: { bg: 'bg-muted', text: 'text-muted-foreground' },
  sent: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  paid: { bg: 'bg-status-green-bg', text: 'text-status-green-fg' },
  overdue: { bg: 'bg-status-red-bg', text: 'text-status-red-fg' },
  // Quotes
  sent_to_client: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  accepted: { bg: 'bg-status-green-bg', text: 'text-status-green-fg' },
  invoiced: { bg: 'bg-status-indigo-bg', text: 'text-status-indigo-fg' },
  // Generic
  active: { bg: 'bg-status-green-bg', text: 'text-status-green-fg' },
  inactive: { bg: 'bg-muted', text: 'text-muted-foreground' },
  paused: { bg: 'bg-status-yellow-bg', text: 'text-status-yellow-fg' },
  cancelled: { bg: 'bg-status-red-bg', text: 'text-status-red-fg' },
  // Support tickets
  open: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  'waiting-on-client': { bg: 'bg-status-yellow-bg', text: 'text-status-yellow-fg' },
  'waiting-on-admin': { bg: 'bg-status-orange-bg', text: 'text-status-orange-fg' },
  resolved: { bg: 'bg-status-green-bg', text: 'text-status-green-fg' },
  closed: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

const PRIORITY_MAP: Record<string, ClassPair> = {
  low: { bg: 'bg-status-blue-bg', text: 'text-status-blue-fg' },
  medium: { bg: 'bg-status-yellow-bg', text: 'text-status-yellow-fg' },
  high: { bg: 'bg-status-orange-bg', text: 'text-status-orange-fg' },
  urgent: { bg: 'bg-status-red-bg', text: 'text-status-red-fg' },
};

export function getStatusClasses(status?: string): string {
  const p = STATUS_MAP[(status || '').toLowerCase()];
  return p ? `${p.bg} ${p.text}` : 'bg-muted text-muted-foreground';
}

export function getPriorityClasses(priority?: string): string {
  const p = PRIORITY_MAP[(priority || '').toLowerCase()];
  return p ? `${p.bg} ${p.text}` : 'bg-muted text-muted-foreground';
}

export function humanStatus(status?: string): string {
  if (!status) return '';
  return status.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
