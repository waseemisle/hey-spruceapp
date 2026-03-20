export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  billing: 'Billing',
  technical: 'Technical',
  'work-order': 'Work Order',
  account: 'Account',
  general: 'General',
  'bug-report': 'Bug Report',
  'feature-request': 'Feature Request',
};

export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In Progress',
  'waiting-on-client': 'Waiting on Client',
  'waiting-on-admin': 'Waiting on Admin',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_TYPE_LABELS: Record<string, string> = {
  question: 'Question',
  problem: 'Problem',
  task: 'Task',
  incident: 'Incident',
};
