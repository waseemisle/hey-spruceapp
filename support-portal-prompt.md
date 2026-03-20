# Support Portal — Full Implementation Prompt

## Context & System Overview

This is a Next.js 14 App Router application with:
- **Firebase** (Firestore + Auth + Storage) as primary database
- **Supabase** PostgreSQL as backup/sync target
- **Resend** for email delivery
- **shadcn/ui** + Tailwind CSS for UI
- **Three portals**: `admin-portal`, `client-portal`, `subcontractor-portal`
- **Email logging** via `lib/email-logger.ts` → Firestore `emailLogs` collection
- **In-app notifications** via `lib/notifications.ts` → Firestore `notifications` collection
- **Real-time updates** via Firestore `onSnapshot()` listeners
- **Email templates** via `lib/email-template.ts` (dark navy header + beige body)
- **Supabase sync** via `app/api/sync/firebase-to-supabase/route.ts` — all new Firestore collections must be added to the 21-collection sync list

---

## Feature: Support Ticket Portal (JIRA-style)

Build a complete support ticket system accessible across all three portals with role-based permissions.

---

## 1. Firestore Data Model

### Collection: `supportTickets`

Each document ID format: `TKT-{8-digit-number}` (zero-padded, auto-incremented, same pattern as `MR-` IDs in maint_requests)

```typescript
interface SupportTicket {
  id: string;                          // TKT-00000001
  ticketNumber: string;                // same as id, for display
  title: string;                       // Short summary (max 120 chars)
  description: string;                 // Full markdown-supported description

  // Classification
  category: 'billing' | 'technical' | 'work-order' | 'account' | 'general' | 'bug-report' | 'feature-request';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'waiting-on-client' | 'waiting-on-admin' | 'resolved' | 'closed';
  type: 'question' | 'problem' | 'task' | 'incident';

  // Submitter info
  submittedBy: string;                 // Firebase UID
  submittedByName: string;
  submittedByEmail: string;
  submittedByRole: 'admin' | 'client' | 'subcontractor';

  // Client/Subcontractor context (if applicable)
  clientId?: string;
  clientName?: string;
  subcontractorId?: string;
  subcontractorName?: string;

  // Related entity links (optional, for cross-referencing)
  relatedWorkOrderId?: string;
  relatedWorkOrderNumber?: string;
  relatedInvoiceId?: string;
  relatedInvoiceNumber?: string;
  relatedQuoteId?: string;

  // Assignment
  assignedTo?: string;                 // Admin UID
  assignedToName?: string;
  assignedAt?: Timestamp;

  // SLA / Timing
  dueDate?: Timestamp;
  resolvedAt?: Timestamp;
  closedAt?: Timestamp;
  firstResponseAt?: Timestamp;        // Timestamp of first admin reply

  // Attachments
  attachments: {
    id: string;
    fileName: string;
    fileUrl: string;                   // Cloudinary URL
    fileType: string;                  // mime type
    fileSize: number;                  // bytes
    uploadedBy: string;                // UID
    uploadedAt: Timestamp;
  }[];

  // Tags
  tags: string[];

  // Metrics
  commentCount: number;
  lastActivityAt: Timestamp;

  // Internal admin notes (NOT visible to clients/subcontractors)
  internalNotes?: string;

  // Timeline / audit trail (same pattern as workOrders.timeline)
  timeline: {
    id: string;
    timestamp: Timestamp;
    type: 'created' | 'status-changed' | 'priority-changed' | 'assigned' | 'comment-added' | 'attachment-added' | 'resolved' | 'closed' | 'reopened';
    userId: string;
    userName: string;
    userRole: 'admin' | 'client' | 'subcontractor';
    details: string;                   // Human-readable description
    metadata?: Record<string, any>;   // e.g. { fromStatus: 'open', toStatus: 'in-progress' }
  }[];

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Sub-collection: `supportTickets/{ticketId}/comments`

```typescript
interface TicketComment {
  id: string;
  ticketId: string;
  body: string;                        // Markdown-supported
  isInternal: boolean;                 // true = admin-only visibility
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorRole: 'admin' | 'client' | 'subcontractor';
  authorAvatarInitials: string;        // e.g. "JD"
  attachments: {
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
  }[];
  editedAt?: Timestamp;
  createdAt: Timestamp;
}
```

### Firestore Counter Document: `counters/supportTickets`

```typescript
{ count: number }  // Increment atomically on each new ticket
```

---

## 2. Supabase Sync

In `app/api/sync/firebase-to-supabase/route.ts`, add `'supportTickets'` to the existing array of 21 collections being synced. The existing `firestore_backup` table (with `collection_name`, `doc_id`, `data` JSONB columns) will handle it automatically — no schema changes needed.

Also add to `scripts/supabase-setup.sql` a comment block documenting the new collection.

---

## 3. API Routes

### `POST /api/support-tickets/create`

- Auth: any logged-in user (admin, client, subcontractor)
- Body: `{ title, description, category, priority, type, relatedWorkOrderId?, relatedInvoiceId?, relatedQuoteId?, tags?, attachments? }`
- Actions:
  1. Atomically increment `counters/supportTickets` counter
  2. Generate ticket ID `TKT-{8-digit-padded-count}`
  3. Create Firestore document in `supportTickets`
  4. Create initial timeline event `'created'`
  5. Create in-app notifications for all admins (use `getAllAdminUserIds()` from `lib/notifications.ts`)
  6. Send email notifications to all admins with `supportTicketEmailNotifications !== false`
  7. Log each email to Firestore `emailLogs` with type `'support-ticket-notification'`
- Response: `{ success: true, ticketId, ticketNumber }`

### `POST /api/support-tickets/comment`

- Auth: any logged-in user; `isInternal` flag only settable by admins
- Body: `{ ticketId, body, isInternal?, attachments? }`
- Actions:
  1. Add comment to sub-collection `supportTickets/{ticketId}/comments`
  2. Increment `supportTickets/{ticketId}.commentCount`
  3. Update `lastActivityAt` and `updatedAt`
  4. Append timeline event `'comment-added'`
  5. If commenter is admin and `firstResponseAt` is null, set it now
  6. Notify ticket submitter via email (if commenter is admin and comment is not internal)
  7. Notify admins if submitter is replying to their own ticket
  8. Log emails to `emailLogs`

### `POST /api/support-tickets/update-status`

- Auth: admin only
- Body: `{ ticketId, status, internalNotes? }`
- Actions:
  1. Update status field + `resolvedAt`/`closedAt` if applicable
  2. Append timeline event `'status-changed'` with `fromStatus`/`toStatus` in metadata
  3. Update `updatedAt`, `lastActivityAt`
  4. Email submitter of status change (non-internal)
  5. Log email

### `POST /api/support-tickets/assign`

- Auth: admin only
- Body: `{ ticketId, assignedTo, assignedToName }`
- Actions:
  1. Update assignment fields + `assignedAt`
  2. Append timeline event `'assigned'`
  3. Send in-app notification to assigned admin
  4. Email assigned admin

### `POST /api/email/send-support-ticket-notification`

- Same pattern as `send-work-order-notification/route.ts`
- Body: `{ ticketId, ticketNumber, title, submittedByName, submittedByRole, category, priority, type, description }`
- Fetches all admins where `supportTicketEmailNotifications !== false`
- Sends sequentially with 600ms delay (Resend rate limit)
- Logs each attempt to `emailLogs`
- Returns `{ success, sent, failed }`

---

## 4. Email Template Content

Use existing `lib/email-template.ts` helpers. For the new ticket notification email:
- Header: "New Support Ticket Submitted"
- `infoCard()` with `infoRow()` entries for: Ticket #, Title, Submitted By, Role, Category, Type, Priority, Description
- `priorityBadge()` for the priority field
- `ctaButton()` linking to `${process.env.NEXT_PUBLIC_APP_URL}/admin-portal/support-tickets/${ticketId}`
- `alertBox()` with info styling: "A new support ticket has been submitted and requires your attention."
- For status-change emails: show old status → new status with an arrow
- For comment notification emails: include the comment body text truncated to 300 chars

Add email types to the type union in `lib/email-logger.ts`:
- `'support-ticket-notification'`
- `'support-ticket-comment'`
- `'support-ticket-status-change'`

---

## 5. Admin Portal Pages

### `/admin-portal/support-tickets` — Ticket List Page

Layout: `AdminLayout` wrapper (same as all other admin pages).

**Stats cards** at top (4 cards):
- Total Open Tickets
- Urgent/High Priority
- Unassigned Tickets
- Resolved This Month

**Filters bar** (horizontal, above the table):
- Search input: searches ticket number, title, submitter name
- Status filter dropdown: All / Open / In Progress / Waiting on Client / Waiting on Admin / Resolved / Closed
- Priority filter: All / Low / Medium / High / Urgent
- Category filter: All / Billing / Technical / Work Order / Account / General / Bug Report / Feature Request
- Assigned To filter: All / Unassigned / [list of admin names]
- Submitted By Role: All / Client / Subcontractor / Admin
- Date Range: from/to date pickers
- "Clear Filters" button

**Ticket Table** (same pattern as work orders list):
- Columns: Ticket #, Title, Submitted By (name + role badge), Category, Priority badge, Status badge, Assigned To, Last Activity, Comments count, Actions
- Clicking a row navigates to `/admin-portal/support-tickets/[id]`
- Pagination (same controls: ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight), 25 items per page

**Status badge colors:**
- `open` → blue
- `in-progress` → yellow/amber
- `waiting-on-client` → orange
- `waiting-on-admin` → purple
- `resolved` → green
- `closed` → gray

**Priority badge colors:**
- `urgent` → red
- `high` → orange
- `medium` → yellow
- `low` → blue/gray

**"New Ticket" button** in top-right → opens a dialog/sheet to create a ticket on behalf of a user.

---

### `/admin-portal/support-tickets/[id]` — Ticket Detail Page (JIRA-style)

Split-pane layout:

**Left column (2/3 width):**
- Ticket title (editable inline by admin, h1 style)
- Description (Markdown rendered, editable by admin)
- Tab bar: "Comments" | "Activity" | "Attachments"

**Comments tab:**
- Thread of comments sorted oldest-first
- Each comment card shows: avatar (initials circle), author name, role badge, timestamp, comment body (markdown rendered)
- Internal notes: shown with yellow/amber background and "Internal Note" badge — only visible to admins
- "Add Comment" form at bottom:
  - Textarea (markdown support)
  - "Internal Note" toggle (admin only)
  - File attachment upload
  - Submit button

**Activity tab:**
- Full timeline of events (same pattern as work orders timeline)
- Each event: icon + text + timestamp + user name
- Events: created, status changed, priority changed, assigned, comment added, attachment added, resolved, closed, reopened

**Attachments tab:**
- Grid of uploaded files
- Thumbnail for images, file icon for others
- File name, size, uploader, upload date
- Download link

**Right column (1/3 width) — sidebar metadata:**
- Status selector (dropdown, admin can change)
- Priority selector (admin can change)
- Type badge
- Category badge
- Assigned To (searchable dropdown of admin users, admin can reassign)
- Due Date picker (admin can set)
- "Submitter" section: name, email, role badge, link to their profile
- "Related Entities" section: links to work order / invoice / quote if set
- "SLA / Timing" section: Created At, First Response, Resolved At, Time to Resolution
- Tags (display as chips, admin can add/remove)
- "Internal Notes" textarea (admin-only, not shown in activity)
- "Close Ticket" button → sets status to 'closed'
- "Reopen Ticket" button (if resolved/closed)

---

## 6. Client Portal Pages

### `/client-portal/support-tickets` — Client Ticket List

- Show only tickets where `submittedBy === currentUser.uid` OR `clientId === currentUser.uid`
- Filters: Status filter, Search, Date range
- Table columns: Ticket #, Title, Category, Priority, Status, Last Update, Comments
- "Create New Ticket" button prominent at top-right
- Stats: Open Tickets, Resolved Tickets

### `/client-portal/support-tickets/[id]` — Client Ticket Detail

Same split layout but restricted:
- Cannot see internal comments (`isInternal === false` only)
- Cannot change status, priority, or assignment
- Can add comments (non-internal only)
- Can upload attachments
- Can see full activity timeline (excluding internal notes events)
- Read-only metadata sidebar: status, priority, assigned to (name only), category

### Create Ticket Dialog/Sheet (client portal)

Form fields:
- Title (required, text input)
- Description (required, textarea with markdown hint)
- Category (required, select: Billing / Technical / Work Order / Account / General / Bug Report / Feature Request)
- Priority (required, select: Low / Medium / High / Urgent)
- Type (required, select: Question / Problem / Task / Incident)
- Related Work Order (optional, searchable dropdown of their work orders)
- Related Invoice (optional, searchable dropdown of their invoices)
- Tags (optional, text input with chip creation)
- Attachments (optional, file upload — images, PDFs, docs)
- Submit button

---

## 7. Subcontractor Portal Pages

### `/subcontractor-portal/support-tickets` — Subcontractor Ticket List

- Same scope-limiting as client (only their tickets)
- Same simplified UI as client list page
- "Create New Ticket" button
- Stats: Open, Resolved

### `/subcontractor-portal/support-tickets/[id]` — Subcontractor Detail

- Same restrictions as client (no internal comments)
- Can add comments, upload attachments
- Same create ticket form but related entity options limited to their assigned jobs / quotes

---

## 8. Navigation Integration

**`components/admin-layout.tsx`**: Add "Support Tickets" to the sidebar nav. Place it alongside or after "Messages". Use `TicketIcon` or `HeadphonesIcon` from `lucide-react`. Show a badge count of open + unassigned tickets (fetch count in layout).

**`components/client-layout.tsx`**: Add "Support Tickets" nav item using same icon. Show badge count of open tickets for that client.

**`components/subcontractor-layout.tsx`**: Add "Support Tickets" nav item. Show badge count of open tickets for that subcontractor.

---

## 9. Real-Time Updates

All list pages and detail pages use `onSnapshot()` for real-time Firestore updates (same pattern as work orders, invoices). Comments sub-collection also uses `onSnapshot()` so new replies appear instantly without refresh.

---

## 10. Implementation Patterns to Follow (Critical)

1. **File structure**: All page components are `'use client'` components at `app/{portal}/support-tickets/page.tsx` and `app/{portal}/support-tickets/[id]/page.tsx`
2. **Firebase queries**: Avoid `where()` + `orderBy()` on different fields — fetch all and filter client-side (documented Firebase Index Workaround)
3. **Timestamp counter**: Use Firestore `increment(1)` from `firebase/firestore` on `counters/supportTickets` doc atomically — read the count after increment to derive the ticket number
4. **Error handling**: Wrap all Firestore operations in try/catch, show toast errors via `sonner`
5. **Loading states**: Show skeleton loaders while data loads (same as other pages)
6. **Supabase sync**: Add `'supportTickets'` to the collections array in `app/api/sync/firebase-to-supabase/route.ts`
7. **Email logging types**: Add `'support-ticket-notification'`, `'support-ticket-comment'`, `'support-ticket-status-change'` to the type union in `lib/email-logger.ts`
8. **Admin email preferences**: Check `adminUser.supportTicketEmailNotifications !== false` before sending (same pattern as `workOrderEmailNotifications`)
9. **Server-side DB**: API routes use `getServerDb()` from `lib/firebase-server.ts`
10. **Types**: Add all new interfaces (`SupportTicket`, `TicketComment`) to `types/index.ts`
11. **Mobile responsive**: All pages must work on mobile (sidebar collapses, table scrolls horizontally)
12. **Pagination**: 25 items per page, same pagination controls as work orders page

---

## 11. Files to Create / Modify

### New Files

| File | Purpose |
|------|---------|
| `app/admin-portal/support-tickets/page.tsx` | Admin ticket list |
| `app/admin-portal/support-tickets/[id]/page.tsx` | Admin ticket detail |
| `app/client-portal/support-tickets/page.tsx` | Client ticket list |
| `app/client-portal/support-tickets/[id]/page.tsx` | Client ticket detail |
| `app/subcontractor-portal/support-tickets/page.tsx` | Subcontractor ticket list |
| `app/subcontractor-portal/support-tickets/[id]/page.tsx` | Subcontractor ticket detail |
| `app/api/support-tickets/create/route.ts` | Create ticket API |
| `app/api/support-tickets/comment/route.ts` | Add comment API |
| `app/api/support-tickets/update-status/route.ts` | Update status API |
| `app/api/support-tickets/assign/route.ts` | Assign ticket API |
| `app/api/email/send-support-ticket-notification/route.ts` | Email notification API |

### Modified Files

| File | Change |
|------|--------|
| `types/index.ts` | Add `SupportTicket`, `TicketComment` interfaces |
| `lib/email-logger.ts` | Add new email type literals to union |
| `components/admin-layout.tsx` | Add Support Tickets nav item with badge |
| `components/client-layout.tsx` | Add Support Tickets nav item with badge |
| `components/subcontractor-layout.tsx` | Add Support Tickets nav item with badge |
| `app/api/sync/firebase-to-supabase/route.ts` | Add `'supportTickets'` to collections array |
| `scripts/supabase-setup.sql` | Add comment block documenting new collection |
| `firestore.rules` | Add read/write rules for `supportTickets` and comments sub-collection |

### Firestore Rules Summary

- **Admins**: full read/write on all tickets and comments
- **Clients**: read/write own tickets only (`submittedBy == request.auth.uid || clientId == request.auth.uid`); read comments where `isInternal == false` only
- **Subcontractors**: read/write own tickets only; read comments where `isInternal == false` only

---

## 12. Build Order

Build in this sequence to avoid dependency issues:

1. `types/index.ts` — add interfaces
2. `lib/email-logger.ts` — add new types
3. API routes — create/comment/update-status/assign
4. Email notification route
5. Admin portal pages (list + detail)
6. Client portal pages (list + detail)
7. Subcontractor portal pages (list + detail)
8. Navigation components (admin + client + subcontractor layouts)
9. Supabase sync update
10. Firestore rules update
