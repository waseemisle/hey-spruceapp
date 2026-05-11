/**
 * Unit tests for POST /api/work-orders/bidding-direct-invoice
 *
 * Tests the auth gating, company-flag gating, WO status gating,
 * and happy-path invoice/WO/bidding updates.
 */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetBearerUid = jest.fn<Promise<string | null>, []>();
jest.mock('@/lib/api-verify-firebase', () => ({
  getBearerUid: () => mockGetBearerUid(),
}));

const mockGetServerDb = jest.fn();
jest.mock('@/lib/firebase-server', () => ({
  getServerDb: () => mockGetServerDb(),
}));

jest.mock('@/lib/invoice-number', () => ({
  generateInvoiceNumber: () => 'INV-12345678',
}));

jest.mock('@/lib/bidding-eligibility', () => ({
  BIDDING_OPEN_STATUSES: new Set(['pending', 'approved', 'bidding', 'quotes_received']),
}));

// Firestore helpers — populated per-test via mockGetDoc / mockAddDoc / mockUpdateDoc
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetDoc = jest.fn<any, any[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAddDoc = jest.fn<any, any[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdateDoc = jest.fn<any, any[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDoc = jest.fn<any, any[]>((_, col, id) => ({ _col: col, _id: id }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCollection = jest.fn<any, any[]>();
const mockServerTimestamp = jest.fn(() => 'SERVER_TIMESTAMP');
const mockTimestampNow = jest.fn(() => 'TIMESTAMP_NOW');

jest.mock('firebase/firestore', () => ({
  doc: (...args: Parameters<typeof mockDoc>) => mockDoc(...args),
  getDoc: (...args: Parameters<typeof mockGetDoc>) => mockGetDoc(...args),
  addDoc: (...args: Parameters<typeof mockAddDoc>) => mockAddDoc(...args),
  updateDoc: (...args: Parameters<typeof mockUpdateDoc>) => mockUpdateDoc(...args),
  collection: (...args: Parameters<typeof mockCollection>) => mockCollection(...args),
  serverTimestamp: () => mockServerTimestamp(),
  Timestamp: { now: () => mockTimestampNow() },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: object, authHeader?: string): Request {
  return {
    headers: { get: (h: string) => (h === 'authorization' ? (authHeader ?? 'Bearer valid-token') : null) },
    json: async () => body,
  } as unknown as Request;
}

function makeSnap(exists: boolean, data?: object) {
  return { exists: () => exists, data: () => data ?? {} };
}

// ─── Import route under test (after mocks are wired) ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('@/app/api/work-orders/bidding-direct-invoice/route');

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUB_UID = 'sub-uid-123';
const BIDDING_ID = 'bidding-doc-1';
const WO_ID = 'wo-id-1';
const CLIENT_ID = 'client-id-1';
const COMPANY_ID = 'company-id-1';
const INVOICE_ID = 'invoice-id-1';

const validBody = {
  biddingWorkOrderId: BIDDING_ID,
  workOrderId: WO_ID,
  lineItems: [{ description: 'Labor', quantity: 1, unitPrice: 500, amount: 500 }],
  notes: 'Test invoice',
  totalAmount: 500,
  subName: 'Test Sub',
};

const biddingData = {
  subcontractorId: SUB_UID,
  status: 'pending',
  clientId: CLIENT_ID,
  clientName: 'Test Client',
  clientEmail: 'client@test.com',
  workOrderTitle: 'Test WO',
  workOrderDescription: 'Fix things',
  category: 'HVAC',
  priority: 'high',
};

const woData = {
  status: 'bidding',
  clientId: CLIENT_ID,
  clientName: 'Test Client',
  clientEmail: 'client@test.com',
  title: 'Test WO',
  description: 'Fix things',
  category: 'HVAC',
  priority: 'high',
  companyId: COMPANY_ID,
  timeline: [],
  systemInformation: {},
};

const companyData = {
  allowSubDirectInvoiceFromBidding: true,
  invoiceApprovalRequired: false,
};

const subData = { fullName: 'Test Sub', email: 'sub@test.com' };

function setupHappyPath() {
  mockGetBearerUid.mockResolvedValue(SUB_UID);
  mockGetServerDb.mockResolvedValue({});
  mockAddDoc.mockResolvedValue({ id: INVOICE_ID });
  mockUpdateDoc.mockResolvedValue(undefined);

  // getDoc calls in order:
  // 1. biddingWorkOrders doc
  // 2. workOrders doc
  // 3. companies doc (companyId already on WO, so no client lookup)
  // 4. subcontractors doc
  mockGetDoc
    .mockResolvedValueOnce(makeSnap(true, biddingData))  // biddingWorkOrders
    .mockResolvedValueOnce(makeSnap(true, woData))       // workOrders
    .mockResolvedValueOnce(makeSnap(true, companyData))  // companies
    .mockResolvedValueOnce(makeSnap(true, subData));     // subcontractors
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/work-orders/bidding-direct-invoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Auth gating ────────────────────────────────────────────────────────────

  it('returns 401 when no auth token provided', async () => {
    mockGetBearerUid.mockResolvedValue(null);
    const req = makeRequest(validBody, undefined);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it('returns 400 when biddingWorkOrderId is missing', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    const req = makeRequest({ ...validBody, biddingWorkOrderId: undefined });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when lineItems is empty', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    const req = makeRequest({ ...validBody, lineItems: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when totalAmount is zero', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    const req = makeRequest({ ...validBody, totalAmount: 0 });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── Bidding row gating ────────────────────────────────────────────────────

  it('returns 404 when biddingWorkOrders doc does not exist', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc.mockResolvedValueOnce(makeSnap(false)); // biddingWorkOrders missing
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('returns 403 when biddingWorkOrders doc belongs to a different sub', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc.mockResolvedValueOnce(makeSnap(true, { ...biddingData, subcontractorId: 'other-sub' }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('returns 409 when biddingWorkOrders status is not pending', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc.mockResolvedValueOnce(makeSnap(true, { ...biddingData, status: 'quoted' }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  // ── Work order status gating ──────────────────────────────────────────────

  it('returns 409 when work order status is assigned (closed)', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, { ...woData, status: 'assigned' }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 409 when work order is already assigned to a subcontractor', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, { ...woData, assignedTo: 'other-sub' }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  // ── Company flag gating ───────────────────────────────────────────────────

  it('returns 403 when company flag is false', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, woData))
      .mockResolvedValueOnce(makeSnap(true, { ...companyData, allowSubDirectInvoiceFromBidding: false }));
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/direct invoice is not enabled/i);
  });

  it('returns 403 when company flag is missing (default off)', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, woData))
      .mockResolvedValueOnce(makeSnap(true, { invoiceApprovalRequired: false })); // no flag
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(403);
  });

  it('resolves companyId from client doc when WO has no companyId', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockAddDoc.mockResolvedValue({ id: INVOICE_ID });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, { ...woData, companyId: undefined })) // no companyId on WO
      .mockResolvedValueOnce(makeSnap(true, { companyId: COMPANY_ID }))           // clients doc
      .mockResolvedValueOnce(makeSnap(true, companyData))                         // companies doc
      .mockResolvedValueOnce(makeSnap(true, subData));                            // subcontractors doc

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('creates invoice, updates WO to assigned, marks bidding row terminal on success', async () => {
    setupHappyPath();
    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.invoiceNumber).toBe('INV-12345678');
    expect(json.invoiceId).toBe(INVOICE_ID);

    // Invoice created
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const [, invoiceDoc] = mockAddDoc.mock.calls[0];
    expect(invoiceDoc.totalAmount).toBe(500);
    expect(invoiceDoc.status).toBe('sent'); // invoiceApprovalRequired=false
    expect(invoiceDoc.directInvoiceBypass).toBe(true);
    expect(invoiceDoc.creationSource).toBe('subcontractor_direct_invoice_bidding');

    // WO updated to assigned
    expect(mockUpdateDoc).toHaveBeenCalledTimes(2); // WO + biddingWorkOrders
    const [, woUpdates] = mockUpdateDoc.mock.calls[0];
    expect(woUpdates.status).toBe('assigned');
    expect(woUpdates.assignedSubcontractor).toBe(SUB_UID);
    expect(woUpdates.directInvoiceBypass).toBe(true);

    // Bidding row marked terminal
    const [, biddingUpdates] = mockUpdateDoc.mock.calls[1];
    expect(biddingUpdates.status).toBe('direct_invoice_submitted');
    expect(biddingUpdates.directInvoiceId).toBe(INVOICE_ID);
  });

  it('creates invoice with pending_approval status when invoiceApprovalRequired is true', async () => {
    mockGetBearerUid.mockResolvedValue(SUB_UID);
    mockGetServerDb.mockResolvedValue({});
    mockAddDoc.mockResolvedValue({ id: INVOICE_ID });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockGetDoc
      .mockResolvedValueOnce(makeSnap(true, biddingData))
      .mockResolvedValueOnce(makeSnap(true, woData))
      .mockResolvedValueOnce(makeSnap(true, { ...companyData, invoiceApprovalRequired: true }))
      .mockResolvedValueOnce(makeSnap(true, subData));

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);

    const [, invoiceDoc] = mockAddDoc.mock.calls[0];
    expect(invoiceDoc.status).toBe('pending_approval');
    expect(invoiceDoc.clientApprovalStatus).toBe('pending');
  });
});
