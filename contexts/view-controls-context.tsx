'use client';

import { createContext, useContext, useState, useMemo } from 'react';

export type ViewMode = 'grid' | 'list';
export type SortOption = 'createdAt' | 'updatedAt';

interface ViewControlsContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
}

const ViewControlsContext = createContext<ViewControlsContextValue | undefined>(undefined);

export function ViewControlsProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<SortOption>('createdAt');

  const value = useMemo(
    () => ({ viewMode, setViewMode, sortOption, setSortOption }),
    [viewMode, sortOption]
  );

  return (
    <ViewControlsContext.Provider value={value}>
      {children}
    </ViewControlsContext.Provider>
  );
}

export function useViewControls() {
  const context = useContext(ViewControlsContext);
  if (!context) {
    throw new Error('useViewControls must be used within a ViewControlsProvider');
  }
  return context;
}

