# Comprehensive Requirements for HeySpruceApp Update

## Project Overview
This is a comprehensive update to the GroundOps app ? facility maintenance and work order management built with Next.js 14, Firebase, and TypeScript. The app manages work orders between companies, clients, subcontractors, and administrators.

## Current Technology Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Language**: TypeScript
- **UI**: Tailwind CSS, Radix UI components
- **Email**: Resend API
- **Payment**: Stripe

## Current Data Structure

### Collections in Firebase:
1. **companies** - Companies (formerly subsidiaries) with multiple locations
2. **locations** - Physical locations belonging to companies and clients
3. **clients** - Client users with email and company associations
4. **workOrders** - Work order requests and tracking
5. **quotes** - Quotes submitted by subcontractors
6. **subcontractors** - Subcontractor users
7. **invoices** - Invoices for completed work
8. **maint_requests** - Maintenance requests from external API
9. **biddingWorkOrders** - Work orders shared with subcontractors for bidding
10. **assignedJobs** - Jobs assigned to specific subcontractors
11. **notifications** - In-app notifications
12. **api_tokens** - API authentication tokens

---

## PART 1: Company & Location Structure

### 1.1 Company Structure (ALREADY IMPLEMENTED - VERIFY)
**Requirement**: Companies can have multiple locations.

**Example Scenario**:
- **Company**: Edgewood Company
  - LocationA (e.g., "Main Office")
  - LocationB (e.g., "Warehouse")
  - LocationC (e.g., "Retail Store")

**Current Implementation**:
- File: `app/admin-portal/subsidiaries/page.tsx` (now renamed to companies)
- Companies collection has fields: id, clientId, name, email, phone, notes, address
- Locations collection has: companyId, companyName fields

**Action Required**:  VERIFY this is working correctly. Ensure all references to "subsidiaries" are renamed to "companies" in the UI.

---

### 1.2 Client-Location Permission System (CRITICAL - NEW IMPLEMENTATION NEEDED)

**Requirement**: Each client user must be assigned specific locations under their company. Clients can only see work orders for their assigned locations.

**Example Scenario**:
```
Company: Edgewood Company

Assigned Clients:
- Sara (sara@ewood.com) ? LocationA only
- Mara (mara@ewood.com) ? LocationA only
- Tara (tara@ewood.com) ? LocationB only
- Nara (nara@ewood.com) ? LocationB only
- Kara (kara@ewood.com) ? LocationC only
- Lara (lara@ewood.com) ? LocationC only
- Para (para@ewood.com) ? LocationC AND LocationA (multiple locations)
```

**Current Issue**:
- Clients collection has `companyId` but NO location assignment field
- File: `types/index.ts` - Client interface has no `assignedLocations` field
- File: `app/admin-portal/clients/page.tsx` - No location assignment UI

**Implementation Required**:

1. **Update Client Data Model** (`types/index.ts`):
```typescript
export interface Client {
  uid: string;
  email: string;
  fullName: string;
  companyName?: string;
  companyId?: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected';
  assignedLocations?: string[]; // ? ADD THIS FIELD (array of location IDs)
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

2. **Update Client Management UI** (`app/admin-portal/clients/page.tsx`):
   - Add multi-select location picker in the create/edit client modal
   - Filter locations by the selected company
   - Allow admin to assign multiple locations to a single client
   - Display assigned locations in the client card

3. **Update Client Portal Work Orders** (`app/client-portal/work-orders/page.tsx`):
   - Filter work orders to show ONLY work orders where `workOrder.locationId` is in the client's `assignedLocations` array
   - Current query: `where('clientId', '==', currentUser.uid)`
   - New query: `where('locationId', 'in', clientAssignedLocations)`

4. **Update Client Portal Quotes** (`app/client-portal/quotes/page.tsx`):
   - Filter quotes to show ONLY quotes where the work order's location is in the client's assigned locations
   - This requires fetching work order data and checking location access

5. **Update Work Order Creation**:
   - When admin creates a work order for a location, the work order should be visible to ALL clients assigned to that location (not just one client)
   - Update `workOrders` data model to potentially have multiple `clientIds` or query by `locationId`

---

## PART 2: Client Account Lifecycle

### 2.1 Client Registration & Approval Process (CRITICAL FIX NEEDED)

**Current Flow**:
1. Admin creates client user (via `app/admin-portal/clients/page.tsx`)
2. Admin chooses company and sets status
3. System sends invitation email (via `/api/auth/create-user`)
4. Client receives email with registration link
5. Client sets password via set-password page

**Problem**:
- Client should NOT be able to login until admin approves
- After setting password, status should remain "pending" until admin explicitly approves

**Current Implementation Issues**:
- File: `app/api/auth/create-user/route.ts` - Creates user in Firebase Auth immediately
- File: `app/set-password/page.tsx` - Sets password but doesn't block login

**Required Implementation**:

1. **Update Registration Flow**:
   - When client sets password via `/set-password`, update Firestore document status but don't enable login
   - Add custom claim `approved: false` to Firebase Auth user
   - Show message: "Your account is pending approval. You'll receive an email once approved."

2. **Update Approval Flow** (`app/admin-portal/clients/page.tsx`):
   - When admin clicks "Approve" button:
     - Update Firestore: `status: 'approved'`, `approvedBy`, `approvedAt`
     - Update Firebase Auth custom claim: `approved: true`
     - Send email notification to client: "Your account has been approved. You can now login."

3. **Update Login Check** (`lib/auth-context.tsx` or login page):
   - Check if user has `approved: true` custom claim
   - If not approved, show error: "Your account is pending approval. Please contact admin."
   - Block access to client portal if not approved

4. **Location Assignment**:
   - Admin must assign at least one location before approving client
   - Add validation: Cannot approve client without assigned locations

---

## PART 3: Work Order System Information (CRITICAL - NEW FEATURE)

### 3.1 Work Order Timeline/System Information (Like NetSuite)

**Requirement**: Work orders should have complete audit trail similar to NetSuite Sales Orders. All actions should be tracked with timestamps and user information.

**Example Timeline**:
```
System Information for WO-702039:
-----------------------------------
 Created: 2025-01-15 10:30 AM by API Request
 Approved: 2025-01-15 11:00 AM by Admin (John Doe)
 Shared with Subcontractors: 2025-01-15 11:15 AM by Admin (John Doe)
  - Shared with: Mike's Plumbing, ABC Contractors, Quick Fix LLC
 Quotes Received: 3 quotes submitted
  - Quote #1: 2025-01-15 2:00 PM by Mike's Plumbing ($500)
  - Quote #2: 2025-01-15 3:30 PM by ABC Contractors ($450)
  - Quote #3: 2025-01-15 4:15 PM by Quick Fix LLC ($525)
 Quote Shared with Client: 2025-01-16 9:00 AM by Admin (John Doe)
  - Shared Quote: ABC Contractors - $450
 Quote Approved by Client: 2025-01-16 10:30 AM by Client (Sara Wilson)
 Assigned to Subcontractor: ABC Contractors
 Scheduled Service Date: 2025-01-20 at 2:00 PM
 Work Completed: 2025-01-20 5:00 PM by ABC Contractors
 Completion Notes: "Replaced main valve and tested system"
 Invoice Sent: 2025-01-20 6:00 PM
 Payment Received: 2025-01-22 3:00 PM
```

**Current Issue**:
- Work orders have basic fields like `createdAt`, `approvedAt`, `approvedBy` but NO comprehensive timeline
- No tracking of who shared quotes, which quotes were submitted, etc.

**Implementation Required**:

1. **Update WorkOrder Data Model** (`types/index.ts`):
```typescript
export interface WorkOrderTimelineEvent {
  id: string;
  timestamp: Date;
  type: 'created' | 'approved' | 'rejected' | 'shared_for_bidding' | 'quote_received' |
        'quote_shared_with_client' | 'quote_approved_by_client' | 'quote_rejected_by_client' |
        'assigned' | 'schedule_set' | 'schedule_shared' | 'started' | 'completed' |
        'invoice_sent' | 'payment_received';
  userId: string;
  userName: string;
  userRole: 'admin' | 'client' | 'subcontractor' | 'system';
  details: string;
  metadata?: Record<string, any>;
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  // ... existing fields ...
  timeline: WorkOrderTimelineEvent[]; // ? ADD THIS
  systemInformation: {
    createdBy: { id: string; name: string; role: string; timestamp: Date };
    approvedBy?: { id: string; name: string; timestamp: Date };
    rejectedBy?: { id: string; name: string; timestamp: Date; reason: string };
    sharedForBidding?: {
      by: { id: string; name: string };
      timestamp: Date;
      subcontractors: Array<{ id: string; name: string }>;
    };
    quotesReceived: Array<{
      quoteId: string;
      subcontractorId: string;
      subcontractorName: string;
      amount: number;
      timestamp: Date;
    }>;
    quoteSharedWithClient?: {
      quoteId: string;
      by: { id: string; name: string };
      timestamp: Date;
    };
    quoteApprovalByClient?: {
      quoteId: string;
      approvedBy: { id: string; name: string };
      timestamp: Date;
    };
    assignment?: {
      subcontractorId: string;
      subcontractorName: string;
      assignedBy: { id: string; name: string };
      timestamp: Date;
    };
    scheduledService?: {
      date: Date;
      time: string;
      setBy: { id: string; name: string };
      sharedWithClientAt?: Date;
    };
    completion?: {
      completedBy: { id: string; name: string };
      timestamp: Date;
      notes: string;
    };
    invoicing?: {
      sentAt: Date;
      sentBy: { id: string; name: string };
      paidAt?: Date;
    };
  };
}
```

2. **Create System Information Component** (`components/work-order-system-info.tsx`):
   - Display timeline in expandable/collapsible panel
   - Show events in chronological order
   - Use icons for different event types
   - Format similar to NetSuite with clean, professional layout

3. **Update All Work Order State Changes**:
   - File: `app/admin-portal/work-orders/page.tsx` - Add timeline events when:
     - Approving work order
     - Sharing for bidding
     - Assigning to subcontractor
   - File: `app/subcontractor-portal/bidding/page.tsx` - Add timeline event when quote submitted
   - File: `app/client-portal/quotes/page.tsx` - Add timeline event when client approves/rejects quote
   - File: `app/subcontractor-portal/assigned/page.tsx` - Add timeline event when work completed

4. **Update Work Order View** (`app/admin-portal/work-orders/[id]/page.tsx`):
   - Add "System Information" section (collapsible)
   - Display full timeline with all events
   - Show metadata for each event

---

## PART 4: Subcontractor Quote Submission

### 4.1 Subcontractor Must Select Time & Date (CRITICAL FIX)

**Requirement**: When subcontractor submits a quote, they MUST select a date and time they can perform the job.

**Current Implementation**:
- File: `app/subcontractor-portal/bidding/page.tsx`
- Quote form has `estimatedDuration` field (e.g., "2-3 days")
- NO specific date/time picker

**Issues**:
1. No `scheduledServiceDate` field in quote form
2. No `scheduledServiceTime` field in quote form

**Implementation Required**:

1. **Update Quote Data Model** (`types/index.ts`):
```typescript
export interface Quote {
  // ... existing fields ...
  proposedServiceDate: Date; // ? ADD THIS (date subcontractor can do the work)
  proposedServiceTime: string; // ? ADD THIS (time subcontractor can do the work)
  estimatedDuration: string;
  // ... rest of fields ...
}
```

2. **Update Quote Submission Form** (`app/subcontractor-portal/bidding/page.tsx`):
   - Add date picker for `proposedServiceDate` (required field)
   - Add time picker/input for `proposedServiceTime` (required field, format: "2:00 PM")
   - Update validation to require both fields
   - Update quote submission to include these fields

3. **Update Quote Display**:
   - Admin quotes page: Show proposed service date/time in quote cards
   - Client quotes page: Show proposed service date/time so client knows when work will be done
   - Quote comparison component: Include service date/time in comparison

4. **Update Work Order Assignment**:
   - When client approves a quote, automatically copy `proposedServiceDate` and `proposedServiceTime` to work order fields:
     - `scheduledServiceDate`
     - `scheduledServiceTime`

### 4.2 Email Notifications for Quote Submission

**Requirement**:
1. Admin receives email notification when subcontractor submits quote
2. Client receives email notification when subcontractor submits quote

**Current Implementation**:
- File: `app/subcontractor-portal/bidding/page.tsx`
- Calls `notifyQuoteSubmission()` for in-app notification
- NO email notification

**Implementation Required**:

1. **Create Email API Route** (`app/api/email/send-quote-notification/route.ts`):
   - Send email to admin when quote is submitted
   - Send email to client when quote is submitted
   - Include: work order number, subcontractor name, quote amount, proposed service date/time

2. **Update Quote Submission** (`app/subcontractor-portal/bidding/page.tsx`):
   - After creating quote in Firestore, call email API route
   - Send to both admin email and client email
   - Email should include:
     - Work Order Number
     - Work Order Title
     - Subcontractor Name
     - Quote Amount
     - Proposed Service Date & Time
     - Link to view quote in portal

3. **Email Template**:
```
Subject: New Quote Received for Work Order WO-702039

Hello [Admin/Client Name],

A new quote has been submitted for Work Order WO-702039.

Work Order: [Title]
Submitted by: [Subcontractor Name]
Quote Amount: $[Amount]
Proposed Service Date: [Date] at [Time]

View the full quote here: [Link to portal]

Best regards,
GroundOps Team
```

### 4.3 Subcontractor Email Notification When Work Order Shared

**Requirement**: When admin shares a work order with subcontractor for bidding, subcontractor should receive email notification.

**Current Implementation**:
- File: `app/admin-portal/work-orders/page.tsx` - `handleShareForBidding` function
- Calls `notifyBiddingOpportunity()` for in-app notification
- NO email notification

**Implementation Required**:

1. **Create Email Template** (`app/api/email/send-bidding-opportunity/route.ts`):
   - Subject: "New Bidding Opportunity: [Work Order Title]"
   - Include: work order details, location, client name, category, deadline (if any)
   - Link to bidding portal

2. **Update Share for Bidding** (`app/admin-portal/work-orders/page.tsx`):
   - After creating bidding work orders, send email to each selected subcontractor
   - Email should include work order details and link to submit quote

---

## PART 5: Maintenance Requests (API Integration)

### 5.1 Rename "Maint Request" to "Maintenance Requests"

**Current Implementation**:
- Navigation shows "Maint Requests"
- File: `app/admin-portal/maint-requests/page.tsx`

**Action Required**:  Simple UI text change
- Update all references to "Maint Request" ? "Maintenance Requests"
- Update navigation labels
- Update page titles
- Update button labels

### 5.2 Fix Date/Time Field for Maintenance Requests

**Requirement**: The date field being received is incorrect and needs fixing.

**Current Implementation**:
- File: `app/api/maint-requests/route.ts` - Receives `date` field
- Line 414: `date: new Date(date)` - Converts ISO string to Date

**Issue**: The user reports that "Time/date being received is incorrect currently (Date field)"

**Investigation Needed**:
1. Check what format the API is sending dates in
2. Verify timezone handling
3. Check how dates are displayed in the UI

**Implementation Required**:
1. **Update API Route** (`app/api/maint-requests/route.ts`):
   - Add logging to see what date format is being received
   - Add proper date validation and parsing
   - Handle different timezone scenarios
   - Ensure dates are stored in UTC and displayed in user's local timezone

2. **Update Display** (`app/admin-portal/maint-requests/page.tsx`):
   - Line 307: Currently uses `request.date?.toDate ? request.date.toDate().toLocaleDateString() : new Date(request.date).toLocaleDateString()`
   - Ensure consistent date formatting
   - Show both date and time (not just date)

### 5.3 Admin Email & In-App Notification for New Maint Request

**Requirement**: When a new maintenance request arrives via API, admin should receive:
1. Email notification
2. In-app notification

**Current Implementation**:
- File: `app/api/maint-requests/route.ts` - Creates document in Firestore
- NO email notification
- NO in-app notification

**Implementation Required**:

1. **Create Admin Notification Function** (`lib/notifications.ts`):
```typescript
export async function notifyAdminOfNewMaintRequest(
  maintRequestId: string,
  venue: string,
  title: string,
  priority: string
) {
  // Get all admin users
  const adminsSnapshot = await getDocs(
    query(collection(db, 'admins'))
  );

  // Create in-app notification for each admin
  const notificationPromises = adminsSnapshot.docs.map(async (adminDoc) => {
    await addDoc(collection(db, 'notifications'), {
      userId: adminDoc.id,
      userRole: 'admin',
      type: 'general',
      title: `New Maintenance Request: ${priority.toUpperCase()}`,
      message: `New maintenance request for ${venue}: ${title}`,
      link: `/admin-portal/maint-requests`,
      read: false,
      referenceId: maintRequestId,
      referenceType: 'maintRequest',
      createdAt: serverTimestamp(),
    });
  });

  await Promise.all(notificationPromises);
}
```

2. **Create Email API Route** (`app/api/email/send-maint-request-notification/route.ts`):
```typescript
// Send email to all admins when new maint request arrives
// Include: venue, requestor, date, title, description, priority, link to view
```

3. **Update Maint Request API** (`app/api/maint-requests/route.ts`):
   - After creating document (line 425), add:
```typescript
// Send notifications
await notifyAdminOfNewMaintRequest(
  docRef.id,
  maintRequestData.venue,
  maintRequestData.title,
  maintRequestData.priority
);

// Send email to all admins
await fetch('/api/email/send-maint-request-notification', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    maintRequestId: docRef.id,
    venue: maintRequestData.venue,
    requestor: maintRequestData.requestor,
    title: maintRequestData.title,
    description: maintRequestData.description,
    priority: maintRequestData.priority,
    date: maintRequestData.date,
  }),
});
```

### 5.4 Auto-Create Work Order from Maint Request (CRITICAL NEW FEATURE)

**Requirement**: When maintenance request arrives via API:
1. System should automatically create a Work Order
2. Work Order status should be "Pending"
3. Work Order should be visible to all clients assigned to that location
4. If location doesn't exist, create it automatically
5. Admin reviews and approves work order
6. After admin approval, work order becomes visible to assigned clients

**Current Flow**:
- Maint request arrives ? Stored in `maint_requests` collection
- Admin manually views in maint requests page
- Admin manually creates work order separately

**New Flow Required**:
- Maint request arrives ? Auto-create work order ? Status: "Pending"
- Auto-create location if doesn't exist
- Admin sees work order in pending work orders
- Admin approves work order
- All clients assigned to that location can now see the work order

**Implementation Required**:

1. **Update Maint Request API** (`app/api/maint-requests/route.ts`):

After creating maint request document (line 425), add:

```typescript
// Auto-create work order from maint request
try {
  // Find or create location
  let locationId = '';
  let locationName = maintRequestData.venue;

  // Search for existing location by name
  const locationsQuery = query(
    collection(db, 'locations'),
    where('locationName', '==', locationName)
  );
  const locationsSnapshot = await getDocs(locationsQuery);

  if (!locationsSnapshot.empty) {
    // Location exists
    locationId = locationsSnapshot.docs[0].id;
  } else {
    // Location doesn't exist - create it automatically
    const newLocationRef = await addDoc(collection(db, 'locations'), {
      locationName: locationName,
      clientId: '', // No specific client (accessible to all)
      clientName: 'Auto-Generated',
      clientEmail: '',
      companyId: '', // Can be set later by admin
      companyName: '',
      address: {
        street: '',
        city: '',
        state: '',
        zip: '',
        country: 'USA',
      },
      propertyType: '',
      contactPerson: maintRequestData.requestor,
      contactPhone: '',
      status: 'approved', // Auto-approve for API-generated locations
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    locationId = newLocationRef.id;
  }

  // Create work order
  const workOrderNumber = `WO-${Date.now().toString().slice(-8).toUpperCase()}`;

  await addDoc(collection(db, 'workOrders'), {
    workOrderNumber,
    clientId: '', // Not assigned to specific client initially
    clientName: maintRequestData.requestor,
    clientEmail: '',
    locationId: locationId,
    locationName: locationName,
    locationAddress: locationName, // Can be updated later
    title: maintRequestData.title,
    description: maintRequestData.description,
    category: 'General Maintenance', // Default category
    priority: maintRequestData.priority,
    status: 'pending', // Waiting for admin approval
    images: maintRequestData.image ? [maintRequestData.image] : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: 'API',
    createdViaAPI: true, // Flag to identify API-created work orders
    originalMaintRequestId: docRef.id, // Link back to maint request
    timeline: [{
      id: generateId(),
      timestamp: serverTimestamp(),
      type: 'created',
      userId: 'system',
      userName: 'Automated System',
      userRole: 'system',
      details: `Work order created automatically from maintenance request for ${locationName}`,
      metadata: {
        source: 'maintenance_request_api',
        maintRequestId: docRef.id,
      }
    }],
  });

} catch (error) {
  console.error('Error auto-creating work order from maint request:', error);
  // Don't fail the whole request if work order creation fails
}
```

2. **Update Work Order Visibility** (`app/client-portal/work-orders/page.tsx`):

Current query:
```typescript
where('clientId', '==', currentUser.uid)
```

New query (filter by assigned locations):
```typescript
// Get client's assigned locations
const clientDoc = await getDoc(doc(db, 'clients', currentUser.uid));
const assignedLocations = clientDoc.data()?.assignedLocations || [];

// Query work orders by location
where('locationId', 'in', assignedLocations)
```

3. **Update Work Order Approval**:
   - When admin approves a work order created from API:
     - Add timeline event: "Approved by Admin [Name] on [Date]"
     - Update status to 'approved'
     - Send notification to all clients assigned to that location

### 5.5 Track Approving User in Work Order System Information

**Requirement**: Store which user (admin or client) approved the work order in system information.

**Current Implementation**:
- File: `app/admin-portal/work-orders/page.tsx` - Line 194: `approvedBy: currentUser.uid`
- Only stores user ID, not full user details

**Implementation Required**:
1. When admin approves: Store admin name and role
2. When client approves: Store client name and role
3. Display in system information timeline
4. Add to `systemInformation.approvedBy` object with `{ id, name, role, timestamp }`

---

## PART 6: Client Portal Fixes

### 6.1 Fix Quotes Page Loading Issue (CRITICAL BUG)

**Requirement**: Quotes page on client portal (/client-portal/quotes) is stuck on "Loading" and not working.

**Current Implementation**:
- File: `app/client-portal/quotes/page.tsx`
- Line 64-68: Query with `.where('status', 'in', ['sent_to_client', 'accepted', 'rejected'])`

**Potential Issues**:
1. Firestore composite index might be missing for this query
2. Query might be returning no results and not handling empty state properly
3. `onSnapshot` listener might be failing

**Investigation Required**:
1. Check browser console for errors
2. Check Firestore indexes
3. Check if query is actually executing

**Implementation Required**:
1. Add error handling to onSnapshot
2. Add console logging to debug
3. Fix Firestore index if needed
4. Ensure loading state is set to false even on error:

```typescript
const unsubscribe = onSnapshot(
  quotesQuery,
  (snapshot) => {
    const quotesData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Quote[];
    setQuotes(quotesData);
    setLoading(false);
  },
  (error) => {
    console.error('Error fetching quotes:', error);
    setLoading(false); // ? ADD THIS
    toast.error('Failed to load quotes');
  }
);
```

5. Verify that quotes have `status: 'sent_to_client'` set when admin shares with client

### 6.2 Work Order Price Display Fix

**Requirement**: Work order WO-702039 shows "price" incorrectly.

**Investigation Needed**:
1. Check where price is displayed
2. Identify what field is being used (`estimateBudget`, `totalAmount`, etc.)
3. Verify data in Firestore for WO-702039

**Likely Files**:
- `app/client-portal/work-orders/page.tsx`
- `app/client-portal/work-orders/[id]/page.tsx`
- `app/admin-portal/work-orders/[id]/page.tsx`

**Action Required**:
1. Find all places where price/amount is displayed for work orders
2. Ensure correct field is being used
3. Format currency correctly: `$${amount.toLocaleString()}`
4. Handle null/undefined values

---

## TESTING REQUIREMENTS

### Test Scenarios to Verify

After implementing all changes, thoroughly test the following scenarios:

#### Test 1: Company & Location Structure
1. Create a company "Edgewood"
2. Create 3 locations: LocationA, LocationB, LocationC
3. Verify locations are linked to company

#### Test 2: Client-Location Permissions
1. Create client Sara assigned to LocationA only
2. Create client Para assigned to LocationA AND LocationC
3. Create work order for LocationA
4. Login as Sara ? should see work order
5. Create work order for LocationB
6. Login as Sara ? should NOT see work order
7. Login as Para ? should see LocationA work order but NOT LocationB

#### Test 3: Client Approval Workflow
1. Admin creates new client with email
2. Client receives invitation email
3. Client sets password
4. Client attempts to login ? Should be blocked (pending approval)
5. Admin approves client
6. Client receives approval email
7. Client logs in successfully

#### Test 4: Subcontractor Quote with Date/Time
1. Admin shares work order with subcontractor
2. Subcontractor receives email notification
3. Subcontractor submits quote with date "Jan 25, 2025" and time "2:00 PM"
4. Admin receives email notification
5. Client receives email notification
6. Quote shows proposed service date/time correctly

#### Test 5: Maintenance Request Auto-Create Work Order
1. Send API POST request to `/api/maint-requests` with venue "TestVenue"
2. Verify maint request created
3. Verify work order auto-created with status "pending"
4. Verify location "TestVenue" auto-created if didn't exist
5. Admin receives email + in-app notification
6. Admin approves work order
7. Work order visible to all clients assigned to TestVenue location

#### Test 6: Work Order System Information
1. Create work order
2. Approve work order ? Check timeline shows "Approved by [Admin Name]"
3. Share for bidding ? Check timeline shows "Shared with [Subcontractor Names]"
4. Subcontractor submits quote ? Check timeline shows "Quote received from [Name] - $[Amount]"
5. Admin shares quote with client ? Check timeline
6. Client approves quote ? Check timeline shows "Approved by [Client Name]"
7. Assigned to subcontractor ? Check timeline
8. Work completed ? Check timeline
9. Invoice sent ? Check timeline
10. Payment received ? Check timeline

#### Test 7: Client Portal Quotes Page
1. Login as client
2. Navigate to /client-portal/quotes
3. Page should load without getting stuck
4. Should show quotes that were sent to client
5. Should be able to approve/reject quotes

#### Test 8: Email Notifications
1. Verify emails sent for:
   - Client invitation
   - Client approval
   - New maint request (to admin)
   - Subcontractor bidding opportunity
   - Quote submission (to admin and client)
   - Work order approval (to client)
   - Invoice sent (to client)

---

## PRIORITY ORDER FOR IMPLEMENTATION

### Phase 1: Critical Fixes (Do These First)
1.  Fix client portal quotes page loading issue
2.  Implement client-location permission system
3.  Fix client approval workflow (can't login until approved)
4.  Add date/time fields to subcontractor quote submission

### Phase 2: Core Features
5.  Implement work order system information/timeline tracking
6.  Auto-create work order from maintenance request
7.  Auto-create location if doesn't exist
8.  Email notifications for quote submission (admin + client)
9.  Email notification when work order shared with subcontractor

### Phase 3: Enhancements
10.  Admin email + in-app notification for new maint request
11.  Fix date/time handling for maint requests
12.  Rename "Maint Request" to "Maintenance Requests"
13.  Fix work order price display issue
14.  Verify company/location structure working correctly

### Phase 4: Testing & Polish
15.  Run all test scenarios
16.  Fix any bugs found during testing
17.  Update UI/UX as needed
18.  Ensure all timeline events are captured
19.  Verify all email notifications working
20.  Performance testing with multiple users/locations

---

## IMPORTANT NOTES FOR AI AGENT

1. **Preserve Existing Functionality**: Do NOT break existing features. Only add/modify what's specified.

2. **Type Safety**: All new code must use TypeScript with proper types. Update `types/index.ts` for any new data structures.

3. **Error Handling**: Add try-catch blocks for all async operations. Show user-friendly error messages.

4. **Firestore Indexes**: After implementation, check Firestore console for any missing index errors and create them.

5. **Email Templates**: Use consistent branding and formatting for all emails. Use Resend API (already configured).

6. **Timeline Events**: EVERY state change in work order should add a timeline event. Don't miss any.

7. **Security Rules**: Ensure Firestore security rules are updated to enforce:
   - Clients can only see work orders for their assigned locations
   - Clients can't approve their own account
   - API tokens required for maint request API

8. **Testing**: Test each feature thoroughly before moving to next. Use Firebase Emulator if possible.

9. **Code Quality**:
   - Follow existing code patterns
   - Use existing UI components from `components/ui/`
   - Maintain consistent formatting
   - Add comments for complex logic

10. **Migration**: If changing data model, create migration script to update existing records.

---

## FILES THAT WILL NEED CHANGES

### Data Models
- `types/index.ts` - Add new fields to interfaces

### Admin Portal
- `app/admin-portal/clients/page.tsx` - Add location assignment UI
- `app/admin-portal/work-orders/page.tsx` - Add timeline tracking
- `app/admin-portal/work-orders/[id]/page.tsx` - Add system information display
- `app/admin-portal/maint-requests/page.tsx` - UI text changes
- `app/admin-portal/locations/page.tsx` - Verify functionality

### Client Portal
- `app/client-portal/work-orders/page.tsx` - Filter by assigned locations
- `app/client-portal/quotes/page.tsx` - Fix loading issue, filter by location
- `app/client-portal/work-orders/[id]/page.tsx` - Fix price display

### Subcontractor Portal
- `app/subcontractor-portal/bidding/page.tsx` - Add date/time picker to quote form

### API Routes
- `app/api/maint-requests/route.ts` - Auto-create work order, notifications
- `app/api/auth/create-user/route.ts` - Fix approval workflow
- `app/api/email/send-quote-notification/route.ts` - NEW FILE
- `app/api/email/send-maint-request-notification/route.ts` - NEW FILE
- `app/api/email/send-bidding-opportunity/route.ts` - NEW FILE
- `app/api/email/send-client-approval/route.ts` - NEW FILE

### Libraries
- `lib/notifications.ts` - Add new notification functions
- `lib/auth-context.tsx` - Add approval check on login

### Components
- `components/work-order-system-info.tsx` - NEW FILE (system information component)
- `components/admin-layout.tsx` - Update navigation label
- `components/client-layout.tsx` - Update navigation label

### Authentication
- `app/set-password/page.tsx` - Update to not enable login until approved
- `app/portal-login/page.tsx` - Add approval check

---

## SUCCESS CRITERIA

The implementation is complete when:

 All clients can only see work orders for their assigned locations
 Clients cannot login until admin approves them
 Work orders have complete timeline/system information (like NetSuite)
 Maintenance requests auto-create work orders and locations
 Admin receives email + in-app notification for new maint requests
 Subcontractors must specify date/time when submitting quotes
 Email notifications sent for quote submission (admin + client)
 Email notifications sent when work order shared with subcontractor
 Client portal quotes page loads without issues
 All test scenarios pass successfully
 No existing functionality is broken

---

## FINAL CHECKLIST

Before considering implementation complete:

- [ ] All Phase 1 (Critical Fixes) items completed
- [ ] All Phase 2 (Core Features) items completed
- [ ] All Phase 3 (Enhancements) items completed
- [ ] All 8 test scenarios pass
- [ ] All email notifications working
- [ ] All in-app notifications working
- [ ] Timeline tracking works for all events
- [ ] Location-based permissions working correctly
- [ ] Client approval workflow working correctly
- [ ] No console errors in browser
- [ ] No errors in Firebase logs
- [ ] Firestore indexes created
- [ ] Code reviewed for security issues
- [ ] UI is responsive and looks good
- [ ] All TypeScript types are correct
- [ ] Documentation updated

---

**GOOD LUCK! This is a comprehensive update. Take it step by step, test thoroughly, and don't hesitate to ask questions if requirements are unclear.**
