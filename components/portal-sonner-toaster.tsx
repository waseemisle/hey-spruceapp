'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * Single Sonner instance for the whole app (admin, client, and subcontractor
 * portals all render under `app/layout.tsx`). Bottom-right keeps toasts off
 * fixed headers and the top of forms.
 */
export function PortalSonnerToaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      richColors
      closeButton
      offset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        right: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
      mobileOffset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        left: '0.5rem',
        right: '0.5rem',
      }}
    />
  );
}
