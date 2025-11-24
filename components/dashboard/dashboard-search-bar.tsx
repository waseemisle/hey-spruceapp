'use client';

import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
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
        router.push('/client-portal/work-orders/create');
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
    <div className="bg-white border-b border-gray-200 py-4 px-6">
      <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        {/* Search Type Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {searchOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Exact Search..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Search Button */}
        <button
          type="submit"
          className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>

        {/* Create Button */}
        {createButtonLabel && (
          <button
            type="button"
            onClick={handleCreateButton}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{createButtonLabel}</span>
          </button>
        )}
      </form>
    </div>
  );
}
