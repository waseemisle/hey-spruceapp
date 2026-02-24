'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import AdminLayout from '@/components/admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, ArrowRight, CheckCircle, AlertTriangle, Search, Zap } from 'lucide-react';
import Link from 'next/link';
import { createTimelineEvent } from '@/lib/timeline';
import { toast } from 'sonner';
import {
  searchProblemTaxonomy,
  getTroubleshootingTip,
  WEATHER_TYPES,
  type ProblemSuggestion,
} from '@/lib/problem-taxonomy';
import { formatAddress } from '@/lib/utils';

interface Client {
  id: string;
  fullName: string;
  email: string;
}
interface Company {
  id: string;
  name: string;
  clientId?: string;
}
interface Location {
  id: string;
  clientId: string;
  companyId?: string;
  locationName: string;
  address?: { street?: string; city?: string; state?: string; zip?: string; country?: string };
  imageUrl?: string;
}
interface Category {
  id: string;
  name: string;
}
interface Subcontractor {
  id: string;
  fullName: string;
  email: string;
  businessName?: string;
}

const WIZARD_STEPS = ['Location & Problem', 'Troubleshooting', 'Details & Submit'];
const STATUS_PROGRESS = ['Open', 'In Progress', 'Completed', 'Invoiced'];

export default function GuidedWorkOrderCreate() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [keywordSearch, setKeywordSearch] = useState('');
  const [suggestions, setSuggestions] = useState<ProblemSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ProblemSuggestion | null>(null);
  const [description, setDescription] = useState('');
  const [nteAmount, setNteAmount] = useState('');
  const [weatherType, setWeatherType] = useState('');
  const [serviceProviderId, setServiceProviderId] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [duplicateWarnings, setDuplicateWarnings] = useState<any[]>([]);
  const [problemSolved, setProblemSolved] = useState(false);

  const filteredCompanies = useMemo(() => {
    if (!clientId) return companies;
    return companies.filter((c) => c.clientId === clientId || !c.clientId);
  }, [companies, clientId]);

  const filteredLocations = useMemo(() => {
    if (companyId) return locations.filter((l) => l.companyId === companyId);
    if (clientId) return locations.filter((l) => l.clientId === clientId);
    return locations;
  }, [locations, companyId, clientId]);

  const selectedLocation = locations.find((l) => l.id === locationId);
  const troubleshootingTip = selectedSuggestion
    ? getTroubleshootingTip(selectedSuggestion.problemType, selectedSuggestion.equipment)
    : null;

  useEffect(() => {
    const run = async () => {
      try {
        const [clientsSnap, companiesSnap, locationsSnap, categoriesSnap, subsSnap] = await Promise.all([
          getDocs(collection(db, 'clients')),
          getDocs(collection(db, 'companies')),
          getDocs(collection(db, 'locations')),
          getDocs(collection(db, 'categories')),
          getDocs(query(collection(db, 'subcontractors'), where('status', '==', 'approved'))),
        ]);
        setClients(clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
        setCompanies(companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Company)));
        setLocations(locationsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Location)));
        setCategories(categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Category)));
        setSubcontractors(subsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Subcontractor)));
      } catch (e) {
        console.error(e);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  useEffect(() => {
    setSuggestions(searchProblemTaxonomy(keywordSearch));
  }, [keywordSearch]);

  useEffect(() => {
    if (!locationId || !selectedSuggestion) {
      setDuplicateWarnings([]);
      return;
    }
    const check = async () => {
      const q = query(
        collection(db, 'workOrders'),
        where('locationId', '==', locationId),
        where('status', 'in', ['pending', 'approved', 'bidding', 'quotes_received', 'assigned', 'accepted_by_subcontractor'])
      );
      const snap = await getDocs(q);
      const similar = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (wo: any) =>
            wo.category?.toLowerCase().includes(selectedSuggestion.problemType.toLowerCase()) ||
            (wo.title && wo.title.toLowerCase().includes(selectedSuggestion.problemCode.toLowerCase()))
        );
      setDuplicateWarnings(similar);
    };
    check();
  }, [locationId, selectedSuggestion]);

  const canProceedStep1 = clientId && (companyId || filteredCompanies.length === 0) && locationId && selectedSuggestion && description.trim().length > 0;

  const handleNext = () => {
    if (step === 0 && !canProceedStep1) return;
    if (step === 1) {
      if (problemSolved) {
        toast.success('No work order created — problem solved.');
        router.push('/admin-portal/work-orders');
        return;
      }
    }
    if (step < WIZARD_STEPS.length - 1) setStep((s) => s + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    if (!selectedLocation || !selectedSuggestion || !description.trim()) return;
    setSubmitting(true);
    try {
      const client = clients.find((c) => c.id === clientId);
      const company = companies.find((c) => c.id === companyId);
      const currentUser = auth.currentUser;
      let adminName = 'Admin';
      if (currentUser) {
        try {
          const { getDoc: getDocFs, doc: docRef } = await import('firebase/firestore');
          const adminDoc = await getDocFs(docRef(db, 'adminUsers', currentUser.uid));
          if (adminDoc.exists()) adminName = (adminDoc.data()?.fullName as string) || adminName;
        } catch {
          // use default Admin
        }
      }
      const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;
      const categoryName = categories.some((c) => c.name === selectedSuggestion.problemType)
        ? selectedSuggestion.problemType
        : selectedSuggestion.problemType;
      const title = `${selectedSuggestion.problemType} — ${selectedSuggestion.problemCode}`;
      const fullAddress = formatAddress(selectedLocation.address);

      const timelineEvent = createTimelineEvent({
        type: 'created',
        userId: currentUser?.uid || 'unknown',
        userName: adminName,
        userRole: 'admin',
        details: `Work order created by ${adminName} via Guided Work Order wizard`,
        metadata: { source: 'guided_wizard', area: selectedSuggestion.area, equipment: selectedSuggestion.equipment },
      });

      const docRef = await addDoc(collection(db, 'workOrders'), {
        workOrderNumber,
        clientId,
        clientName: client?.fullName || 'Client',
        clientEmail: client?.email || '',
        companyId: companyId || null,
        companyName: company?.name || null,
        locationId,
        locationName: selectedLocation.locationName,
        locationAddress: fullAddress,
        title,
        description: description.trim(),
        category: categoryName,
        priority,
        estimateBudget: nteAmount ? parseFloat(nteAmount) : null,
        status: 'pending',
        images: [],
        createdAt: serverTimestamp(),
        timeline: [timelineEvent],
        systemInformation: {
          createdBy: {
            id: currentUser?.uid || 'unknown',
            name: adminName,
            role: 'admin',
            timestamp: Timestamp.now(),
          },
        },
        createdViaGuidedWizard: true,
        area: selectedSuggestion.area,
        problemType: selectedSuggestion.problemType,
        equipment: selectedSuggestion.equipment,
        problemCode: selectedSuggestion.problemCode,
        weatherType: weatherType || null,
        assignedSubcontractor: serviceProviderId || null,
        assignedSubcontractorName: serviceProviderId ? subcontractors.find((s) => s.id === serviceProviderId)?.fullName : null,
      });

      // Send email notifications to admins with work order emails enabled
      fetch('/api/email/send-work-order-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: docRef.id,
          workOrderNumber,
          title,
          clientName: client?.fullName || 'Client',
          locationName: selectedLocation.locationName,
          priority,
          workOrderType: 'standard',
          description: description.trim(),
        }),
      }).catch(err => console.error('Failed to send work order notification emails:', err));

      toast.success('Work order created successfully');
      router.push(`/admin-portal/work-orders/${docRef.id}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to create work order');
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className="max-w-3xl mx-auto space-y-6 pb-24">
        <div className="flex items-center gap-4">
          <Link href="/admin-portal/work-orders">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Guided Work Order</h1>
        </div>

        {/* Status progress bar (ServiceChannel style) */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {STATUS_PROGRESS.map((label, i) => (
            <div
              key={label}
              className={`flex-1 text-center text-xs font-medium py-2 rounded ${
                i === 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          {WIZARD_STEPS.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                step === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}. {name}
            </button>
          ))}
        </div>

        {/* Step 1: Location & Problem */}
        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Location & Problem</CardTitle>
              <p className="text-sm text-muted-foreground">Select location and describe the issue. We’ll suggest area and problem type.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedLocation && selectedLocation.imageUrl && (
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img src={selectedLocation.imageUrl} alt={selectedLocation.locationName} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Client *</Label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setCompanyId('');
                      setLocationId('');
                    }}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Choose client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.fullName}</option>
                    ))}
                  </select>
                </div>
                {filteredCompanies.length > 0 && (
                  <div>
                    <Label>Company</Label>
                    <select
                      value={companyId}
                      onChange={(e) => {
                        setCompanyId(e.target.value);
                        setLocationId('');
                      }}
                      className="w-full border rounded-md p-2"
                    >
                      <option value="">All locations</option>
                      {filteredCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Label>Location *</Label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Choose location...</option>
                    {filteredLocations.map((l) => (
                      <option key={l.id} value={l.id}>{l.locationName} — {formatAddress(l.address)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label>Search by keyword (Area, Problem Type, Equipment)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={keywordSearch}
                    onChange={(e) => setKeywordSearch(e.target.value)}
                    placeholder="e.g. outlet, electrical, leak, HVAC..."
                    className="pl-9"
                  />
                </div>
                {suggestions.length > 0 && (
                  <ul className="mt-2 border rounded-md divide-y max-h-48 overflow-y-auto">
                    {suggestions.slice(0, 8).map((s, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSuggestion(s);
                            setKeywordSearch(`${s.area} / ${s.problemType} / ${s.equipment} — ${s.problemCode}`);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${selectedSuggestion === s ? 'bg-primary/10' : ''}`}
                        >
                          <span className="font-medium">{s.area}</span> → {s.problemType} / {s.equipment} — {s.problemCode}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedSuggestion && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Selected: <strong>{selectedSuggestion.area}</strong> → {selectedSuggestion.problemType} / {selectedSuggestion.equipment} — {selectedSuggestion.problemCode}
                  </p>
                )}
              </div>

              <div>
                <Label>Description *</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  rows={3}
                  className="resize-none"
                />
              </div>

              {duplicateWarnings.length > 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Potential DUPLICATE WORK ORDERS may exist</p>
                    <p className="text-sm text-amber-700 mt-1">
                      {duplicateWarnings.length} open work order(s) at this location with similar problem type. Review before submitting.
                    </p>
                    <Link href={`/admin-portal/work-orders/${duplicateWarnings[0].id}`} className="text-sm text-amber-800 underline mt-1 inline-block">
                      View existing WO
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Troubleshooting */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Troubleshooting Tips</CardTitle>
              <p className="text-sm text-muted-foreground">
                {troubleshootingTip
                  ? `For ${selectedSuggestion?.problemType} / ${selectedSuggestion?.equipment}`
                  : 'No specific guide for this problem. You can still create the work order.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {troubleshootingTip ? (
                <>
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <Zap className="h-5 w-5" />
                    {troubleshootingTip.title}
                  </div>
                  {troubleshootingTip.imageHint === 'reset_test_outlet' && (
                    <div className="rounded-lg border bg-muted p-6 text-center">
                      <div className="inline-flex items-center justify-center w-24 h-16 rounded border-2 border-muted-foreground/30 bg-background">
                        <span className="text-xs font-bold text-muted-foreground">RESET</span>
                        <span className="mx-2 text-muted-foreground">|</span>
                        <span className="text-xs font-bold text-muted-foreground">TEST</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">GFCI outlet — press RESET to restore power</p>
                    </div>
                  )}
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    {troubleshootingTip.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-muted-foreground">Proceed to submit the work order.</p>
              )}
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setProblemSolved(true)} className="flex-1">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Problem Solved
                </Button>
                <Button onClick={() => { setProblemSolved(false); setStep(2); }} className="flex-1">
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Details & Submit */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Details & Submit</CardTitle>
              <p className="text-sm text-muted-foreground">NTE amount, weather, and optional service provider.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>NTE Amount (USD)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={nteAmount}
                    onChange={(e) => setNteAmount(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Weather Type</Label>
                  <select
                    value={weatherType}
                    onChange={(e) => setWeatherType(e.target.value)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Select...</option>
                    {WEATHER_TYPES.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <Label>Service Provider (optional)</Label>
                  <select
                    value={serviceProviderId}
                    onChange={(e) => setServiceProviderId(e.target.value)}
                    className="w-full border rounded-md p-2"
                  >
                    <option value="">Assign later</option>
                    {subcontractors.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName} {s.businessName ? `(${s.businessName})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={handleNext} loading={submitting} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Work Order'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
