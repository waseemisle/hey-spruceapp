'use client';

import { useEffect, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2, Search, Users, CheckCircle2, XCircle, Save, Shield,
  Mail, Phone, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
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
    createSubcontractors?: boolean;
    createLocation?: boolean;
    createRecurringWorkOrders?: boolean;
  };
}

type PermKey = keyof NonNullable<Client['permissions']>;

const PERMISSION_DEFS: { key: PermKey; label: string; desc: string }[] = [
  { key: 'shareForBidding', label: 'Share for Bidding', desc: 'Client can share work orders with subcontractors for bidding. Quotes will be shared without markup.' },
  { key: 'viewMaintenanceRequests', label: 'View Maintenance Requests', desc: 'Client can view maintenance requests in their portal.' },
  { key: 'viewMaintenanceRequestsWorkOrders', label: 'Maintenance Request Work Orders', desc: 'Client can view maintenance request work orders. Nav will show as "Maintenance Requests Work Orders".' },
  { key: 'approveRejectOrder', label: 'Approve / Reject Order', desc: 'Client can approve or reject work orders in their portal.' },
  { key: 'rejectedWorkOrders', label: 'Rejected Work Orders', desc: 'Client can view rejected work orders in their portal.' },
  { key: 'viewSubcontractors', label: 'View Subcontractors', desc: 'Client can view all subcontractors (read-only).' },
  { key: 'compareQuotes', label: 'Compare Quotes', desc: 'Client can compare multiple quotes side-by-side with detailed subcontractor information.' },
  { key: 'viewRecurringWorkOrders', label: 'Recurring Work Orders', desc: 'Client can view and edit recurring work orders in their portal.' },
  { key: 'viewTimeline', label: 'View Timeline', desc: 'Client can see the Timeline section on work orders, quotes, and invoices.' },
  { key: 'createSubcontractors', label: 'Create Subcontractors', desc: 'Client can create new subcontractors and send them an invitation to join the platform.' },
  { key: 'createLocation', label: 'Create Location', desc: 'Client can add new property locations to their company.' },
  { key: 'createRecurringWorkOrders', label: 'Create Recurring Work Orders', desc: 'Client can create new recurring work orders for their locations.' },
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
          createSubcontractors: client.permissions?.createSubcontractors || false,
          createLocation: client.permissions?.createLocation || false,
          createRecurringWorkOrders: client.permissions?.createRecurringWorkOrders || false,
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

  const totalClients = clients.length;
  const totalEnabled = clients.reduce((sum, cl) => sum + enabledCount(clientPermissions[cl.id] || {}), 0);
  const totalPossible = totalClients * PERMISSION_DEFS.length;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-7 w-7 text-blue-600" />
              Companies Permissions
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage portal access permissions for each company's clients</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Companies', value: companies.length, icon: Building2, color: 'text-blue-600 bg-blue-50 border-blue-100' },
            { label: 'Clients', value: totalClients, icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-100' },
            { label: 'Permission Types', value: PERMISSION_DEFS.length, icon: Shield, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
            {
              label: 'Permissions Enabled',
              value: totalPossible > 0 ? `${totalEnabled}/${totalPossible}` : '0',
              icon: CheckCircle2,
              color: 'text-amber-600 bg-amber-50 border-amber-100',
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-xl border p-4 flex items-center gap-3 ${color}`}>
              <Icon className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-xl font-bold leading-none">{value}</p>
                <p className="text-xs mt-0.5 opacity-75">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Company List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-card rounded-xl border border-border shadow-sm p-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No companies found</p>
            </div>
          ) : (
            filtered.map((company) => {
              const companyClients = getCompanyClients(company.id);
              const isExpanded = expandedCompany === company.id;

              return (
                <div key={company.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">

                  {/* Company Row */}
                  <div className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {company.logoUrl ? (
                        <img
                          src={company.logoUrl}
                          alt={company.name}
                          className="h-10 w-10 object-contain rounded-lg border border-border bg-muted p-1 flex-shrink-0"
                        />
                      ) : (
                        <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${avatarColor(company.id)} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                          {getInitials(company.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm">{company.name}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          {company.email && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />{company.email}
                            </span>
                          )}
                          {company.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />{company.phone}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {companyClients.length} {companyClients.length === 1 ? 'client' : 'clients'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => router.push(`/admin-portal/subsidiaries/${company.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant={isExpanded ? 'default' : 'outline'}
                        className="gap-1.5 h-8 text-xs"
                        onClick={() => setExpandedCompany(isExpanded ? null : company.id)}
                      >
                        {isExpanded ? (
                          <><ChevronUp className="h-3.5 w-3.5" />Collapse</>
                        ) : (
                          <><ChevronDown className="h-3.5 w-3.5" />Permissions</>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded: Clients */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/40">
                      {companyClients.length === 0 ? (
                        <div className="py-10 text-center">
                          <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No clients associated with this company</p>
                        </div>
                      ) : (
                        <div className="p-4 space-y-2">
                          {companyClients.map((client) => {
                            const permissions = clientPermissions[client.id] || {};
                            const isSaving = saving === client.id;
                            const enabled = enabledCount(permissions);
                            const isClientExpanded = expandedClient === client.id;

                            return (
                              <div key={client.id} className="bg-card rounded-lg border border-border overflow-hidden">

                                {/* Client row */}
                                <div
                                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors"
                                  onClick={() => setExpandedClient(isClientExpanded ? null : client.id)}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                                      {getInitials(client.fullName)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-foreground text-sm">{client.fullName}</p>
                                      <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      enabled === 0
                                        ? 'bg-muted text-muted-foreground'
                                        : enabled === PERMISSION_DEFS.length
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                                    }`}>
                                      {enabled}/{PERMISSION_DEFS.length}
                                      <span className="hidden sm:inline"> active</span>
                                    </span>
                                    {isClientExpanded
                                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    }
                                  </div>
                                </div>

                                {/* Permission toggles */}
                                {isClientExpanded && (
                                  <div className="border-t border-border p-4 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden border border-border">
                                      {PERMISSION_DEFS.map((perm, idx) => {
                                        const isEnabled = permissions[perm.key] || false;
                                        return (
                                          <div
                                            key={perm.key}
                                            className={`bg-card p-3.5 flex items-start gap-3 hover:bg-muted/50 transition-colors ${
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
                                                className="font-medium text-sm cursor-pointer text-foreground"
                                              >
                                                {perm.label}
                                              </Label>
                                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{perm.desc}</p>
                                            </div>
                                            {isEnabled
                                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                              : <XCircle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 mt-0.5" />
                                            }
                                          </div>
                                        );
                                      })}
                                    </div>

                                    <div className="flex justify-end">
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
