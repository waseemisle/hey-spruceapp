'use client';

import * as React from 'react';

type AdminPortalHeaderExtraContextValue = {
  headerExtra: React.ReactNode;
  setHeaderExtra: (node: React.ReactNode) => void;
};

export const AdminPortalHeaderExtraContext =
  React.createContext<AdminPortalHeaderExtraContextValue | null>(null);

export function AdminPortalHeaderExtraProvider({ children }: { children: React.ReactNode }) {
  const [headerExtra, setHeaderExtraState] = React.useState<React.ReactNode>(null);
  const setHeaderExtra = React.useCallback((node: React.ReactNode) => {
    setHeaderExtraState(node);
  }, []);
  const value = React.useMemo(
    () => ({ headerExtra, setHeaderExtra }),
    [headerExtra, setHeaderExtra],
  );
  return (
    <AdminPortalHeaderExtraContext.Provider value={value}>{children}</AdminPortalHeaderExtraContext.Provider>
  );
}

export function useAdminPortalHeaderExtra() {
  const ctx = React.useContext(AdminPortalHeaderExtraContext);
  if (!ctx) {
    throw new Error('useAdminPortalHeaderExtra must be used within AdminPortalHeaderExtraProvider');
  }
  return ctx;
}
