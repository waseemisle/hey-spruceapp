'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, query, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { StatCards } from '@/components/ui/stat-cards';
import {
  Building2, Search, Users, CheckCircle2, XCircle, Save, Shield,
  Mail, Phone, ChevronDown, ChevronUp, ChevronRight, Eye, MapPin, Receipt,
  MailPlus, Settings, Sparkles, ArrowLeft, Globe2, Clock, UserCheck,
  PlusCircle, GitBranch, Tag, Workflow, RotateCcw, ShieldCheck,
  ListChecks, FileText, Repeat,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { US_STATES } from '@/lib/us-states';

import { PageContainer } from '@/components/ui/page-container';
import { PortalHero } from '@/components/ui/portal-hero';
interface Company {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  clientId: string;
  logoUrl?: string;
  allowedSubcontractorStates?: string[];
  invoiceApprovalRequired?: boolean;
  invoiceLocationEmailEnabled?: boolean;
  // Margin Edge integration — when enabled, every invoice for this
  // company's clients is auto-forwarded to their Margin Edge AP inbox
  // with the invoice PDF attached. Configured per-company so others
  // can opt in without code changes.
  marginEdgeEnabled?: boolean;
  marginEdgeInvoiceEmail?: string;
  // When true, subcontractors invited to bid on this company's work orders
  // may submit an invoice directly instead of going through the quote flow.
  allowSubDirectInvoiceFromBidding?: boolean;
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
    editRecurringWorkOrders?: boolean;
    viewTimeline?: boolean;
    createSubcontractors?: boolean;
    createLocation?: boolean;
    createRecurringWorkOrders?: boolean;
    archiveWorkOrders?: boolean;
    combineWorkOrders?: boolean;
  };
}

type PermKey = keyof NonNullable<Client['permissions']>;
type PermCategory = 'visibility' | 'creation' | 'workflow';

const PERMISSION_DEFS: {
  key: PermKey;
  label: string;
  desc: string;
  category: PermCategory;
  icon: typeof Shield;
}[] = [
  { key: 'viewMaintenanceRequests',            label: 'Maintenance Requests',           desc: 'View incoming maintenance requests in the client portal.',                                       category: 'visibility', icon: ListChecks },
  { key: 'viewMaintenanceRequestsWorkOrders',  label: 'Maintenance Request Work Orders',desc: 'See work orders that originated from maintenance requests.',                                     category: 'visibility', icon: FileText },
  { key: 'viewSubcontractors',                 label: 'View Subcontractors',            desc: 'Read-only view of all subcontractors in the platform.',                                          category: 'visibility', icon: Users },
  { key: 'viewRecurringWorkOrders',            label: 'View Recurring Work Orders',     desc: 'View recurring work orders for owned locations.',                                                category: 'visibility', icon: Repeat },
  { key: 'editRecurringWorkOrders',            label: 'Edit Recurring Work Orders',     desc: 'Edit recurring work orders for owned locations.',                                                category: 'visibility', icon: Repeat },
  { key: 'rejectedWorkOrders',                 label: 'Rejected Work Orders',           desc: 'Show rejected work orders in the client portal.',                                                category: 'visibility', icon: XCircle },
  { key: 'viewTimeline',                       label: 'Timeline',                       desc: 'Show the activity timeline on work orders, quotes and invoices.',                                category: 'visibility', icon: Clock },

  { key: 'createSubcontractors',               label: 'Create Subcontractors',          desc: 'Create new subcontractors and send them platform invitations.',                                  category: 'creation', icon: UserCheck },
  { key: 'createLocation',                     label: 'Create Location',                desc: 'Add new property locations to the company.',                                                     category: 'creation', icon: MapPin },
  { key: 'createRecurringWorkOrders',          label: 'Create Recurring Work Orders',   desc: 'Create new recurring work orders for owned locations.',                                          category: 'creation', icon: PlusCircle },

  { key: 'shareForBidding',                    label: 'Share for Bidding',              desc: 'Share work orders with subcontractors for bidding. Quotes are shared without markup.',           category: 'workflow', icon: GitBranch },
  { key: 'approveRejectOrder',                 label: 'Approve / Reject Order',         desc: 'Allow clients to approve or reject work orders from their portal.',                              category: 'workflow', icon: CheckCircle2 },
  { key: 'compareQuotes',                      label: 'Compare Quotes',                 desc: 'Compare multiple quotes side-by-side with subcontractor details.',                               category: 'workflow', icon: Workflow },
  { key: 'combineWorkOrders',                  label: 'Combine Work Orders',            desc: 'Combine 2+ eligible work orders into a single bundle so a subcontractor can submit one quote that covers all of them.', category: 'workflow', icon: Workflow },
  { key: 'archiveWorkOrders',                  label: 'Archive Work Orders',            desc: 'Archive work orders, removing them from active lists.',                                          category: 'workflow', icon: RotateCcw },
];

const CATEGORY_META: Record<PermCategory, { label: string; icon: typeof Shield; ringClass: string; pillClass: string }> = {
  visibility: { label: 'Visibility & Access', icon: Eye,        ringClass: 'ring-blue-200 dark:ring-blue-900/50',     pillClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60' },
  creation:   { label: 'Create & Manage',     icon: PlusCircle, ringClass: 'ring-emerald-200 dark:ring-emerald-900/50', pillClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60' },
  workflow:   { label: 'Workflow Actions',    icon: Workflow,   ringClass: 'ring-purple-200 dark:ring-purple-900/50', pillClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60' },
};

const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-fuchsia-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
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

function configuredFeatureCount(c: Company): number {
  let n = 0;
  if ((c.allowedSubcontractorStates || []).length > 0) n++;
  if (c.invoiceApprovalRequired) n++;
  if (c.invoiceLocationEmailEnabled) n++;
  if (c.marginEdgeEnabled) n++;
  if (c.allowSubDirectInvoiceFromBidding) n++;
  return n;
}

/**
 * Modern toggle. Visually a switch, semantically a checkbox.
 * Tailwind only, theme-aware via primary/muted tokens.
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`group inline-flex items-center gap-3 select-none ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked
            ? 'bg-blue-600 dark:bg-blue-500'
            : 'bg-muted border border-border'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
      {(label || description) && (
        <span className="text-left">
          {label && <span className="block text-sm font-medium text-foreground">{label}</span>}
          {description && <span className="block text-xs text-muted-foreground mt-0.5">{description}</span>}
        </span>
      )}
    </button>
  );
}

/**
 * Compact circular avatar — uses logo when present, falls back to a
 * deterministic gradient initials tile.
 */
function CompanyAvatar({ company, size = 40 }: { company: Company; size?: number }) {
  const px = `${size}px`;
  if (company.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt={company.name}
        style={{ width: px, height: px }}
        className="rounded-xl object-contain border border-border bg-muted p-1 flex-shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: px, height: px, fontSize: size * 0.36 }}
      className={`rounded-xl bg-gradient-to-br ${avatarColor(company.id)} text-white font-bold flex items-center justify-center shadow-sm flex-shrink-0`}
    >
      {getInitials(company.name)}
    </div>
  );
}

export default function CompaniesPermissions() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'clients'>('settings');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  // Per-client perm edit state
  const [clientPermissions, setClientPermissions] = useState<Record<string, Client['permissions']>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Company-level perm edit state
  const [companyAllowedStates, setCompanyAllowedStates] = useState<Record<string, string[]>>({});
  const [companyStateSaving, setCompanyStateSaving] = useState<string | null>(null);
  const [companyInvoiceApproval, setCompanyInvoiceApproval] = useState<Record<string, boolean>>({});
  const [companyApprovalSaving, setCompanyApprovalSaving] = useState<string | null>(null);
  const [companyLocationEmail, setCompanyLocationEmail] = useState<Record<string, boolean>>({});
  const [companyLocationEmailSaving, setCompanyLocationEmailSaving] = useState<string | null>(null);
  // Margin Edge per-company integration — toggle + email config + save state.
  const [companyMarginEdgeEnabled, setCompanyMarginEdgeEnabled] = useState<Record<string, boolean>>({});
  const [companyMarginEdgeEmail, setCompanyMarginEdgeEmail] = useState<Record<string, string>>({});
  const [companyMarginEdgeSaving, setCompanyMarginEdgeSaving] = useState<string | null>(null);
  // Direct invoice from bidding — per-company toggle + save state.
  const [companyDirectInvoice, setCompanyDirectInvoice] = useState<Record<string, boolean>>({});
  const [companyDirectInvoiceSaving, setCompanyDirectInvoiceSaving] = useState<string | null>(null);

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

      const allowedStatesMap: Record<string, string[]> = {};
      const invoiceApprovalMap: Record<string, boolean> = {};
      const locationEmailMap: Record<string, boolean> = {};
      const marginEdgeEnabledMap: Record<string, boolean> = {};
      const marginEdgeEmailMap: Record<string, string> = {};
      const directInvoiceMap: Record<string, boolean> = {};
      comps.forEach((c) => {
        allowedStatesMap[c.id] = Array.isArray(c.allowedSubcontractorStates) ? c.allowedSubcontractorStates : [];
        invoiceApprovalMap[c.id] = c.invoiceApprovalRequired === true;
        locationEmailMap[c.id] = c.invoiceLocationEmailEnabled === true;
        marginEdgeEnabledMap[c.id] = c.marginEdgeEnabled === true;
        marginEdgeEmailMap[c.id] = c.marginEdgeInvoiceEmail || '';
        directInvoiceMap[c.id] = c.allowSubDirectInvoiceFromBidding === true;
      });
      setCompanyAllowedStates(allowedStatesMap);
      setCompanyInvoiceApproval(invoiceApprovalMap);
      setCompanyLocationEmail(locationEmailMap);
      setCompanyMarginEdgeEnabled(marginEdgeEnabledMap);
      setCompanyMarginEdgeEmail(marginEdgeEmailMap);
      setCompanyDirectInvoice(directInvoiceMap);

      const permissionsMap: Record<string, Client['permissions']> = {};
      cls.forEach((client) => {
        const perms: Record<string, boolean> = {};
        PERMISSION_DEFS.forEach((def) => {
          perms[def.key] = client.permissions?.[def.key] || false;
        });
        permissionsMap[client.id] = perms;
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

  // Auto-select the first company once data lands so the detail panel
  // always has something to render on desktop.
  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  // --- Subcontractor state perm ----------------------------------------
  const toggleCompanyState = (companyId: string, code: string) => {
    setCompanyAllowedStates((prev) => {
      const cur = prev[companyId] || [];
      const exists = cur.includes(code);
      return { ...prev, [companyId]: exists ? cur.filter((s) => s !== code) : [...cur, code] };
    });
  };
  const setCompanyStatesAll = (companyId: string) =>
    setCompanyAllowedStates((prev) => ({ ...prev, [companyId]: [] }));

  const handleSaveCompanyStates = async (companyId: string) => {
    setCompanyStateSaving(companyId);
    try {
      const states = companyAllowedStates[companyId] || [];
      await updateDoc(doc(db, 'companies', companyId), {
        allowedSubcontractorStates: states,
        updatedAt: serverTimestamp(),
      });
      toast.success(states.length === 0 ? 'All states allowed for this company' : `${states.length} state(s) allowed`);
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, allowedSubcontractorStates: states } : c)));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save state permissions');
    } finally {
      setCompanyStateSaving(null);
    }
  };

  // --- Invoice approval perm -------------------------------------------
  const handleSaveInvoiceApproval = async (companyId: string) => {
    setCompanyApprovalSaving(companyId);
    try {
      const enabled = companyInvoiceApproval[companyId] === true;
      await updateDoc(doc(db, 'companies', companyId), {
        invoiceApprovalRequired: enabled,
        updatedAt: serverTimestamp(),
      });
      toast.success(enabled ? 'Invoice approval (72h) enabled' : 'Invoice approval disabled');
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, invoiceApprovalRequired: enabled } : c)));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save invoice-approval setting');
    } finally {
      setCompanyApprovalSaving(null);
    }
  };

  // --- Invoice location email perm -------------------------------------
  const handleSaveLocationEmailPerm = async (companyId: string) => {
    setCompanyLocationEmailSaving(companyId);
    try {
      const enabled = companyLocationEmail[companyId] === true;
      await updateDoc(doc(db, 'companies', companyId), {
        invoiceLocationEmailEnabled: enabled,
        updatedAt: serverTimestamp(),
      });
      toast.success(
        enabled
          ? 'Invoice Location Email enabled — invoices will also CC the per-location address'
          : 'Invoice Location Email disabled',
      );
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, invoiceLocationEmailEnabled: enabled } : c)));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save Invoice Location Email setting');
    } finally {
      setCompanyLocationEmailSaving(null);
    }
  };

  // --- Margin Edge integration -----------------------------------------
  // Toggle + email together. Validates email format when enabled so we
  // don't ship "enabled but blank" config that silently no-ops the
  // forwarder.
  const handleSaveMarginEdge = async (companyId: string) => {
    const enabled = companyMarginEdgeEnabled[companyId] === true;
    const email = (companyMarginEdgeEmail[companyId] || '').trim();
    if (enabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid Margin Edge invoice email address before enabling.');
      return;
    }
    setCompanyMarginEdgeSaving(companyId);
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        marginEdgeEnabled: enabled,
        marginEdgeInvoiceEmail: enabled ? email : '',
        updatedAt: serverTimestamp(),
      });
      toast.success(
        enabled
          ? `Margin Edge enabled — invoices will auto-forward to ${email}`
          : 'Margin Edge disabled — invoices will no longer be forwarded',
      );
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === companyId
            ? { ...c, marginEdgeEnabled: enabled, marginEdgeInvoiceEmail: enabled ? email : '' }
            : c,
        ),
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save Margin Edge setting');
    } finally {
      setCompanyMarginEdgeSaving(null);
    }
  };

  // --- Direct invoice from bidding perm --------------------------------
  const handleSaveDirectInvoice = async (companyId: string) => {
    setCompanyDirectInvoiceSaving(companyId);
    try {
      const enabled = companyDirectInvoice[companyId] === true;
      await updateDoc(doc(db, 'companies', companyId), {
        allowSubDirectInvoiceFromBidding: enabled,
        updatedAt: serverTimestamp(),
      });
      toast.success(
        enabled
          ? 'Direct Invoice from Bidding enabled — subs may now submit invoices directly'
          : 'Direct Invoice from Bidding disabled',
      );
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, allowSubDirectInvoiceFromBidding: enabled } : c)));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save Direct Invoice setting');
    } finally {
      setCompanyDirectInvoiceSaving(null);
    }
  };

  // --- Per-client perm -------------------------------------------------
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

  // --- Computed --------------------------------------------------------
  const filteredCompanies = useMemo(() =>
    companies.filter((c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [companies, searchQuery],
  );

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;
  const selectedCompanyClients = useMemo(
    () => (selectedCompany ? clients.filter((c) => c.companyId === selectedCompany.id) : []),
    [selectedCompany, clients],
  );

  const totalClients = clients.length;
  const totalPermissionsEnabled = clients.reduce(
    (sum, cl) => sum + enabledCount(clientPermissions[cl.id] || {}),
    0,
  );
  const totalConfiguredFeatures = companies.reduce((sum, c) => sum + configuredFeatureCount(c), 0);

  // --- Render ----------------------------------------------------------
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
      <PageContainer>
        {/* Hero Header — gradient panel with icon */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-blue-50 via-card to-purple-50/60 dark:from-blue-950/30 dark:via-card dark:to-purple-950/20">
          <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-blue-200/30 dark:bg-blue-900/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-purple-200/30 dark:bg-purple-900/20 blur-3xl pointer-events-none" />
          <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-card border border-border shadow-sm p-3 flex-shrink-0">
                <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Companies Permissions
                </h1>
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  Configure portal access, billing flows, subcontractor visibility and per-location
                  email routing for each company in one place.
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-card/60 border border-border rounded-full px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>{companies.length} companies · {totalClients} clients managed</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <StatCards
          items={[
            { label: 'Companies', value: companies.length, icon: Building2, color: 'blue' },
            { label: 'Clients', value: totalClients, icon: Users, color: 'purple' },
            { label: 'Permission Types', value: PERMISSION_DEFS.length, icon: Shield, color: 'emerald' },
            { label: 'Permissions Active', value: totalPermissionsEnabled, icon: CheckCircle2, color: 'amber' },
          ]}
        />

        {/* Master-Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4">
          {/* ================= Left Rail: Companies List ================= */}
          {/*
            No inner overflow anywhere on this page. The page (document)
            is the single scroll surface — having both a page scrollbar
            AND a panel scrollbar is the "two vertical scrollbars"
            anti-pattern. Long company lists or long detail panels just
            extend the page; users scroll once.
          */}
          <aside className={`${selectedCompany ? 'hidden lg:block' : 'block'}`}>
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Companies
                  </p>
                  <span className="text-xs font-semibold text-muted-foreground bg-card border border-border rounded-full px-2 py-0.5">
                    {filteredCompanies.length}
                  </span>
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search companies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>

              <div className="p-2 space-y-1">
                {filteredCompanies.length === 0 ? (
                  <div className="text-center py-10">
                    <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No companies found</p>
                  </div>
                ) : (
                  filteredCompanies.map((company) => {
                    const isSelected = company.id === selectedCompanyId;
                    const companyClientCount = clients.filter((c) => c.companyId === company.id).length;
                    const features = configuredFeatureCount(company);
                    return (
                      <button
                        key={company.id}
                        onClick={() => {
                          setSelectedCompanyId(company.id);
                          setActiveTab('settings');
                          setExpandedClient(null);
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 transition-all ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-200 dark:ring-blue-900/60 shadow-sm'
                            : 'hover:bg-muted/60'
                        }`}
                      >
                        <CompanyAvatar company={company} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-foreground'}`}>
                            {company.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {companyClientCount} {companyClientCount === 1 ? 'client' : 'clients'}
                            </span>
                            {features > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60">
                                <Sparkles className="h-2.5 w-2.5" /> {features}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${isSelected ? 'text-blue-600 dark:text-blue-400 translate-x-0.5' : 'text-muted-foreground/40'}`} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* ================= Right Panel: Company Detail ================= */}
          <section className={`${selectedCompany ? 'block' : 'hidden lg:block'}`}>
            {!selectedCompany ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  Select a company to manage its permissions
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mobile back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden gap-1.5"
                  onClick={() => setSelectedCompanyId(null)}
                >
                  <ArrowLeft className="h-4 w-4" /> Back to companies
                </Button>

                {/* Company hero card */}
                <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                  <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
                    <CompanyAvatar company={selectedCompany} size={64} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start sm:items-center flex-wrap gap-2">
                        <h2 className="text-xl font-bold text-foreground truncate">
                          {selectedCompany.name}
                        </h2>
                        {configuredFeatureCount(selectedCompany) > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60">
                            <Sparkles className="h-3 w-3" />
                            {configuredFeatureCount(selectedCompany)} feature{configuredFeatureCount(selectedCompany) === 1 ? '' : 's'} active
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
                        {selectedCompany.email && (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />{selectedCompany.email}
                          </span>
                        )}
                        {selectedCompany.phone && (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />{selectedCompany.phone}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {selectedCompanyClients.length} {selectedCompanyClients.length === 1 ? 'client' : 'clients'}
                        </span>
                      </div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                    >
                      <Link href={`/admin-portal/subsidiaries/${selectedCompany.id}`}>
                        <Eye className="h-4 w-4" /> View Company
                      </Link>
                    </Button>
                  </div>

                  {/* Tabs */}
                  <div className="border-t border-border bg-muted/30 px-3 sm:px-4 flex">
                    {[
                      { id: 'settings' as const, label: 'Company Settings', icon: Settings, count: configuredFeatureCount(selectedCompany) },
                      { id: 'clients' as const,  label: 'Client Permissions', icon: Users, count: selectedCompanyClients.length },
                    ].map(({ id, label, icon: Icon, count }) => {
                      const active = activeTab === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setActiveTab(id)}
                          className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                            active ? 'text-blue-700 dark:text-blue-300' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                            active
                              ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900/60'
                              : 'bg-card text-muted-foreground border-border'
                          }`}>
                            {count}
                          </span>
                          {active && (
                            <span className="absolute inset-x-3 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tab body */}
                {activeTab === 'settings' && (
                  <SettingsTab
                    company={selectedCompany}
                    companyAllowedStates={companyAllowedStates[selectedCompany.id] || []}
                    onToggleState={(code) => toggleCompanyState(selectedCompany.id, code)}
                    onSelectAllStates={() => setCompanyStatesAll(selectedCompany.id)}
                    onSaveStates={() => handleSaveCompanyStates(selectedCompany.id)}
                    statesSaving={companyStateSaving === selectedCompany.id}

                    invoiceApprovalEnabled={companyInvoiceApproval[selectedCompany.id] === true}
                    onSetInvoiceApproval={(v) => setCompanyInvoiceApproval((prev) => ({ ...prev, [selectedCompany.id]: v }))}
                    onSaveInvoiceApproval={() => handleSaveInvoiceApproval(selectedCompany.id)}
                    invoiceApprovalSaving={companyApprovalSaving === selectedCompany.id}

                    locationEmailEnabled={companyLocationEmail[selectedCompany.id] === true}
                    onSetLocationEmail={(v) => setCompanyLocationEmail((prev) => ({ ...prev, [selectedCompany.id]: v }))}
                    onSaveLocationEmail={() => handleSaveLocationEmailPerm(selectedCompany.id)}
                    locationEmailSaving={companyLocationEmailSaving === selectedCompany.id}

                    marginEdgeEnabled={companyMarginEdgeEnabled[selectedCompany.id] === true}
                    marginEdgeEmail={companyMarginEdgeEmail[selectedCompany.id] || ''}
                    onSetMarginEdgeEnabled={(v) => setCompanyMarginEdgeEnabled((prev) => ({ ...prev, [selectedCompany.id]: v }))}
                    onSetMarginEdgeEmail={(v) => setCompanyMarginEdgeEmail((prev) => ({ ...prev, [selectedCompany.id]: v }))}
                    onSaveMarginEdge={() => handleSaveMarginEdge(selectedCompany.id)}
                    marginEdgeSaving={companyMarginEdgeSaving === selectedCompany.id}

                    directInvoiceEnabled={companyDirectInvoice[selectedCompany.id] === true}
                    onSetDirectInvoice={(v) => setCompanyDirectInvoice((prev) => ({ ...prev, [selectedCompany.id]: v }))}
                    onSaveDirectInvoice={() => handleSaveDirectInvoice(selectedCompany.id)}
                    directInvoiceSaving={companyDirectInvoiceSaving === selectedCompany.id}
                  />
                )}

                {activeTab === 'clients' && (
                  <ClientsTab
                    clients={selectedCompanyClients}
                    expandedClient={expandedClient}
                    onToggleExpand={(id) => setExpandedClient((cur) => (cur === id ? null : id))}
                    clientPermissions={clientPermissions}
                    onPermissionChange={handlePermissionChange}
                    onSave={handleSavePermissions}
                    saving={saving}
                  />
                )}
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </AdminLayout>
  );
}

/* ================================================================== */
/*  Settings Tab                                                      */
/* ================================================================== */

function SettingsTab(props: {
  company: Company;
  companyAllowedStates: string[];
  onToggleState: (code: string) => void;
  onSelectAllStates: () => void;
  onSaveStates: () => void;
  statesSaving: boolean;

  invoiceApprovalEnabled: boolean;
  onSetInvoiceApproval: (v: boolean) => void;
  onSaveInvoiceApproval: () => void;
  invoiceApprovalSaving: boolean;

  locationEmailEnabled: boolean;
  onSetLocationEmail: (v: boolean) => void;
  onSaveLocationEmail: () => void;
  locationEmailSaving: boolean;

  marginEdgeEnabled: boolean;
  marginEdgeEmail: string;
  onSetMarginEdgeEnabled: (v: boolean) => void;
  onSetMarginEdgeEmail: (v: string) => void;
  onSaveMarginEdge: () => void;
  marginEdgeSaving: boolean;

  directInvoiceEnabled: boolean;
  onSetDirectInvoice: (v: boolean) => void;
  onSaveDirectInvoice: () => void;
  directInvoiceSaving: boolean;
}) {
  const {
    company,
    companyAllowedStates, onToggleState, onSelectAllStates, onSaveStates, statesSaving,
    invoiceApprovalEnabled, onSetInvoiceApproval, onSaveInvoiceApproval, invoiceApprovalSaving,
    locationEmailEnabled, onSetLocationEmail, onSaveLocationEmail, locationEmailSaving,
    marginEdgeEnabled, marginEdgeEmail, onSetMarginEdgeEnabled, onSetMarginEdgeEmail,
    onSaveMarginEdge, marginEdgeSaving,
    directInvoiceEnabled, onSetDirectInvoice, onSaveDirectInvoice, directInvoiceSaving,
  } = props;

  const allStates = companyAllowedStates.length === 0;
  const persistedStates = company.allowedSubcontractorStates || [];
  const statesDirty = JSON.stringify([...persistedStates].sort()) !== JSON.stringify([...companyAllowedStates].sort());

  const apprDirty = invoiceApprovalEnabled !== (company.invoiceApprovalRequired === true);
  const emailDirty = locationEmailEnabled !== (company.invoiceLocationEmailEnabled === true);
  const marginEdgeDirty =
    marginEdgeEnabled !== (company.marginEdgeEnabled === true) ||
    (marginEdgeEmail || '').trim() !== (company.marginEdgeInvoiceEmail || '').trim();
  const directInvoiceDirty = directInvoiceEnabled !== (company.allowSubDirectInvoiceFromBidding === true);

  return (
    <div className="space-y-4">
      {/* Subcontractor State Access */}
      <SettingCard
        accent="blue"
        icon={Globe2}
        title="Subcontractor State Access"
        description="Restrict which subcontractors this company's clients see when sharing work orders for bidding. Empty selection = all states."
        statusBadge={
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              allStates
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60'
            }`}
          >
            {allStates ? 'All states' : `${companyAllowedStates.length} state${companyAllowedStates.length === 1 ? '' : 's'}`}
          </span>
        }
        footer={
          <Button size="sm" onClick={onSaveStates} disabled={statesSaving || !statesDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {statesSaving ? 'Saving…' : statesDirty ? 'Save State Access' : 'Saved'}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Button
            size="sm"
            variant={allStates ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={onSelectAllStates}
          >
            {allStates ? '✓ All states selected' : 'Select all states'}
          </Button>
          {!allStates && (
            <span className="text-xs text-muted-foreground">
              Click states below to add or remove. Showing {companyAllowedStates.length} selected.
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 gap-2">
          {US_STATES.map((s) => {
            const checked = companyAllowedStates.includes(s.code);
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => onToggleState(s.code)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-all ${
                  checked
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'bg-card border-border text-foreground hover:bg-muted/60 hover:border-blue-200'
                }`}
              >
                <span className="font-mono font-semibold">{s.code}</span>
                <span className="hidden md:inline truncate text-[11px] opacity-80">{s.name}</span>
              </button>
            );
          })}
        </div>
      </SettingCard>

      {/* Invoice Approval (72h) */}
      <SettingCard
        accent="amber"
        icon={Receipt}
        title="Invoice Approval (72h)"
        description="Generated invoices enter a pending state. Clients have 72 hours to approve or dispute. If neither happens, the invoice is auto-finalized and emailed."
        statusBadge={
          <StatusPill on={invoiceApprovalEnabled} />
        }
        footer={
          <Button size="sm" onClick={onSaveInvoiceApproval} disabled={invoiceApprovalSaving || !apprDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {invoiceApprovalSaving ? 'Saving…' : apprDirty ? 'Save Invoice Approval' : 'Saved'}
          </Button>
        }
      >
        <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
          <Switch
            checked={invoiceApprovalEnabled}
            onCheckedChange={onSetInvoiceApproval}
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">Require client approval before sending invoice email</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, invoices are emailed immediately on generation (default behavior).
            </p>
          </div>
        </div>
      </SettingCard>

      {/* Invoice Location Email */}
      <SettingCard
        accent="purple"
        icon={MailPlus}
        title="Invoice Location Email"
        description={`When enabled, this company's locations get a "Location Email Address" field. Any invoice generated for that location is automatically also emailed to the configured per-location address.`}
        statusBadge={
          <StatusPill on={locationEmailEnabled} />
        }
        footer={
          <Button size="sm" onClick={onSaveLocationEmail} disabled={locationEmailSaving || !emailDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {locationEmailSaving ? 'Saving…' : emailDirty ? 'Save Location Email' : 'Saved'}
          </Button>
        }
      >
        <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
          <Switch
            checked={locationEmailEnabled}
            onCheckedChange={onSetLocationEmail}
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">Email invoices to per-location address on generation</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adds a "Location Email Address" field on each location for this company.
            </p>
          </div>
        </div>
      </SettingCard>

      {/* Direct Invoice from Bidding */}
      <SettingCard
        accent="indigo"
        icon={FileText}
        title="Direct Invoice from Bidding"
        description="When enabled, subcontractors invited to bid on this company's work orders may submit an invoice directly, bypassing the normal quote → approve → assign flow. The work order is assigned to them immediately; they complete the work and mark it done normally."
        statusBadge={<StatusPill on={directInvoiceEnabled} />}
        footer={
          <Button size="sm" onClick={onSaveDirectInvoice} disabled={directInvoiceSaving || !directInvoiceDirty} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {directInvoiceSaving ? 'Saving…' : directInvoiceDirty ? 'Save Direct Invoice' : 'Saved'}
          </Button>
        }
      >
        <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
          <Switch
            checked={directInvoiceEnabled}
            onCheckedChange={onSetDirectInvoice}
          />
          <div className="text-sm">
            <p className="font-medium text-foreground">Allow subcontractors to submit invoices directly from bidding</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skips the quote step for invited subs on this company's orders. Invoice approval rules (72h window) still apply if enabled above.
            </p>
          </div>
        </div>
      </SettingCard>

      {/* Margin Edge Integration */}
      <SettingCard
        accent="emerald"
        icon={Receipt}
        title="Margin Edge Integration"
        description={
          'When enabled, an "Approve & Forward to Margin Edge" action appears on each invoice. Approving forwards the invoice PDF to the per-location Margin Edge AP inbox (or the company-level fallback below if no per-location override). Each location can set its own Margin Edge inbox in the Locations admin. Idempotent — re-approving the same invoice never duplicates.'
        }
        statusBadge={<StatusPill on={marginEdgeEnabled} />}
        footer={
          <Button
            size="sm"
            onClick={onSaveMarginEdge}
            disabled={marginEdgeSaving || !marginEdgeDirty}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {marginEdgeSaving ? 'Saving…' : marginEdgeDirty ? 'Save Margin Edge' : 'Saved'}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-4 p-3 rounded-lg bg-muted/30 border border-border">
            <Switch
              checked={marginEdgeEnabled}
              onCheckedChange={onSetMarginEdgeEnabled}
            />
            <div className="text-sm">
              <p className="font-medium text-foreground">Enable Margin Edge approval action on invoices</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds an "Approve &amp; Forward to Margin Edge" button on
                each invoice in the admin. Forward fires on click, not on
                customer-facing send.
              </p>
            </div>
          </div>

          {/* Company-level fallback inbox. Per-location overrides are
              configured in the Locations admin. */}
          <div className={marginEdgeEnabled ? '' : 'opacity-60'}>
            <Label htmlFor="margin-edge-email" className="text-xs font-semibold text-muted-foreground">
              Company-level Margin Edge inbox (fallback)
            </Label>
            <Input
              id="margin-edge-email"
              type="email"
              placeholder="invoices+xxxx@margin-edge.com"
              value={marginEdgeEmail}
              onChange={(e) => onSetMarginEdgeEmail(e.target.value)}
              className="mt-1 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Used when a location doesn't have its own Margin Edge inbox set.
              Each location can override this in <span className="font-medium text-foreground">Locations → Edit Location → Margin Edge AP Email</span>.
              Find the address in Margin Edge under{' '}
              <span className="font-medium text-foreground">Orders → Orders Setup → Invoice Email</span>.
            </p>
          </div>
        </div>
      </SettingCard>
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
        on
          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60'
          : 'bg-muted text-muted-foreground border-border'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-blue-500' : 'bg-muted-foreground/40'}`} />
      {on ? 'Enabled' : 'Disabled'}
    </span>
  );
}

const ACCENT: Record<'blue' | 'amber' | 'purple' | 'emerald' | 'indigo', { stripe: string; iconBg: string; iconText: string }> = {
  blue:    { stripe: 'before:bg-blue-500',    iconBg: 'bg-blue-50 dark:bg-blue-950/40',       iconText: 'text-blue-600 dark:text-blue-400' },
  amber:   { stripe: 'before:bg-amber-500',   iconBg: 'bg-amber-50 dark:bg-amber-950/40',     iconText: 'text-amber-600 dark:text-amber-400' },
  purple:  { stripe: 'before:bg-purple-500',  iconBg: 'bg-purple-50 dark:bg-purple-950/40',   iconText: 'text-purple-600 dark:text-purple-400' },
  emerald: { stripe: 'before:bg-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-950/40', iconText: 'text-emerald-600 dark:text-emerald-400' },
  indigo:  { stripe: 'before:bg-indigo-500',  iconBg: 'bg-indigo-50 dark:bg-indigo-950/40',   iconText: 'text-indigo-600 dark:text-indigo-400' },
};

function SettingCard({
  accent, icon: Icon, title, description, statusBadge, footer, children,
}: {
  accent: keyof typeof ACCENT;
  icon: typeof Shield;
  title: string;
  description: string;
  statusBadge?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className={`relative bg-card rounded-2xl border border-border shadow-sm overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${a.stripe}`}>
      <div className="p-5 sm:p-6 pl-6 sm:pl-7">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`rounded-lg ${a.iconBg} p-2 flex-shrink-0`}>
              <Icon className={`h-4 w-4 ${a.iconText}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed max-w-2xl">{description}</p>
            </div>
          </div>
          {statusBadge}
        </div>

        {children}

        {footer && (
          <div className="flex justify-end mt-4 pt-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Clients Tab                                                       */
/* ================================================================== */

function ClientsTab({
  clients,
  expandedClient,
  onToggleExpand,
  clientPermissions,
  onPermissionChange,
  onSave,
  saving,
}: {
  clients: Client[];
  expandedClient: string | null;
  onToggleExpand: (id: string) => void;
  clientPermissions: Record<string, Client['permissions']>;
  onPermissionChange: (clientId: string, perm: PermKey, value: boolean) => void;
  onSave: (clientId: string) => void;
  saving: string | null;
}) {
  if (clients.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          No clients associated with this company
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <ul className="divide-y divide-border">
        {clients.map((client) => {
          const permissions = clientPermissions[client.id] || {};
          const isSaving = saving === client.id;
          const enabled = enabledCount(permissions);
          const isExpanded = expandedClient === client.id;
          const totalPossible = PERMISSION_DEFS.length;
          const ratio = totalPossible > 0 ? (enabled / totalPossible) * 100 : 0;

          return (
            <li key={client.id} className="bg-card">
              {/* Client header */}
              <button
                type="button"
                onClick={() => onToggleExpand(client.id)}
                className="w-full text-left px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-muted/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-stone-400 to-stone-600 dark:from-stone-600 dark:to-stone-800 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {getInitials(client.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground text-sm truncate">{client.fullName}</p>
                  <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                </div>

                {/* Permission ratio + bar */}
                <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    enabled === 0
                      ? 'bg-muted text-muted-foreground'
                      : enabled === totalPossible
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60'
                  }`}>
                    {enabled}/{totalPossible} active
                  </span>
                  <div className="w-32 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        enabled === 0
                          ? 'bg-muted-foreground/20'
                          : enabled === totalPossible
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>

                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div className="px-4 sm:px-5 pb-5 pt-1 bg-muted/20 border-t border-border space-y-5">
                  {(['visibility', 'creation', 'workflow'] as PermCategory[]).map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const items = PERMISSION_DEFS.filter((p) => p.category === cat);
                    const activeInCat = items.filter((p) => permissions[p.key]).length;
                    const CatIcon = meta.icon;
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-2 mt-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg border ${meta.pillClass}`}>
                            <CatIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {activeInCat}/{items.length} active
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {items.map((perm) => {
                            const isEnabled = permissions[perm.key] || false;
                            const PermIcon = perm.icon;
                            return (
                              <label
                                key={perm.key}
                                htmlFor={`${perm.key}-${client.id}`}
                                className={`group cursor-pointer rounded-xl border p-3 flex items-start gap-3 transition-all ${
                                  isEnabled
                                    ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 ring-1 ring-blue-100 dark:ring-blue-900/40'
                                    : 'bg-card border-border hover:border-blue-200 hover:bg-muted/40'
                                }`}
                              >
                                <Checkbox
                                  id={`${perm.key}-${client.id}`}
                                  checked={isEnabled}
                                  onCheckedChange={(checked) =>
                                    onPermissionChange(client.id, perm.key, checked === true)
                                  }
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <PermIcon className={`h-3.5 w-3.5 flex-shrink-0 ${isEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
                                    <span className={`text-sm font-medium ${isEnabled ? 'text-foreground' : 'text-foreground'}`}>
                                      {perm.label}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                                    {perm.desc}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex justify-end pt-2 border-t border-border">
                    <Button
                      size="sm"
                      onClick={() => onSave(client.id)}
                      disabled={isSaving}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSaving ? 'Saving...' : 'Save Permissions'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
