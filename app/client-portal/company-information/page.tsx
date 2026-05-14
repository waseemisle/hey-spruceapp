'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from '@/lib/firebase-auth';
import { useFirebaseInstance } from '@/lib/use-firebase-instance';
import { formatMoney } from '@/lib/money';
import {
  Building2, Phone, Globe, MapPin, CreditCard, CheckCircle,
  FileText, Layers, AlertCircle,
} from 'lucide-react';
import { PortalListPage } from '@/components/ui/portal-list-page';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  logoUrl?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  phone?: string;
  website?: string;
  invoiceConsolidationEnabled?: boolean;
}

interface PaymentMethod {
  id: string;
  type?: 'card' | 'us_bank_account';
  last4: string;
  brand: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  bankName?: string;
  accountType?: string;
}

interface ClientData {
  uid: string;
  fullName: string;
  email: string;
  companyId?: string;
  companyName?: string;
  paymentMethods?: PaymentMethod[];
  defaultPaymentMethodId?: string;
  autoChargeThreshold?: number;
  paymentTermsDays?: number;
  consolidationEnabled?: boolean;
  consolidationPeriod?: 'weekly' | 'bi-weekly' | 'monthly';
  consolidationEndDayOfWeek?: number;
  consolidationAutoCharge?: boolean;
  consolidationAutoChargePaymentMethodId?: string;
}

interface ConsolidatedInvoice {
  id: string;
  totalAmount: number;
  invoiceCount: number;
  periodStart: any;
  periodEnd: any;
  status: 'draft' | 'sent' | 'paid';
  autoCharged: boolean;
  createdAt: any;
  paidAt?: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val: any): string {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function labelForPm(pm: PaymentMethod): string {
  if (pm.type === 'us_bank_account') {
    return `${pm.bankName || 'Bank'} •••• ${pm.last4}`;
  }
  const brand = pm.brand ? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1) : 'Card';
  return `${brand} •••• ${pm.last4} — Exp ${String(pm.expMonth ?? 0).padStart(2, '0')}/${pm.expYear ?? 0}`;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyInformationPage() {
  const { auth, db } = useFirebaseInstance();

  const [loading, setLoading] = useState(true);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [consolidatedInvoices, setConsolidatedInvoices] = useState<ConsolidatedInvoice[]>([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        // Load client doc
        const clientSnap = await getDoc(doc(db, 'clients', user.uid));
        if (!clientSnap.exists()) { setLoading(false); return; }
        const cd = { uid: clientSnap.id, ...clientSnap.data() } as ClientData;
        setClientData(cd);

        // Load company doc
        if (cd.companyId) {
          const compSnap = await getDoc(doc(db, 'companies', cd.companyId));
          if (compSnap.exists()) {
            setCompany({ id: compSnap.id, ...compSnap.data() } as Company);
          }
        }

        // Load consolidated invoices for this client
        const ciSnap = await getDocs(query(
          collection(db, 'consolidatedInvoices'),
          where('clientId', '==', user.uid),
        ));
        const cis = ciSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as ConsolidatedInvoice))
          .sort((a, b) => {
            const da = toDate(a.createdAt), db_ = toDate(b.createdAt);
            if (!da || !db_) return 0;
            return db_.getTime() - da.getTime();
          });
        setConsolidatedInvoices(cis);
      } catch (err) {
        console.error('Error loading company information:', err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, [auth, db]);

  if (loading) {
    return (
      <PortalListPage title="Company Information" subtitle="Loading…" icon={Building2}>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
      </PortalListPage>
    );
  }

  if (!clientData) {
    return (
      <PortalListPage title="Company Information" subtitle="" icon={Building2}>
        <div className="text-center py-16 text-muted-foreground">Could not load your account information.</div>
      </PortalListPage>
    );
  }

  const paymentMethods = clientData.paymentMethods || [];
  const showConsolidation = company?.invoiceConsolidationEnabled === true;
  const consolidationPmId = clientData.consolidationAutoChargePaymentMethodId;
  const consolidationPm = paymentMethods.find(pm => pm.id === consolidationPmId);

  return (
    <PortalListPage title="Company Information" subtitle="Your company profile, billing settings, and invoice preferences." icon={Building2}>
      <div className="max-w-3xl mx-auto space-y-6 pb-10">

        {/* ── Section 1: Company Profile ───────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-base">Your Company</h2>
          </div>
          <div className="p-5">
            {company ? (
              <div className="space-y-5">
                {/* Logo + name */}
                <div className="flex items-center gap-4">
                  {company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt={company.name}
                      className="h-16 w-16 rounded-xl object-contain border border-border bg-muted"
                    />
                  ) : (
                    <div
                      className="h-16 w-16 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
                    >
                      {company.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{company.name}</h3>
                    {clientData.companyName && clientData.companyName !== company.name && (
                      <p className="text-sm text-muted-foreground">{clientData.companyName}</p>
                    )}
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {company.address && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                        <MapPin className="h-3 w-3" />Address
                      </span>
                      <span className="text-sm text-foreground">
                        {[company.address.street, company.address.city, company.address.state, company.address.zip]
                          .filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {company.phone && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                        <Phone className="h-3 w-3" />Phone
                      </span>
                      <a href={`tel:${company.phone}`} className="text-sm text-primary hover:underline">{company.phone}</a>
                    </div>
                  )}
                  {company.website && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                        <Globe className="h-3 w-3" />Website
                      </span>
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate"
                      >
                        {company.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                No company linked to your account.
              </div>
            )}
          </div>
        </div>

        {/* ── Section 2: Billing Settings ──────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground text-base">Billing Settings</h2>
          </div>
          <div className="p-5 space-y-5">
            {/* Terms + threshold */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Payment Terms</p>
                <p className="text-sm font-semibold text-foreground">
                  {clientData.paymentTermsDays ? `Net ${clientData.paymentTermsDays} days` : 'Standard terms'}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Auto-Charge Threshold</p>
                <p className="text-sm font-semibold text-foreground">
                  {clientData.autoChargeThreshold ? formatMoney(clientData.autoChargeThreshold) : 'Not set'}
                </p>
              </div>
            </div>

            {/* Saved payment methods (read-only) */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Saved Payment Methods
              </p>
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment methods on file.</p>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.map(pm => (
                    <div
                      key={pm.id}
                      className={`rounded-lg border p-3 flex items-center gap-3 ${
                        pm.isDefault ? 'border-primary/20 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <div className="h-9 w-14 bg-gradient-to-br from-primary to-violet-900 rounded-md flex items-center justify-center flex-shrink-0">
                        <CreditCard className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{labelForPm(pm)}</p>
                      </div>
                      {pm.isDefault && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 3: Invoice Consolidation (permission-gated) ───────── */}
        {showConsolidation && (
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              <h2 className="font-semibold text-foreground text-base">Invoice Consolidation</h2>
            </div>
            <div className="p-5 space-y-5">
              {/* Status summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Status</p>
                  <p className="text-sm font-semibold text-foreground">
                    {clientData.consolidationEnabled ? (
                      <span className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle className="h-4 w-4" />Active
                      </span>
                    ) : 'Not configured'}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Period</p>
                  <p className="text-sm font-semibold text-foreground capitalize">
                    {clientData.consolidationPeriod
                      ? clientData.consolidationPeriod.replace('-', ' ')
                      : '—'}
                  </p>
                </div>
                {(clientData.consolidationPeriod === 'weekly' || clientData.consolidationPeriod === 'bi-weekly') && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Consolidation Day</p>
                    <p className="text-sm font-semibold text-foreground">
                      Every {DAY_NAMES[clientData.consolidationEndDayOfWeek ?? 5]}
                    </p>
                  </div>
                )}
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Auto-Charge</p>
                  <p className="text-sm font-semibold text-foreground">
                    {clientData.consolidationAutoCharge ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
                {clientData.consolidationAutoCharge && (
                  <div className="rounded-lg border border-border p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Charge Card</p>
                    <p className="text-sm font-semibold text-foreground">
                      {consolidationPm ? labelForPm(consolidationPm) : 'Not configured'}
                    </p>
                  </div>
                )}
              </div>

              {/* Consolidated invoice history */}
              {consolidatedInvoices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">History</p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          {['Period', 'Invoices', 'Total', 'Status', 'Date'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {consolidatedInvoices.map(ci => (
                          <tr key={ci.id} className="hover:bg-muted/50">
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDate(ci.periodStart)} – {fmtDate(ci.periodEnd)}
                            </td>
                            <td className="px-4 py-3 text-foreground text-xs">{ci.invoiceCount}</td>
                            <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                              {formatMoney(ci.totalAmount)}
                            </td>
                            <td className="px-4 py-3">
                              {ci.status === 'paid' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                  <CheckCircle className="h-3 w-3" />Paid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  <FileText className="h-3 w-3" />Pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDate(ci.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {consolidatedInvoices.length === 0 && clientData.consolidationEnabled && (
                <p className="text-sm text-muted-foreground">No consolidated invoices generated yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalListPage>
  );
}
