# Vendor Payment Flow — Implementation Prompt (Admin + Subcontractor Portal)

## Goal
Implement a **Vendor Payment** flow that lets **Admin** create and manage a payment record for a **Subcontractor** after a Work Order is **Completed** (or in **Pending Invoice**). The Vendor Payment record must be **attached to a Work Order**, be **admin-managed**, and be **visible on the subcontractor portal completed jobs experience** (the list at `app/subcontractor-portal/completed-jobs/page.tsx`).

This feature is for tracking what we owe / pay to the subcontractor based on the subcontractor’s quote amount, with admin-controlled adjustments (increase or decrease).

## Current system touchpoints (must integrate with existing patterns)
- **Work order statuses** already used in UI and logic:
  - `pending_invoice` and `completed` are treated as “completed work” on the subcontractor portal (see `isCompletedWorkOrder()` in `app/subcontractor-portal/completed-jobs/page.tsx`).
  - Admin work order detail page is `app/admin-portal/work-orders/[id]/page.tsx` and already loads related `quotes`, `invoices`, and `workOrderNotes`.
- **Subcontractor completed jobs list** is built from:
  - `assignedJobs` documents filtered by `subcontractorId == auth.uid`
  - then fetching `workOrders` by those `workOrderId`s
- **Firestore security** is defined in `firestore.rules`. You must add rules for vendor payments so:
  - Admin can create/update/read all vendor payments.
  - Subcontractor can read vendor payment(s) that are for work orders assigned to them (or otherwise explicitly linked to their `subcontractorId`).
  - Clients must not be able to read vendor payment records (unless explicitly required later—assume **NO**).

## Core requirements (functional)
### When can Vendor Payments be created?
- Admin can create Vendor Payment **only when** the Work Order status is:
  - `pending_invoice` **OR**
  - `completed`

### Relationship to Work Orders
- Each Vendor Payment must be linked to **exactly one Work Order**.
- A Work Order should have **0 or 1 active Vendor Payment** (default to **one-per-work-order** unless you add “history” explicitly; keep it simple).
- The Vendor Payment should be discoverable from both directions:
  - Query `vendorPayments` by `workOrderId`
  - Optionally store `vendorPaymentId` on `workOrders/{id}` for fast lookup (recommended for UI simplicity)

### Amount + adjustments (admin controlled)
- Vendor Payment starts from the subcontractor quote amount we received (the “base”):
  - Base amount should be taken from the Work Order’s approved/accepted quote if available; otherwise admin can enter it manually.
- Admin can **adjust** the vendor payment amount:
  - Increase by adding an adjustment amount
  - Decrease by subtracting an adjustment amount
- Adjustments must be auditable (store a list of changes with timestamps, who made them, and the reason).

### Visibility / who sees what
There is a conflict in requirements text (“only admin will see that” vs “attached on subcontractor portal”). Implement the following interpretation which satisfies both intents:
- **Admin portal**: full access (create/edit/view) to Vendor Payment including internal notes and full adjustment history.
- **Subcontractor portal completed jobs**: vendor payment is visible **as an attached record** on the completed job card, but in a **read-only** and **limited** view:
  - Show: vendor payment status + final amount (and optionally base amount)
  - Hide: internal/admin-only notes (if you add such a field)
  - Show adjustments only if you want transparency; otherwise show “Adjusted” badge without details (choose one and keep consistent).

### Subcontractor portal placement
- In `app/subcontractor-portal/completed-jobs/page.tsx`, for each completed work order card (e.g. `WO #WO-UOUONEBV`), show a “Vendor Payment” section/badge if one exists for that work order.
  - Example UI signals: “Vendor Payment: Created” / “Vendor Payment: Not created yet”
  - If created: show currency formatted amount.

## Data model (Firestore)
Create a new top-level collection: `vendorPayments`.

### Document shape: `vendorPayments/{vendorPaymentId}`
Use a shape consistent with existing docs (timestamps as Firestore `serverTimestamp()` values, and store denormalized fields for list rendering).

Required fields:
- `workOrderId` (string)
- `workOrderNumber` (string) — denormalize for easy display/audit
- `subcontractorId` (string) — auth uid stored on work order assignment (`assignedSubcontractor` or `assignedTo`, use the same id you use in `assignedJobs.subcontractorId`)
- `subcontractorName` (string) — denormalize
- `status` (string enum):
  - `draft` (optional if you want) OR start with `created`
  - `created`
  - `approved` (optional)
  - `paid` (optional)
  - Keep minimal if you want: `created` / `paid`
- `currency` (string, default `"USD"`)

Amounts:
- `baseAmount` (number) — amount received from subcontractor quote (the quote amount)
- `adjustments` (array) — list of objects, each:
  - `id` (string) — generate locally (e.g., `crypto.randomUUID()` in browser) or use Firestore auto id if stored as subcollection
  - `type` (`"increase"` | `"decrease"`)
  - `amount` (number, positive)
  - `reason` (string)
  - `createdAt` (timestamp)
  - `createdBy` (object: `{ uid, email, name, role: 'admin' }`)
- `adjustmentTotal` (number) — computed and stored (signed; increases positive, decreases negative)
- `finalAmount` (number) — computed and stored: `baseAmount + adjustmentTotal`

Audit fields:
- `createdAt` (timestamp)
- `createdBy` (object: `{ uid, email, name }` or a string id consistent with existing patterns)
- `updatedAt` (timestamp)
- `updatedBy` (object/string)

Optional fields (recommended):
- `internalNotes` (string) — admin-only
- `sourceQuoteId` (string | null) — link to the quote used as base

### Indexing
Ensure you can efficiently query:
- `vendorPayments` where `workOrderId == <id>`
- `vendorPayments` where `subcontractorId == <uid>` (if you choose to show vendor payments lists later)

If you use these queries with ordering, add Firestore indexes as needed.

## Business logic rules (must implement)
### Base amount selection (admin creation flow)
When admin clicks “Create Vendor Payment” for a work order:
- Determine candidate quote to use as base:
  - Prefer a quote that is `accepted` for that work order.
  - If multiple, prefer the one referenced by work order fields if they exist (admin work order code already does something similar for invoices).
- Base amount default:
  - Use quote’s `totalAmount` (or the correct field that represents subcontractor total).
  - Allow admin to override/edit base amount at creation time.

### Adjustment calculation
- Persist `adjustmentTotal` and `finalAmount` on every update so list views don’t have to re-sum.
- Validate:
  - `baseAmount >= 0`
  - each adjustment `amount > 0`
  - `finalAmount >= 0` (if a decrease makes it negative, block it unless you explicitly allow negative balances)

### One vendor payment per work order
At creation:
- Check if one already exists for `workOrderId`.
- If exists: do not create another; instead navigate to/view the existing record (or show a toast error).

## Admin portal UX (implementation requirements)
### Where to add it
In `app/admin-portal/work-orders/[id]/page.tsx`:
- Add a new tab: `Vendor Payment` (similar to `quotes` and `invoices`) **OR** add a card in “Overview” that shows Vendor Payment status with a primary CTA.

### Admin capabilities
- Create vendor payment (only when status is `pending_invoice` or `completed`)
- View vendor payment details
- Edit base amount (optional after creation; if allowed, it must re-compute final amount and create an audit event or overwrite with `updatedAt`)
- Add adjustments (+ / -) with reason
- Mark as Paid (optional, if you implement statuses)

### UI patterns
Follow the existing UI design system (buttons, cards, badges) used in admin pages.
- Use `sonner` toasts (already used).
- Use consistent money input validation.

## Subcontractor portal UX (implementation requirements)
In `app/subcontractor-portal/completed-jobs/page.tsx`:
- For each completed job card:
  - Load vendor payment (if any) for that work order.
  - Display a compact “Vendor Payment” block:
    - `Not created` state: subtle text
    - `Created/Paid` state: show badge + amount

### Data fetching approach (must be practical with Firestore limits)
The completed jobs page currently fetches many work orders by IDs using `where(documentId(), 'in', workOrderIds)`.
Vendor payments can be fetched similarly:
- Collect the displayed workOrderIds (filtered completed ones)
- Query `vendorPayments` with `where('workOrderId', 'in', [...])`
  - Respect Firestore `in` query limit (10/30 depending on SDK/version). If too many, chunk the queries.
- Map `vendorPayments` by `workOrderId` for rendering.

Do not make one query per card.

## Firestore Security Rules (must update)
Add a match block for `/vendorPayments/{vendorPaymentId}`.

Required access behavior:
- Admin:
  - read/write all vendor payments
- Subcontractor:
  - read vendor payments where `resource.data.subcontractorId == request.auth.uid`
  - (optional) also allow read if they are assigned on the work order, but the simplest is subcontractorId match
- Client:
  - no read

Write validation (minimum):
- Subcontractors/clients cannot write vendorPayments.
- Only admins can create/update/delete.

## Implementation checklist (what to build/change)
1. **Types**
   - Add `VendorPayment` type to `types/index.ts` (and any shared UI types if you have them).
2. **Firestore rules**
   - Add `/vendorPayments/{id}` rules as above.
3. **Admin UI**
   - Extend `app/admin-portal/work-orders/[id]/page.tsx`:
     - Load vendor payment for this work order (`where('workOrderId','==', id)`).
     - Render vendor payment section/tab.
     - Provide create flow with base amount selection and save.
     - Provide adjustment UI (increase/decrease + reason).
4. **Subcontractor UI**
   - Extend `app/subcontractor-portal/completed-jobs/page.tsx`:
     - Fetch vendor payments for the completed work orders in bulk.
     - Render vendor payment summary on each card.
5. **Computed fields**
   - Ensure `finalAmount` and `adjustmentTotal` always stay correct.
6. **Edge cases**
   - Work order has no subcontractor assigned → admin cannot create vendor payment (show why).
   - Work order is not completed/pending_invoice → block creation.
   - Quote missing → admin can still create vendor payment with manual base amount.
   - Multiple accepted quotes → choose deterministic preferred one, but allow admin override.
   - Vendor payment exists but subcontractorId changed (reassignment) → decide:
     - Either lock vendor payment subcontractorId at creation (recommended), and warn admin if WO assignment changes.

## Test plan (manual, minimum)
- As Admin:
  - Open a work order in `pending_invoice` → create vendor payment → verify it appears on WO.
  - Add an increase adjustment and a decrease adjustment → verify totals update correctly.
  - Try to create vendor payment on a non-completed WO → verify blocked.
- As Subcontractor:
  - Open `My Completed Jobs` → ensure the card for that WO shows vendor payment summary and amount.
  - Verify subcontractor cannot see admin-only notes (if implemented).
- Security:
  - Confirm clients can’t read `vendorPayments`.
  - Confirm subcontractor can only read vendorPayments where `subcontractorId` matches.

## Output expectation (definition of done)
- Admin can create and manage exactly one vendor payment per completed/pending-invoice work order.
- Vendor payment is attached to the work order and visible to admin.
- Subcontractor completed jobs list shows the attached vendor payment summary for each relevant work order.
- Firestore rules enforce access control (admin write, subcontractor read own, client none).

