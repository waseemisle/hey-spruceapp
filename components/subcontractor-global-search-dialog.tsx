'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, ClipboardList, FileText, CheckSquare,
  ClipboardCheck, Headphones,
} from 'lucide-react';
import { collection, getDocs, query, where, Firestore } from 'firebase/firestore';

interface SearchCollectionConfig {
  name: string;
  category: string;
  titleField: string;
  titleFallbacks: string[];
  subtitleFields: string[];
  searchFields: string[];
  hrefFn: (id: string) => string;
  filterField: string;
  filterValue?: string;
  extraFilters?: { field: string; op: 'in' | '=='; value: any }[];
}

const buildCollections = (userId: string): SearchCollectionConfig[] => [
  {
    name: 'biddingWorkOrders',
    category: 'Bidding Work Orders',
    titleField: 'workOrderNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['status', 'category', 'clientName'],
    searchFields: ['workOrderNumber', 'title', 'description', 'status', 'category', 'clientName', 'locationName'],
    hrefFn: () => `/subcontractor-portal/bidding`,
    filterField: 'subcontractorId',
  },
  {
    name: 'quotes',
    category: 'My Quotes',
    titleField: 'quoteNumber',
    titleFallbacks: ['workOrderTitle'],
    subtitleFields: ['clientName', 'status'],
    searchFields: ['quoteNumber', 'workOrderTitle', 'clientName', 'workOrderNumber', 'status'],
    hrefFn: () => `/subcontractor-portal/quotes`,
    filterField: 'subcontractorId',
  },
  {
    name: 'workOrders',
    category: 'Assigned Jobs',
    titleField: 'workOrderNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['status', 'category', 'clientName', 'locationName'],
    searchFields: ['workOrderNumber', 'title', 'description', 'status', 'category', 'clientName', 'locationName'],
    hrefFn: (id: string) => `/subcontractor-portal/assigned/${id}`,
    filterField: 'assignedTo',
    extraFilters: [{ field: 'status', op: 'in', value: ['assigned', 'in_progress', 'on_hold'] }],
  },
  {
    name: 'workOrders',
    category: 'Completed Jobs',
    titleField: 'workOrderNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['category', 'clientName', 'locationName'],
    searchFields: ['workOrderNumber', 'title', 'description', 'category', 'clientName', 'locationName'],
    hrefFn: (id: string) => `/subcontractor-portal/completed-jobs/${id}`,
    filterField: 'assignedTo',
    extraFilters: [{ field: 'status', op: '==', value: 'completed' }],
  },
  {
    name: 'supportTickets',
    category: 'Support Tickets',
    titleField: 'subject',
    titleFallbacks: ['ticketNumber'],
    subtitleFields: ['status', 'priority'],
    searchFields: ['subject', 'ticketNumber', 'description', 'status', 'priority'],
    hrefFn: (id: string) => `/subcontractor-portal/support-tickets/${id}`,
    filterField: 'subcontractorId',
  },
];

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  href: string;
}

const CATEGORY_ICONS: Record<string, { Icon: React.ElementType; color: string }> = {
  'Bidding Work Orders': { Icon: ClipboardList, color: 'text-blue-500' },
  'My Quotes':           { Icon: FileText,      color: 'text-yellow-500' },
  'Assigned Jobs':       { Icon: CheckSquare,   color: 'text-green-500' },
  'Completed Jobs':      { Icon: ClipboardCheck, color: 'text-teal-500' },
  'Support Tickets':     { Icon: Headphones,    color: 'text-purple-500' },
};

interface SubcontractorGlobalSearchDialogProps {
  dbInstance: Firestore;
  userId: string;
}

export default function SubcontractorGlobalSearchDialog({ dbInstance, userId }: SubcontractorGlobalSearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [grouped, setGrouped] = useState<Record<string, SearchResultItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
      setGrouped({});
      setLoading(false);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (!dbInstance || !userId) return;
    setLoading(true);
    try {
      const results: SearchResultItem[] = [];
      const collections = buildCollections(userId);

      await Promise.allSettled(
        collections.map(async (cfg) => {
          try {
            const constraints: any[] = [where(cfg.filterField, '==', userId)];
            if (cfg.extraFilters) {
              for (const ef of cfg.extraFilters) {
                constraints.push(where(ef.field, ef.op as any, ef.value));
              }
            }
            const colQuery = query(collection(dbInstance, cfg.name), ...constraints);
            const snap = await getDocs(colQuery);
            const matched: SearchResultItem[] = [];
            snap.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as any;
              const toStr = (v: unknown): string => {
                if (v == null) return '';
                if (typeof v === 'string') return v;
                if (typeof v === 'number' || typeof v === 'boolean') return String(v);
                return '';
              };

              const searchText = [docSnap.id, ...cfg.searchFields.map((f) => toStr(data[f]))]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              if (!searchText.includes(q.toLowerCase())) return;

              const title =
                toStr(data[cfg.titleField]) ||
                cfg.titleFallbacks.map((f) => toStr(data[f])).find(Boolean) ||
                docSnap.id;
              const subtitle = cfg.subtitleFields.map((f) => toStr(data[f])).filter(Boolean).join(' · ');

              matched.push({
                id: docSnap.id,
                title,
                subtitle: subtitle || undefined,
                category: cfg.category,
                href: cfg.hrefFn(docSnap.id),
              });
            });
            results.push(...matched);
          } catch (err: any) {
            console.error(`[SubSearch] Failed to search "${cfg.name}":`, err?.message || err);
          }
        })
      );

      const g: Record<string, SearchResultItem[]> = {};
      for (const item of results) {
        if (!g[item.category]) g[item.category] = [];
        if (g[item.category].length < 20) g[item.category].push(item);
      }
      setGrouped(g);
      setSelectedIndex(0);
    } catch (err: any) {
      console.error('[SubSearch] Fatal error:', err);
    } finally {
      setLoading(false);
    }
  }, [dbInstance, userId]);

  useEffect(() => {
    if (!open) return;
    if (searchQuery.trim().length < 2) {
      setGrouped({});
      return;
    }
    const timer = setTimeout(() => runSearch(searchQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchQuery, open, runSearch]);

  const flatResults = Object.values(grouped).flat();
  const totalResults = flatResults.length;
  const hasResults = totalResults > 0;
  const showEmpty = searchQuery.trim().length >= 2 && !loading && !hasResults;

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatResults[selectedIndex]) navigate(flatResults[selectedIndex].href);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors min-w-[180px] max-w-xs"
        title="Search (Ctrl+K)"
      >
        <Search className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div className="fixed inset-x-0 top-24 z-[70] mx-auto max-w-2xl px-4">
        <div className="bg-card rounded-xl shadow-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search jobs, quotes, support tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
            />
            {loading && (
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground ml-1">
              <kbd className="text-xs border border-border rounded px-1.5 py-0.5 font-mono">Esc</kbd>
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {searchQuery.trim().length < 2 && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                Type at least 2 characters to search your records
              </div>
            )}

            {showEmpty && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                No results found for &quot;{searchQuery}&quot;
              </div>
            )}

            {hasResults && (
              <div className="py-2">
                {Object.entries(grouped).map(([category, items]) => {
                  const catStartIndex = flatResults.findIndex((r) => r.category === category);
                  const { Icon, color } = CATEGORY_ICONS[category] || { Icon: Search, color: 'text-muted-foreground' };
                  return (
                    <div key={category}>
                      <div className="px-4 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {category}
                      </div>
                      {items.map((item, i) => {
                        const globalIdx = catStartIndex + i;
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <button
                            key={item.id + item.category}
                            onClick={() => navigate(item.href)}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                              isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                            }`}
                          >
                            <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
                              {item.subtitle && (
                                <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground text-right">
                  {totalResults} result{totalResults !== 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
