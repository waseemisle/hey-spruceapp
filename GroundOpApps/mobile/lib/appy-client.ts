/**
 * APPY / Maintenance Request work orders are always assigned to this client.
 * Used so the UI and API show the correct client name (e.g. when stored value was overwritten by an edit).
 */
export const APPY_CLIENT_ID = 'UDPSxyTkDIcJijrMCVsb0pcOTpU2';
export const APPY_CLIENT_DISPLAY_NAME = 'Jessica Cabrera-Olimon';
export const APPY_CLIENT_EMAIL = 'jolimon@hwoodgroup.com';

export function getWorkOrderClientDisplayName(workOrder: {
  clientId?: string;
  clientName?: string;
  isMaintenanceRequestOrder?: boolean;
}): string {
  if (
    (workOrder.isMaintenanceRequestOrder || workOrder.clientId === APPY_CLIENT_ID) &&
    workOrder.clientId === APPY_CLIENT_ID
  ) {
    return APPY_CLIENT_DISPLAY_NAME;
  }
  return workOrder.clientName ?? '';
}
