/**
 * Shared status/priority color utilities and formatting helpers.
 * Import from here instead of defining locally in each component.
 */

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    // Work order statuses
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    rejected: 'bg-red-100 text-red-800',
    bidding: 'bg-purple-100 text-purple-800',
    quotes_received: 'bg-indigo-100 text-indigo-800',
    to_be_started: 'bg-cyan-100 text-cyan-800',
    assigned: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    accepted_by_subcontractor: 'bg-teal-100 text-teal-800',
    rejected_by_subcontractor: 'bg-red-100 text-red-800',
    // Invoice statuses
    draft: 'bg-gray-100 text-gray-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
    // Quote statuses
    sent_to_client: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    // Maint request statuses
    'in-progress': 'bg-blue-100 text-blue-800',
    // Generic
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return map[status?.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

export function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };
  return map[priority?.toLowerCase()] || 'bg-gray-100 text-gray-800';
}

export function getTimestampValue(value: any): Date | null {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return null;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
