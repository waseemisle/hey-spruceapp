'use client';

import { useEffect, useState, useRef } from 'react';
import { onSnapshot, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import DashboardSearchBar from '@/components/dashboard/dashboard-search-bar';
import WorkOrdersSection from '@/components/dashboard/work-orders-section';
import ProposalsSection from '@/components/dashboard/proposals-section';
import InvoicesSection from '@/components/dashboard/invoices-section';
import AdminCalendar from '@/components/calendar/admin-calendar';
import {
  calculateWorkOrdersData,
  calculateProposalsData,
  calculateInvoicesData,
} from '@/lib/dashboard-utils';
import { Building2, ChevronDown, X } from 'lucide-react';

interface Company {
  id: string;
  name: string;
}

export default function AdminDashboard() {
  const [workOrdersData, setWorkOrdersData] = useState({
    workRequired: {
      total: 0,
      dispatchNotConfirmed: { urgent: 0, total: 0 },
      declinedByProvider: { urgent: 0, total: 0 },
      lateToArrive: { urgent: 0, total: 0 },
    },
    inProgress: {
      total: 0,
      partsOnOrder: { urgent: 0, total: 0 },
      waitingForQuote: { urgent: 0, total: 0 },
      unsatisfactory: 0,
    },
    awaitingAction: {
      total: 0,
      pendingConfirmation: 0,
      actionRequired: 0,
      myActionRequired: 0,
    },
  });

  const [proposalsData, setProposalsData] = useState({
    pendingApproval: { urgent: 0, total: 0 },
    onHold: 0,
    rejected: 0,
    approved: 0,
  });

  const [invoicesData, setInvoicesData] = useState({
    completedNotInvoiced: 0,
    openReviewed: { count: 0, amount: '0.00', mixedCurrency: false },
    onHold: { count: 0, amount: '0.00' },
    rejected: { count: 0, amount: '0.00' },
  });

  const [loading, setLoading] = useState(true);

  // Company selector state
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyClientIds, setCompanyClientIds] = useState<string[]>([]);
  const [companySearch, setCompanySearch] = useState('');
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  // Ref so onSnapshot callbacks always use the latest selectedCompanyId
  const selectedCompanyIdRef = useRef<string | null>(null);
  const isInitialMountRef = useRef(true);

  // Sync ref with state
  useEffect(() => {
    selectedCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

  // Fetch companies on mount (skip when Firebase not initialized)
  useEffect(() => {
    if (!db) return;
    const fetchCompanies = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'companies'));
        const data = snapshot.docs.map(d => ({ id: d.id, name: d.data().name as string }));
        data.sort((a, b) => a.name.localeCompare(b.name));
        setCompanies(data);
      } catch (err) {
        console.error('Error fetching companies:', err);
      }
    };
    fetchCompanies();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(e.target as Node)) {
        setIsCompanyDropdownOpen(false);
        setCompanySearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // When company changes, fetch its client IDs and refresh dashboard data
  useEffect(() => {
    if (!db) return;
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    const refresh = async () => {
      const companyId = selectedCompanyId || undefined;

      // Fetch client IDs for the selected company (for calendar recurring WOs)
      if (selectedCompanyId) {
        try {
          const clientsSnap = await getDocs(
            query(collection(db, 'clients'), where('companyId', '==', selectedCompanyId))
          );
          setCompanyClientIds(clientsSnap.docs.map(d => d.id));
        } catch (err) {
          console.error('Error fetching company clients:', err);
          setCompanyClientIds([]);
        }
      } else {
        setCompanyClientIds([]);
      }

      try {
        const [wod, pd, id] = await Promise.all([
          calculateWorkOrdersData('admin', undefined, undefined, undefined, companyId),
          calculateProposalsData('admin', undefined, undefined, companyId),
          calculateInvoicesData('admin', undefined, undefined, companyId),
        ]);
        setWorkOrdersData(wod);
        setProposalsData(pd);
        setInvoicesData(id);
      } catch (err) {
        console.error('Error refreshing dashboard:', err);
      }
    };

    refresh();
  }, [selectedCompanyId]);

  // Initial fetch + real-time listeners (skip when Firebase not initialized)
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const fetchDashboardData = async () => {
      try {
        const companyId = selectedCompanyIdRef.current || undefined;
        const [workOrders, proposals, invoices] = await Promise.all([
          calculateWorkOrdersData('admin', undefined, undefined, undefined, companyId),
          calculateProposalsData('admin', undefined, undefined, companyId),
          calculateInvoicesData('admin', undefined, undefined, companyId),
        ]);
        setWorkOrdersData(workOrders);
        setProposalsData(proposals);
        setInvoicesData(invoices);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();

    // Set up real-time listeners
    const unsubscribeWorkOrders = onSnapshot(collection(db, 'workOrders'), async () => {
      const companyId = selectedCompanyIdRef.current || undefined;
      const workOrders = await calculateWorkOrdersData('admin', undefined, undefined, undefined, companyId);
      setWorkOrdersData(workOrders);
    });

    const unsubscribeQuotes = onSnapshot(collection(db, 'quotes'), async () => {
      const companyId = selectedCompanyIdRef.current || undefined;
      const proposals = await calculateProposalsData('admin', undefined, undefined, companyId);
      setProposalsData(proposals);
    });

    const unsubscribeInvoices = onSnapshot(collection(db, 'invoices'), async () => {
      const companyId = selectedCompanyIdRef.current || undefined;
      const invoices = await calculateInvoicesData('admin', undefined, undefined, companyId);
      setInvoicesData(invoices);
    });

    return () => {
      unsubscribeWorkOrders();
      unsubscribeQuotes();
      unsubscribeInvoices();
    };
  }, []);

  const handleSearch = (searchType: string, searchValue: string) => {
    console.log('Search:', searchType, searchValue);
  };

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Search Bar */}
        <DashboardSearchBar portalType="admin" onSearch={handleSearch} />

        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* Header + Company Selector */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome to your GroundOps admin portal</p>
            </div>

            {/* Company Selector */}
            <div className="relative" ref={companyDropdownRef}>
              <button
                type="button"
                onClick={() => setIsCompanyDropdownOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-gray-300 transition-colors min-w-[200px]"
              >
                <Building2 className="h-4 w-4 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-700 flex-1 text-left truncate max-w-[200px]">
                  {selectedCompany ? selectedCompany.name : 'All Companies'}
                </span>
                {selectedCompanyId ? (
                  <span
                    role="button"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedCompanyId(null);
                      setIsCompanyDropdownOpen(false);
                      setCompanySearch('');
                    }}
                    className="p-0.5 hover:bg-gray-100 rounded cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                ) : (
                  <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${isCompanyDropdownOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {isCompanyDropdownOpen && (
                <div className="absolute top-full right-0 z-50 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={companySearch}
                      onChange={e => setCompanySearch(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${!selectedCompanyId ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                      onClick={() => {
                        setSelectedCompanyId(null);
                        setIsCompanyDropdownOpen(false);
                        setCompanySearch('');
                      }}
                    >
                      All Companies
                    </button>
                    {filteredCompanies.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">No companies found</p>
                    ) : (
                      filteredCompanies.map(company => (
                        <button
                          key={company.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${selectedCompanyId === company.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                          onClick={() => {
                            setSelectedCompanyId(company.id);
                            setIsCompanyDropdownOpen(false);
                            setCompanySearch('');
                          }}
                        >
                          {company.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active company banner */}
          {selectedCompany && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <Building2 className="h-4 w-4 shrink-0" />
              <span>Showing data for <strong>{selectedCompany.name}</strong></span>
              <button
                type="button"
                onClick={() => setSelectedCompanyId(null)}
                className="ml-auto text-blue-500 hover:text-blue-700 text-xs underline"
              >
                Clear
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading dashboard...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Calendar Section */}
              <AdminCalendar
                companyId={selectedCompanyId || undefined}
                companyClientIds={companyClientIds.length > 0 ? companyClientIds : undefined}
              />

              {/* Work Orders Section */}
              <WorkOrdersSection data={workOrdersData} portalType="admin" />

              {/* Proposals Section */}
              <ProposalsSection data={proposalsData} portalType="admin" />

              {/* Invoices Section */}
              <InvoicesSection data={invoicesData} portalType="admin" />
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
