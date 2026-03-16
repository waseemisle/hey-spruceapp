'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
}

const CATEGORY_ICONS: Record<string, { Icon: React.ElementType; color: string }> = {
  'Work Orders':           { Icon: ClipboardList, color: 'text-blue-500' },
  'Clients':               { Icon: Users,         color: 'text-green-500' },
  'Subcontractors':        { Icon: Award,         color: 'text-orange-500' },
  'Invoices':              { Icon: Receipt,       color: 'text-purple-500' },
  'Quotes':                { Icon: FileText,      color: 'text-yellow-500' },
  'Locations':             { Icon: MapPin,        color: 'text-red-500' },
  'Companies':             { Icon: Building2,     color: 'text-teal-500' },
  'Recurring Work Orders': { Icon: RotateCcw,     color: 'text-cyan-500' },
  'Maintenance Requests':  { Icon: Wrench,        color: 'text-amber-600' },
  'Categories':            { Icon: Tag,           color: 'text-pink-500' },
  'Assets':                { Icon: Package,       color: 'text-indigo-500' },
  'RFPs':                  { Icon: FileText,      color: 'text-violet-500' },
};

export default function GlobalSearchDialog() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [grouped, setGrouped] = useState<Record<string, SearchResultItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
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
      setLoading(false);
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      });
      const data = await res.json();
      const items: SearchResultItem[] = data.results || [];

      const g: Record<string, SearchResultItem[]> = {};
      for (const item of items) {
        if (!g[item.category]) g[item.category] = [];
        if (g[item.category].length < 20) g[item.category].push(item);
      }
      setGrouped(g);
      setSelectedIndex(0);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('[GlobalSearch]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search effect
  useEffect(() => {
    if (!open) return;
    if (searchQuery.trim().length < 2) {
      setGrouped({});
      return;
    }
    const timer = setTimeout(() => runSearch(searchQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchQuery, open, runSearch]);

  // Flat list for keyboard nav
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
      <div className="fixed inset-x-0 top-24 z-[70] mx-auto max-w-2xl px-4">
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
              <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground ml-1">
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
                  const catStartIndex = flatResults.findIndex((r) => r.category === category);
                  const { Icon, color } = CATEGORY_ICONS[category] || { Icon: Search, color: 'text-gray-500' };
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
