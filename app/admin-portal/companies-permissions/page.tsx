'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Building2, Search, Users, CheckCircle2, XCircle, Save, Shield,
  Mail, Phone, ChevronDown, ChevronUp, Eye, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from 'next/navigation';

interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  clientId: string;
  logoUrl?: string;
}

interface Client {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  companyId?: string;
  permissions?: {
    shareForBidding?: boolean;
    viewMaintenanceRequests?: boolean;
    viewMaintenanceRequestsWorkOrders?: boolean;
    approveRejectOrder?: boolean;
    rejectedWorkOrders?: boolean;
    viewSubcontractors?: boolean;
    compareQuotes?: boolean;
    viewRecurringWorkOrders?: boolean;
    viewTimeline?: boolean;
  };
}

type PermKey = keyof NonNullable<Client['permissions']>;

const PERMISSION_DEFS: { key: PermKey; label: string; desc: string }[] = [
  {
    key: 'shareForBidding',
    label: 'Share for Bidding',
    desc: 'Client can share work orders with subcontractors for bidding. Quotes will be shared without markup.',
  },
  {
    key: 'viewMaintenanceRequests',
    label: 'View Maintenance Requests',
    desc: 'Client can view maintenance requests in their portal.',
  },
  {
    key: 'viewMaintenanceRequestsWorkOrders',
    label: 'Maintenance Requests Work Orders',
    desc: 'Client can view maintenance request work orders. Nav will show as "Maintenance Requests Work Orders".',
  },
  {
    key: 'approveRejectOrder',
    label: 'Approve / Reject Order',
    desc: 'Client can approve or reject work orders in their portal.',
  },
  {
    key: 'rejectedWorkOrders',
    label: 'Rejected Work Orders',
    desc: 'Client can view rejected work orders in their portal.',
  },
  {
    key: 'viewSubcontractors',
    label: 'View Subcontractors',
    desc: 'Client can view all subcontractors (read-only).',
  },
  {
    key: 'compareQuotes',
    label: 'Compare Quotes',
    desc: 'Client can compare multiple quotes side-by-side with detailed subcontractor information.',
  },
  {
    key: 'viewRecurringWorkOrders',
    label: 'Recurring Work Orders',
    desc: 'Client can view and edit recurring work orders in their portal.',
  },
  {
    key: 'viewTimeline',
    label: 'View Timeline',
    desc: 'Client can see the Timeline section (creation, approval, activity) on work orders, quotes, and invoices.',
  },
];

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-purple-500 to-purple-700',
  'from-green-500 to-green-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
  'from-teal-500 to-teal-700',
];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function enabledCount(perms: Client['permissions'] = {}): number {
  return PERMISSION_DEFS.filter((p) => perms[p.key]).length;
}

export default function CompaniesPermissions() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientPermissions, setClientPermissions] = useState<Record<string, Client['permissions']>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [companiesSnap, clientsSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'))),
        getDocs(query(collection(db, 'clients'))),
      ]);

      const comps = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Company[];
      const cls = clientsSnap.docs.map((d) => ({
        id: d.id, ...d.data(), permissions: d.data().permissions || {},
      })) as Client[];

      setCompanies(comps);
      setClients(cls);

      const permissionsMap: Record<string, Client['permissions']> = {};
      cls.forEach((client) => {
        permissionsMap[client.id] = {
          shareForBidding: client.permissions?.shareForBidding || false,
          viewMaintenanceRequests: client.permissions?.viewMaintenanceRequests || false,
          viewMaintenanceRequestsWorkOrders: client.permissions?.viewMaintenanceRequestsWorkOrders || false,
          approveRejectOrder: client.permissions?.approveRejectOrder || false,
          rejectedWorkOrders: client.permissions?.rejectedWorkOrders || false,
          viewSubcontractors: client.permissions?.viewSubcontractors || false,
          compareQuotes: client.permissions?.compareQuotes || false,
          viewRecurringWorkOrders: client.permissions?.viewRecurringWorkOrders || false,
          viewTimeline: client.permissions?.viewTimeline || false,
        };
      });
      setClientPermissions(permissionsMap);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handlePermissionChange = (clientId: string, permission: PermKey, value: boolean) => {
    setClientPermissions((prev) => ({
      ...prev,
      [clientId]: { ...prev[clientId], [permission]: value },
    }));
  };

  const handleSavePermissions = async (clientId: string) => {
    setSaving(clientId);
    try {
      await updateDoc(doc(db, 'clients', clientId), {
        permissions: clientPermissions[clientId] || {},
        updatedAt: serverTimestamp(),
      });
      toast.success('Permissions updated');
      fetchAll();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update permissions');
    } finally {
      setSaving(null);
    }
  };

  const getCompanyClients = (companyId: string) => clients.filter((c) => c.companyId === companyId);

  const filtered = companies.filter((c) =>
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-600" />
              Companies Permissions
            </h1>
            <p className="text-gray-500 mt-1">Manage portal access permissions for each company's clients</p>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
            <Lock className="h-4 w-4" />
            <span>{PERMISSION_DEFS.length} permission types</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Company List */}
        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No companies found</p>
            </div>
          ) : (
            filtered.map((company) => {
              const companyClients = getCompanyClients(company.id);
              const isExpanded = expandedCompany === company.id;
              const totalEnabled = companyClients.reduce(
                (sum, cl) => sum + enabledCount(clientPermissions[cl.id] || {}),
                0
              );
              const totalPossible = companyClients.length * PERMISSION_DEFS.length;

              return (
                <div
                  key={company.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Color accent */}
                  <div className={`h-1 w-full bg-gradient-to-r ${avatarColor(company.id)}`} />

                  {/* Company Header */}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {/* Avatar */}
                        {company.logoUrl ? (
                          <img
                            src={company.logoUrl}
                            alt={company.name}
                            className="h-12 w-12 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1 flex-shrink-0"
                          />
                        ) : (
                          <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${avatarColor(company.id)} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}>
                            {getInitials(company.name)}
                          </div>
                        )}

                        {/* Info */}
                        <div className="min-w-0">
                          <h2 className="font-semibold text-gray-900 text-base">{company.name}</h2>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1">
                            {company.email && (
                              <span className="flex items-center gap-1 text-sm text-gray-500">
                                <Mail className="h-3.5 w-3.5" />
                                {company.email}
                              </span>
                            )}
                            {company.phone && (
                              <span className="flex items-center gap-1 text-sm text-gray-500">
                                <Phone className="h-3.5 w-3.5" />
                                {company.phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-sm text-gray-500">
                              <Users className="h-3.5 w-3.5" />
                              {companyClients.length} {companyClients.length === 1 ? 'client' : 'clients'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right side actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Permission summary */}
                        {companyClients.length > 0 && (
                          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            {totalEnabled}/{totalPossible} enabled
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => router.push(`/admin-portal/subsidiaries/${company.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant={isExpanded ? 'default' : 'outline'}
                          className="gap-1.5"
                          onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                        >
                          {isExpanded ? (
                            <><ChevronUp className="h-3.5 w-3.5" /> Collapse</>
                          ) : (
                            <><ChevronDown className="h-3.5 w-3.5" /> Permissions</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Clients + Permissions */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50">
                      {companyClients.length === 0 ? (
                        <div className="py-10 text-center">
                          <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-gray-500 text-sm">No clients associated with this company</p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {companyClients.map((client) => {
                            const permissions = clientPermissions[client.id] || {};
                            const isSaving = saving === client.id;
                            const enabled = enabledCount(permissions);
                            const isClientExpanded = expandedClient === client.id;

                            return (
                              <div
                                key={client.id}
                                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                              >
                                {/* Client Header */}
                                <div
                                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => setExpandedClient(isClientExpanded ? null : client.id)}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                                      {getInitials(client.fullName)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-gray-900 text-sm">{client.fullName}</p>
                                      <p className="text-xs text-gray-500 truncate">{client.email}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* Permission pill */}
                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                                      enabled === 0
                                        ? 'bg-gray-100 text-gray-500'
                                        : enabled === PERMISSION_DEFS.length
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {enabled}/{PERMISSION_DEFS.length}
                                      <span className="hidden sm:inline"> active</span>
                                    </span>
                                    {isClientExpanded
                                      ? <ChevronUp className="h-4 w-4 text-gray-400" />
                                      : <ChevronDown className="h-4 w-4 text-gray-400" />
                                    }
                                  </div>
                                </div>

                                {/* Permission toggles */}
                                {isClientExpanded && (
                                  <div className="border-t border-gray-100 p-4 space-y-0">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                                      {PERMISSION_DEFS.map((perm, idx) => {
                                        const isEnabled = permissions[perm.key] || false;
                                        return (
                                          <div
                                            key={perm.key}
                                            className={`bg-white p-3.5 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                                              idx === PERMISSION_DEFS.length - 1 && PERMISSION_DEFS.length % 2 !== 0
                                                ? 'md:col-span-2'
                                                : ''
                                            }`}
                                          >
                                            <Checkbox
                                              id={`${perm.key}-${client.id}`}
                                              checked={isEnabled}
                                              onCheckedChange={(checked) =>
                                                handlePermissionChange(client.id, perm.key, checked === true)
                                              }
                                              className="mt-0.5"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <Label
                                                htmlFor={`${perm.key}-${client.id}`}
                                                className="font-medium text-sm cursor-pointer text-gray-900"
                                              >
                                                {perm.label}
                                              </Label>
                                              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{perm.desc}</p>
                                            </div>
                                            {isEnabled ? (
                                              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                            ) : (
                                              <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="flex justify-end pt-3">
                                      <Button
                                        size="sm"
                                        onClick={() => handleSavePermissions(client.id)}
                                        disabled={isSaving}
                                        className="gap-1.5"
                                      >
                                        <Save className="h-3.5 w-3.5" />
                                        {isSaving ? 'Saving...' : 'Save Permissions'}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
