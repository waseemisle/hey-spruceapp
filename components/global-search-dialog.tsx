'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  Search, X, ClipboardList, Users, Building2, Receipt,
  FileText, Tag, Wrench, RotateCcw, Package,
  MapPin, Award,
} from 'lucide-react';

interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  href: string;
  Icon: React.ElementType;
  iconColor: string;
  searchText: string;
}

interface CachedData {
  items: SearchResultItem[];
  fetchedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const COLLECTION_CONFIGS = [
  {
    name: 'workOrders',
    category: 'Work Orders',
    Icon: ClipboardList,
    iconColor: 'text-blue-500',
    hrefFn: (id: string) => `/admin-portal/work-orders/${id}`,
    titleFn: (d: any) => d.workOrderNumber || d.title || d.id,
    subtitleFn: (d: any) => [d.status, d.category, d.clientName].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.title, d.workOrderNumber, d.orderNumber, d.description, d.status, d.category, d.clientName, d.clientId, d.assignedTo, d.subcontractorName].filter(Boolean).join(' '),
  },
  {
    name: 'clients',
    category: 'Clients',
    Icon: Users,
    iconColor: 'text-green-500',
    hrefFn: (id: string) => `/admin-portal/clients/${id}`,
    titleFn: (d: any) =>
      d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || d.id,
    subtitleFn: (d: any) => [d.email, d.phone, d.company || d.companyName].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.name, d.firstName, d.lastName, d.email, d.phone, d.company, d.companyName, d.displayName, d.fullName].filter(Boolean).join(' '),
  },
  {
    name: 'subcontractors',
    category: 'Subcontractors',
    Icon: Award,
    iconColor: 'text-orange-500',
    hrefFn: (id: string) => `/admin-portal/subcontractors/${id}`,
    titleFn: (d: any) =>
      d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || d.id,
    subtitleFn: (d: any) => [d.email, d.phone, d.trade, d.specialty].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.name, d.firstName, d.lastName, d.email, d.phone, d.trade, d.specialty, d.company, d.displayName, d.fullName].filter(Boolean).join(' '),
  },
  {
    name: 'invoices',
    category: 'Invoices',
    Icon: Receipt,
    iconColor: 'text-purple-500',
    hrefFn: (id: string) => `/admin-portal/invoices/${id}`,
    titleFn: (d: any) => d.invoiceNumber || d.title || d.id,
    subtitleFn: (d: any) =>
      [d.clientName, d.status, d.totalAmount != null ? `$${d.totalAmount}` : null].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.invoiceNumber, d.title, d.clientName, d.status, d.subcontractorName].filter(Boolean).join(' '),
  },
  {
    name: 'quotes',
    category: 'Quotes',
    Icon: FileText,
    iconColor: 'text-yellow-500',
    hrefFn: (_id: string) => `/admin-portal/quotes`,
    titleFn: (d: any) => d.quoteNumber || d.workOrderTitle || d.id,
    subtitleFn: (d: any) =>
      [d.clientName, d.subcontractorName, d.status].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.workOrderTitle, d.quoteNumber, d.clientName, d.subcontractorName, d.status, d.workOrderNumber].filter(Boolean).join(' '),
  },
  {
    name: 'locations',
    category: 'Locations',
    Icon: MapPin,
    iconColor: 'text-red-500',
    hrefFn: (id: string) => `/admin-portal/locations/${id}`,
    titleFn: (d: any) => d.name || d.address || d.id,
    subtitleFn: (d: any) => [d.address, d.city, d.state].filter(Boolean).join(', '),
    searchFn: (d: any) =>
      [d.id, d.name, d.address, d.city, d.state, d.zip, d.clientName, d.locationName].filter(Boolean).join(' '),
  },
  {
    name: 'subsidiaries',
    category: 'Companies',
    Icon: Building2,
    iconColor: 'text-teal-500',
    hrefFn: (id: string) => `/admin-portal/subsidiaries/${id}`,
    titleFn: (d: any) => d.name || d.id,
    subtitleFn: (d: any) => [d.industry, d.city, d.state].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.name, d.industry, d.city, d.state, d.email, d.phone].filter(Boolean).join(' '),
  },
  {
    name: 'maint_requests',
    category: 'Maintenance Requests',
    Icon: Wrench,
    iconColor: 'text-amber-600',
    hrefFn: (_id: string) => `/admin-portal/maint-requests`,
    titleFn: (d: any) => d.title || d.id,
    subtitleFn: (d: any) => [d.venue, d.requestor, d.status, d.priority].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.title, d.description, d.venue, d.requestor, d.status, d.priority].filter(Boolean).join(' '),
  },
  {
    name: 'recurringWorkOrders',
    category: 'Recurring Work Orders',
    Icon: RotateCcw,
    iconColor: 'text-cyan-500',
    hrefFn: (id: string) => `/admin-portal/recurring-work-orders/${id}`,
    titleFn: (d: any) => d.workOrderNumber || d.title || d.id,
    subtitleFn: (d: any) => [d.status, d.frequency, d.clientName].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.title, d.workOrderNumber, d.status, d.frequency, d.clientName, d.category].filter(Boolean).join(' '),
  },
  {
    name: 'categories',
    category: 'Categories',
    Icon: Tag,
    iconColor: 'text-pink-500',
    hrefFn: (_id: string) => `/admin-portal/categories`,
    titleFn: (d: any) => d.name || d.id,
    subtitleFn: (d: any) => d.description || '',
    searchFn: (d: any) => [d.id, d.name, d.description].filter(Boolean).join(' '),
  },
  {
    name: 'assets',
    category: 'Assets',
    Icon: Package,
    iconColor: 'text-indigo-500',
    hrefFn: (_id: string) => `/admin-portal/assets`,
    titleFn: (d: any) => d.name || d.serialNumber || d.id,
    subtitleFn: (d: any) => [d.type, d.status, d.location].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.name, d.serialNumber, d.type, d.status, d.location, d.description].filter(Boolean).join(' '),
  },
  {
    name: 'rfps',
    category: 'RFPs',
    Icon: FileText,
    iconColor: 'text-violet-500',
    hrefFn: (_id: string) => `/admin-portal/rfps`,
    titleFn: (d: any) => d.title || d.rfpNumber || d.id,
    subtitleFn: (d: any) => [d.status, d.clientName, d.category].filter(Boolean).join(' · '),
    searchFn: (d: any) =>
      [d.id, d.title, d.rfpNumber, d.status, d.clientName, d.description, d.category].filter(Boolean).join(' '),
  },
];

export default function GlobalSearchDialog() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [grouped, setGrouped] = useState<Record<string, SearchResultItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const cacheRef = useRef<CachedData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Keyboard shortcut Cmd+K / Ctrl+K
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

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
      setGrouped({});
    }
  }, [open]);

  const loadData = useCallback(async (): Promise<SearchResultItem[]> => {
    if (cacheRef.current && Date.now() - cacheRef.current.fetchedAt < CACHE_TTL) {
      return cacheRef.current.items;
    }
    setLoading(true);
    const allItems: SearchResultItem[] = [];
    await Promise.allSettled(
      COLLECTION_CONFIGS.map(async (cfg) => {
        try {
          const snap = await getDocs(collection(db, cfg.name));
          snap.forEach((d) => {
            const data = { id: d.id, ...d.data() };
            const searchText = (cfg.searchFn(data) + ' ' + d.id).toLowerCase();
            allItems.push({
              id: d.id,
              title: cfg.titleFn(data) || d.id,
              subtitle: cfg.subtitleFn(data) || undefined,
              category: cfg.category,
              href: cfg.hrefFn(d.id),
              Icon: cfg.Icon,
              iconColor: cfg.iconColor,
              searchText,
            });
          });
        } catch (err) {
          console.error(`[GlobalSearch] Failed to fetch collection "${cfg.name}":`, err);
        }
      })
    );
    if (allItems.length > 0) {
      cacheRef.current = { items: allItems, fetchedAt: Date.now() };
    }
    setLoading(false);
    return allItems;
  }, []);

  // Search effect
  useEffect(() => {
    if (!open) return;
    if (searchQuery.trim().length < 2) {
      setGrouped({});
      return;
    }
    const timer = setTimeout(async () => {
      const items = await loadData();
      const q = searchQuery.trim().toLowerCase();
      const matched = items.filter(
        (item) =>
          item.searchText.includes(q) ||
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q))
      );
      const g: Record<string, SearchResultItem[]> = {};
      for (const item of matched) {
        if (!g[item.category]) g[item.category] = [];
        if (g[item.category].length < 6) g[item.category].push(item);
      }
      setGrouped(g);
      setSelectedIndex(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, open, loadData]);

  // Flat list for keyboard nav
  const flatResults = Object.values(grouped).flat();

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  // Keyboard navigation
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

  const totalResults = flatResults.length;
  const hasResults = totalResults > 0;
  const showEmpty = searchQuery.trim().length >= 2 && !loading && !hasResults;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground text-sm transition-colors min-w-[200px] max-w-xs"
        title="Global Search (Ctrl+K)"
      >
        <Search className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 text-left">Search everything...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] font-mono">
          Ctrl K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-x-0 top-16 z-[70] mx-auto max-w-2xl px-4">
        <div className="bg-card rounded-xl shadow-2xl border border-border overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search work orders, clients, invoices, locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
            />
            {loading && (
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground ml-1"
            >
              <kbd className="text-xs border border-border rounded px-1.5 py-0.5 font-mono">Esc</kbd>
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto">
            {searchQuery.trim().length < 2 && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                Type at least 2 characters to search across all records
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
                  const catStartIndex = flatResults.findIndex(
                    (r) => r.category === category
                  );
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
                            <item.Icon className={`h-4 w-4 flex-shrink-0 ${item.iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {item.title}
                              </div>
                              {item.subtitle && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {item.subtitle}
                                </div>
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
