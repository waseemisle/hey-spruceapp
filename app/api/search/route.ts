import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = [
  {
    name: 'workOrders',
    category: 'Work Orders',
    titleField: 'workOrderNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['status', 'category', 'clientName'],
    searchFields: ['workOrderNumber', 'title', 'description', 'status', 'category', 'clientName', 'locationName', 'assignedToName'],
    hrefFn: (id: string) => `/admin-portal/work-orders/${id}`,
  },
  {
    name: 'clients',
    category: 'Clients',
    titleField: 'fullName',
    titleFallbacks: ['email'],
    subtitleFields: ['email', 'phone', 'companyName'],
    searchFields: ['fullName', 'email', 'phone', 'companyName'],
    hrefFn: (id: string) => `/admin-portal/clients/${id}`,
  },
  {
    name: 'subcontractors',
    category: 'Subcontractors',
    titleField: 'fullName',
    titleFallbacks: ['email'],
    subtitleFields: ['businessName', 'email', 'phone'],
    searchFields: ['fullName', 'businessName', 'email', 'phone', 'trade', 'specialty'],
    hrefFn: (id: string) => `/admin-portal/subcontractors/${id}`,
  },
  {
    name: 'invoices',
    category: 'Invoices',
    titleField: 'invoiceNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['clientName', 'status'],
    searchFields: ['invoiceNumber', 'title', 'clientName', 'status'],
    hrefFn: (id: string) => `/admin-portal/invoices/${id}`,
  },
  {
    name: 'quotes',
    category: 'Quotes',
    titleField: 'quoteNumber',
    titleFallbacks: ['workOrderTitle'],
    subtitleFields: ['clientName', 'subcontractorName', 'status'],
    searchFields: ['quoteNumber', 'workOrderTitle', 'clientName', 'subcontractorName', 'workOrderNumber'],
    hrefFn: () => `/admin-portal/quotes`,
  },
  {
    name: 'locations',
    category: 'Locations',
    titleField: 'locationName',
    titleFallbacks: ['name', 'address'],
    subtitleFields: ['address', 'city', 'state'],
    searchFields: ['locationName', 'name', 'address', 'city', 'state', 'zip', 'clientName'],
    hrefFn: (id: string) => `/admin-portal/locations/${id}`,
  },
  {
    name: 'companies',
    category: 'Companies',
    titleField: 'name',
    titleFallbacks: [],
    subtitleFields: ['industry', 'city', 'state'],
    searchFields: ['name', 'industry', 'city', 'state', 'email', 'phone'],
    hrefFn: (id: string) => `/admin-portal/subsidiaries/${id}`,
  },
  {
    name: 'recurringWorkOrders',
    category: 'Recurring Work Orders',
    titleField: 'workOrderNumber',
    titleFallbacks: ['title'],
    subtitleFields: ['status', 'clientName'],
    searchFields: ['workOrderNumber', 'title', 'status', 'clientName', 'category', 'recurrencePatternLabel'],
    hrefFn: (id: string) => `/admin-portal/recurring-work-orders/${id}`,
  },
  {
    name: 'maint_requests',
    category: 'Maintenance Requests',
    titleField: 'title',
    titleFallbacks: [],
    subtitleFields: ['venue', 'requestor', 'status'],
    searchFields: ['title', 'description', 'venue', 'requestor', 'status', 'priority'],
    hrefFn: () => `/admin-portal/maint-requests`,
  },
  {
    name: 'categories',
    category: 'Categories',
    titleField: 'name',
    titleFallbacks: [],
    subtitleFields: ['description'],
    searchFields: ['name', 'description'],
    hrefFn: () => `/admin-portal/categories`,
  },
  {
    name: 'assets',
    category: 'Assets',
    titleField: 'name',
    titleFallbacks: ['serialNumber'],
    subtitleFields: ['type', 'status', 'location'],
    searchFields: ['name', 'serialNumber', 'type', 'status', 'location', 'description'],
    hrefFn: () => `/admin-portal/assets`,
  },
  {
    name: 'rfps',
    category: 'RFPs',
    titleField: 'title',
    titleFallbacks: ['rfpNumber'],
    subtitleFields: ['status', 'clientName'],
    searchFields: ['title', 'rfpNumber', 'status', 'clientName', 'description', 'category'],
    hrefFn: () => `/admin-portal/rfps`,
  },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const db = getFirestore(getAdminApp());
    const results: any[] = [];

    await Promise.allSettled(
      COLLECTIONS.map(async (cfg) => {
        try {
          const snap = await db.collection(cfg.name).get();
          snap.forEach((doc) => {
            const data = { id: doc.id, ...doc.data() };
            const searchText = [
              doc.id,
              ...cfg.searchFields.map((f) => (data as any)[f]),
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();

            if (!searchText.includes(q)) return;

            const title =
              (data as any)[cfg.titleField] ||
              cfg.titleFallbacks.map((f) => (data as any)[f]).find(Boolean) ||
              doc.id;

            const subtitle = cfg.subtitleFields
              .map((f) => (data as any)[f])
              .filter(Boolean)
              .join(' · ');

            results.push({
              id: doc.id,
              title,
              subtitle: subtitle || undefined,
              category: cfg.category,
              href: cfg.hrefFn(doc.id),
            });
          });
        } catch {
          // silently skip collections that fail
        }
      })
    );

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
