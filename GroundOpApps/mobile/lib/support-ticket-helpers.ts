// Label maps — verbatim from web lib/support-ticket-helpers.ts.

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

export const SUPPORT_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};
