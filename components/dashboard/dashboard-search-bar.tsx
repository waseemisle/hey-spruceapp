'use client';

import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';

interface DashboardSearchBarProps {
  portalType: 'admin' | 'client' | 'subcontractor';
  onSearch?: (searchType: string, searchValue: string) => void;
}

export default function DashboardSearchBar({ portalType, onSearch }: DashboardSearchBarProps) {
  const router = useRouter();
  const [searchType, setSearchType] = useState('tracking');
  const [searchValue, setSearchValue] = useState('');

  const searchOptions = [
    { value: 'tracking', label: 'by Tracking #' },
    { value: 'workorder', label: 'by Work Order #' },
    { value: 'quote', label: 'by Quote/Proposal #' },
    { value: 'invoice', label: 'by Invoice #' },
    { value: 'client', label: 'by Client Name' },
    { value: 'subcontractor', label: 'by Subcontractor Name' },
    { value: 'location', label: 'by Location' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchValue.trim()) {
      onSearch(searchType, searchValue.trim());
    }
  };

  const handleCreateButton = () => {
    switch (portalType) {
      case 'admin':
        router.push('/admin-portal/work-orders');
        break;
      case 'client':
        router.push('/client-portal/work-orders?create=1');
        break;
      case 'subcontractor':
        // Subcontractors typically don't create work orders
        break;
    }
  };

  const getCreateButtonLabel = () => {
    switch (portalType) {
      case 'admin':
        return 'Create Work Order';
      case 'client':
        return 'Create Service Request';
      case 'subcontractor':
        return null; // Hide for subcontractors
      default:
        return 'Create Service Request';
    }
  };

  const createButtonLabel = getCreateButtonLabel();

  return (
    <div className="border-b border-border bg-card/80 py-4 px-4 shadow-sm backdrop-blur-sm sm:px-6">
      <form onSubmit={handleSearch} className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <div className="w-full flex-shrink-0 md:w-auto md:min-w-[220px]">
          <SearchableSelect
            value={searchType}
            onValueChange={setSearchType}
            options={searchOptions.map((o) => ({ value: o.value, label: o.label }))}
            placeholder="Search by..."
            aria-label="Search type"
          />
        </div>

        <div className="min-w-0 flex-1">
          <Input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Exact search…"
            className="h-10 w-full rounded-lg"
            aria-label="Search value"
          />
        </div>

        <Button type="submit" className="h-10 shrink-0 gap-2 rounded-lg px-5">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
        </Button>

        {createButtonLabel && (
          <Button type="button" variant="secondary" onClick={handleCreateButton} className="h-10 shrink-0 gap-2 rounded-lg px-5 whitespace-nowrap">
            <Plus className="h-4 w-4" />
            <span>{createButtonLabel}</span>
          </Button>
        )}
      </form>
    </div>
  );
}
