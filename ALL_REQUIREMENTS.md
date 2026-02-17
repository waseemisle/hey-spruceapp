# Spruce App - Comprehensive Requirements Document

**Project:** Hey Spruce App v2
**Date:** November 3, 2025
**Document Version:** 1.0
**Prepared for:** Complete App Modernization & Feature Enhancement

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Application URLs](#application-urls)
3. [Core Requirements](#core-requirements)
4. [Notification System Requirements](#notification-system-requirements)
5. [Calendar Integration Requirements](#calendar-integration-requirements)
6. [Work Order Workflow Requirements](#work-order-workflow-requirements)
7. [Messaging & Communication Requirements](#messaging--communication-requirements)
8. [Invoice Management Requirements](#invoice-management-requirements)
9. [UI/UX Improvements](#uiux-improvements)
10. [Technical Stack & Architecture](#technical-stack--architecture)
11. [Detailed Feature Breakdown by Portal](#detailed-feature-breakdown-by-portal)
12. [Data Flow & User Journey](#data-flow--user-journey)
13. [Implementation Priority](#implementation-priority)

---

## Executive Summary

The Spruce App is a comprehensive facility management platform connecting three key user types:
- **Clients** - Request and manage facility maintenance services
- **Admin** - Oversee operations, approve requests, manage workflows
- **Subcontractors** - Bid on jobs, complete work orders, submit invoices

This document outlines all requirements for modernizing the application with state-of-the-art technologies, enhanced user experience, and streamlined workflows.

---

## Application URLs

- **Main Landing:** https://www.groundops.co/
- **Client Portal:** (app URL)/client-portal/
- **Admin Portal:** (app URL)/admin-portal/
- **Subcontractor Portal:** (app URL)/subcontractor-portal

---

## Core Requirements

### 1. Multi-Portal Architecture
- Three distinct portals with role-based access control
- Seamless data synchronization across all portals
- Real-time updates using Firebase Firestore
- Secure authentication and authorization

### 2. Technology Stack (State-of-the-Art)
**Current Stack:**
- Next.js 14.2.0 (App Router)
- React 18.3.0
- TypeScript 5.2.0
- Firebase 10.7.0 (Authentication & Firestore)
- Tailwind CSS 3.3.0
- Stripe 14.0.0 (Payment Processing)
- SendGrid 8.1.0 (Email Notifications)

**Recommended Additions:**
- React Query / TanStack Query (Server State Management)
- Zustand or Jotai (Client State Management)
- React Big Calendar / FullCalendar (Calendar Views)
- Socket.io or Firebase Realtime (Real-time Notifications)
- Zod (Schema Validation)
- React Hook Form (Form Management)
- Framer Motion (Animations)

---

## Notification System Requirements

### 1. Location Notifications (Client → Admin)

**Requirement:**
- When a client adds a new location, it requires admin approval
- Admin should see notification badge on "Locations" navigation item

**Implementation Details:**
- Badge style: Similar to Gmail unread count (e.g., "10" in red circle)
- Badge should show count of pending location approvals
- Real-time updates when new locations are submitted
- Badge should clear when locations are approved/rejected
- Notification bell icon should also reflect pending items

**User Flow:**
1. Client creates new location → Status: "Pending"
2. Admin sees notification badge on "Locations" nav (e.g., "3")
3. Admin clicks Locations → Views pending locations
4. Admin approves/rejects → Badge count decreases

---

### 2. Work Order Notifications (Client → Admin)

**Requirement:**
- When a client creates a new work order, it requires admin approval
- Admin should see notification badge on "Work Orders" navigation item

**Implementation Details:**
- Badge shows count of work orders pending admin approval
- Similar Gmail-style notification badge
- Real-time updates
- Badge count decreases as work orders are processed

**User Flow:**
1. Client creates work order → Status: "Pending Admin Approval"
2. Admin sees badge on "Work Orders" nav
3. Admin approves → Work order moves to "Bidding" status

---

### 3. Work Order Approval Notifications (Admin → Client)

**Requirement:**
- When admin approves a work order, client receives notification
- Notification appears in client portal notification bell icon

**Implementation Details:**
- Notification message: "WO [Work Order Number] has been approved"
- Clickable notification that navigates to work order details
- Notification persistence until clicked/dismissed
- Visual indicator (red dot/badge) on notification bell

**User Flow:**
1. Admin approves work order
2. Client sees notification bell badge
3. Client clicks bell → Sees "WO #282546 approved"
4. Client clicks notification → Redirects to work order details

---

### 4. Quote Submission Notifications (Subcontractor → Client/Admin)

**Requirement:**
- When subcontractor submits a quote, client and admin receive notifications
- Badge appears on "Work Orders" for client
- Client can see "1 bid submitted" or "Multiple bids" indicator

**Implementation Details:**
- Quote notification integrated into work order view
- "View Quotes" button or expandable section within work order
- Notification badge on client portal navigation
- Admin also receives notification for tracking purposes

---

### 5. Subcontractor Assignment Notifications

**Requirement:**
- When client accepts a quote, subcontractor receives immediate notification
- No admin intervention required between quote acceptance and subcontractor notification

**Implementation Details:**
- Automatic assignment workflow
- Notification: "You've been assigned to WO #[number]"
- Status change from "Bidding" to "Pending Schedule"
- Dashboard updates to show "1 job pending acceptance"

---

### 6. Bidding Opportunity Notifications (Admin → Subcontractor)

**Requirement:**
- When admin shares work order for bidding, subcontractors receive notification
- Notification badge on "Bidding" section
- Dashboard should show count of available jobs

**Implementation Details:**
- Badge on "Bidding" navigation item
- Dashboard widget: "X jobs available for bidding"
- Category-specific filtering (only relevant subcontractors notified)
- Notification expires after bidding deadline or job assignment

---

### 7. Invoice Notifications (Admin → Client)

**Requirement:**
- When admin sends invoice to client, client receives notification
- Notification on "Invoices" section
- Email notification via SendGrid

**Implementation Details:**
- In-app notification badge
- Email with invoice PDF attachment
- Payment link included
- "New Invoice" indicator on client dashboard

---

### 8. General Notification Bell Component

**Universal Requirements:**
- Present in all three portals (Client, Admin, Subcontractor)
- Shows consolidated count of all notifications
- Dropdown panel with notification list
- Each notification includes:
  - Type/Category icon
  - Brief message
  - Timestamp
  - Click action (navigation)
  - Read/unread status
- Mark as read/unread functionality
- Clear all notifications option
- Real-time updates (Firebase listeners)

---

## Calendar Integration Requirements

### 1. Master Calendar - Client Portal

**Requirement:**
- Master calendar view showing all work orders across all locations
- Filter capability by location(s)
- Shows both one-time and recurring work orders

**Implementation Details:**

**Calendar Features:**
- Month, Week, Day views
- Color-coded events by status:
  - Blue: Scheduled
  - Yellow: Pending
  - Green: Completed
  - Red: Overdue
- Event details on hover/click:
  - Work Order Number
  - Location Name
  - Service Type
  - Scheduled Time
  - Subcontractor Name
  - Status

**Filter System:**
- "All Locations" (default view)
- Multi-select location filter
- Example: Select "Keys Nightclub" + "Hood Group Office" → Shows only work orders for those two locations
- Filter persistence (saved in local storage)
- Quick filter buttons for common combinations

**Master Dashboard Context:**
- Located on client dashboard below existing stats
- Default view shows ALL work orders for the company (e.g., "The Hood Group")
- Includes all locations under the company umbrella
- Both one-time and recurring work orders visible

**User Flow:**
1. Client logs in → Dashboard shows master calendar
2. Calendar displays all upcoming work orders (all locations)
3. Client selects location filter (e.g., "Keys Nightclub")
4. Calendar updates to show only Keys Nightclub work orders
5. Client can select multiple locations for combined view

---

### 2. Admin Portal Calendar

**Requirement:**
- Comprehensive calendar showing all work orders across all clients
- Filter by client, location, subcontractor, status
- Scheduling and rescheduling capabilities

**Implementation Details:**

**Calendar Features:**
- All views: Month, Week, Day, Agenda
- Color-coding by status (same as client)
- Additional color-coding by client (optional toggle)
- Drag-and-drop rescheduling
- Bulk operations (select multiple, reschedule)

**Filter Options:**
- By Client Company
- By Location
- By Subcontractor
- By Work Order Status
- By Service Category
- Date range selector
- Search by work order number

**Admin-Specific Features:**
- Click event → Quick actions menu:
  - View Details
  - Edit Schedule
  - Contact Client
  - Contact Subcontractor
  - View Messages
- Conflict detection (double-booking alerts)
- Capacity planning view (subcontractor availability)

**Dashboard Integration:**
- Prominent placement on admin dashboard
- Summary statistics above calendar:
  - Today's scheduled work orders
  - This week's scheduled work orders
  - Pending scheduling
  - Overdue work orders

---

### 3. Subcontractor Portal Calendar

**Requirement:**
- Personal calendar showing only assigned work orders
- Clear view of upcoming commitments
- Includes recurring service schedules

**Implementation Details:**

**Calendar Features:**
- Month, Week, Day views
- Color-coded by work order status:
  - Orange: Pending Acceptance
  - Blue: Accepted/Scheduled
  - Green: Completed
  - Red: Overdue
- Event details:
  - Client Name
  - Location Address
  - Service Type
  - Scheduled Time
  - Work Order Number
  - Special Instructions

**Subcontractor-Specific Features:**
- Quick acceptance from calendar event
- Schedule selection directly on calendar
- Route optimization view (map integration optional)
- Time blocking for availability management
- Export to external calendar (iCal/Google Calendar)

**Dashboard Integration:**
- Calendar widget on dashboard
- "Today's Jobs" list view
- "This Week" summary
- Next 30 days overview

---

### 4. Recurring Work Orders on Calendar

**Requirement:**
- Visual representation of recurring work orders
- Clear distinction from one-time work orders
- Show recurrence pattern

**Implementation Details:**

**Visual Indicators:**
- Recurring icon/badge on calendar events
- Different border style (e.g., dashed border)
- Tooltip shows recurrence pattern:
  - "Weekly every Monday at 9 AM"
  - "Monthly on the 15th"
  - "Bi-weekly on Wednesdays"

**Recurrence Management:**
- Click recurring event → Options:
  - Edit this occurrence
  - Edit all future occurrences
  - Edit entire series
- Visual timeline showing all scheduled instances
- Skip occurrence functionality (with reason)

**Calendar Display:**
- Show next 6 months of recurring instances
- Load more on demand
- Highlight upcoming occurrence (next 7 days)

---

## Work Order Workflow Requirements

### 1. Address Display Fix

**CRITICAL BUG:**
- Work order detail page shows "[object Object]" instead of location address
- Affects: Client Portal, Admin Portal, Subcontractor Portal

**Fix Required:**
```typescript
// Current (broken):
Address: [object Object]

// Required:
Address: 123 Main Street, New York, NY 10001
```

**Implementation:**
- Properly parse location object
- Display formatted address string
- Include: Street Address, City, State, ZIP Code
- Optional: Show on map (Google Maps integration)

**Location:**
- File: `app/client-portal/work-orders/[id]/page.tsx`
- File: `app/admin-portal/work-orders/[id]/page.tsx`
- Any component displaying work order details

---

### 2. Work Order Status Flow

**Current Flow Issues:**
- Too many manual admin interventions
- Delayed notifications
- Unclear status transitions

**Required Flow:**

#### Step 1: Client Creates Work Order
- Status: "Pending Admin Approval"
- Notification → Admin (badge on "Work Orders")
- Client sees: "Work Order Submitted - Awaiting Approval"

#### Step 2: Admin Approves & Shares for Bidding
- Admin action: Approve work order
- Status: "Bidding"
- System action: Share with relevant subcontractors (category-based)
- Notification → Client ("WO #[number] approved")
- Notification → Subcontractors (only matching category)
- Display: Only subcontractors in matching category shown in dropdown

**Category Filtering:**
```
Example: Work Order = "Broken Toilet" → Category = "Plumbing"
Result: Only show plumbers in subcontractor selection dropdown
Not: All 15 subcontractors
```

#### Step 3: Subcontractors Submit Quotes
- Subcontractor action: Submit quote
- Status: Remains "Bidding" (until client accepts)
- Notification → Client (badge increment for each quote)
- Notification → Admin (tracking purposes)
- Client sees: "3 bids received" indicator on work order

#### Step 4: Client Reviews & Accepts Quote
- Client action: View quotes → Select best quote → Accept
- Status: "Assigned to Subcontractor"
- **AUTOMATIC WORKFLOW** (no admin intervention):
  - System automatically assigns work order to selected subcontractor
  - Notification → Subcontractor ("You've been assigned to WO #[number]")
  - Work order appears in subcontractor's "Assigned" section
  - Status visible to all: "Pending Schedule"

#### Step 5: Subcontractor Accepts & Schedules
- Subcontractor action: Accept assignment → Select date & time
- Status: "Scheduled"
- System action: Add to all relevant calendars
- Notification → Client ("WO #[number] scheduled for [date] at [time]")
- Notification → Admin (for tracking)
- **Calendar Updates:**
  - Client calendar: Event added
  - Admin calendar: Event added
  - Subcontractor calendar: Event added

#### Step 6: Work Completion
- Subcontractor action: Mark as complete → Upload photos → Add notes
- Status: "Completed - Pending Admin Review"
- Follow-up details stored and visible to:
  - Admin (for review)
  - Client (work completion proof)
- Notification → Admin ("WO #[number] marked complete by subcontractor")

#### Step 7: Admin Review & Invoice
- Admin action: Review completion → Generate invoice
- Status: "Invoice Sent"
- Notification → Client ("Invoice for WO #[number] ready")
- Email → Client (invoice PDF + payment link)

#### Step 8: Client Payment
- Client action: Pay invoice (Stripe)
- Status: "Paid"
- System: Record payment → Update records
- Notification → All parties (payment confirmation)

---

### 3. Quote Management

**Current Issues:**
- Quotes not easily visible
- Multiple clicks to access
- No consolidated view

**Required Implementation:**

**Client View:**
- Work order card shows: "3 Bids Received" badge
- "View Quotes" button prominently displayed
- Click → Modal or expandable section with quote details:
  ```
  Quote 1: Wasim Plumbing
  - Amount: $450.00
  - Estimated Time: 2-3 hours
  - Availability: Tomorrow
  - Rating: 4.8 stars
  - Notes: "Can complete same day if approved by noon"
  [Accept Quote] [View Profile] [Message]

  Quote 2: ABC Plumbing
  - Amount: $575.00
  - Estimated Time: 3-4 hours
  - Availability: Next Week
  - Rating: 4.5 stars
  - Notes: "Includes 6-month warranty"
  [Accept Quote] [View Profile] [Message]
  ```
- Side-by-side comparison view
- Sort by: Price, Rating, Availability
- Accept quote → Immediate assignment (no admin step)

**Admin View:**
- Same quote visibility
- Can override client selection if needed
- Track quote response times
- Monitor quote acceptance rates per subcontractor

---

### 4. Work Order Details Display

**Required Information on Work Order Page:**

**For Client:**
- Work Order Number (prominent)
- Status (color-coded badge)
- Created Date & Time
- Location Name & Full Address
- Service Category
- Description/Issue Details
- Uploaded Photos (if any)
- **Scheduled Date & Time** (large, bold when scheduled)
- Assigned Subcontractor Name & Contact
- Quote Details (if accepted)
- Progress Updates
- Follow-up Notes (after completion)
- Invoice Link (when available)
- Payment Status

**For Admin:**
- All client information +
- Client Company Name
- Location Details
- Quote Comparison
- Subcontractor Assignment History
- Communication Log
- Admin Notes (internal)
- Invoice Status
- Payment Details

**For Subcontractor:**
- Work Order Number
- Client Name (contact person)
- Location Name & Full Address
- Service Details
- Special Instructions
- Access Instructions
- Scheduled Date & Time
- Quote Submitted (if any)
- Assignment Status
- Completion Checklist
- Photo Upload Section
- Follow-up Notes Section

---

### 5. Work Order Filtering & Organization

**Requirement:**
- Dropdown navigation for work orders by status
- Reduce clutter on main work orders page

**Implementation:**

**Client Portal - Work Orders Navigation:**
```
Work Orders ▼
├─ All Work Orders
├─ Pending Approval
├─ Bidding
├─ Scheduled
├─ In Progress
├─ Completed
└─ Invoiced
```

**Admin Portal - Work Orders Navigation:**
```
Work Orders ▼
├─ All Work Orders
├─ Pending Approval (badge: 5)
├─ Bidding (badge: 12)
├─ Scheduled
├─ In Progress
├─ Completed
├─ Overdue (red badge)
└─ Archived
```

**Subcontractor Portal - Work Orders:**
```
Work Orders ▼
├─ Available for Bidding (badge: 3)
├─ Quotes Submitted
├─ Assigned to Me
├─ Scheduled
├─ Completed
└─ Invoiced
```

**Additional Filters:**
- Date Range
- Location (for clients with multiple locations)
- Service Category
- Subcontractor (admin view)
- Search by work order number

---

## Messaging & Communication Requirements

### 1. Work Order-Specific Chat

**Requirement:**
- Built-in messaging system for each work order
- Scoped to work order context
- Participants: Client, Admin, Assigned Subcontractor

**Implementation Details:**

**Chat Initiation:**
- Chat button appears on work order detail page
- Available to: Client, Admin
- Chat becomes active when work order status = "Assigned to Subcontractor"
- Prerequisite: Work order must have assigned subcontractor
- Button label: "Message Group" or "Work Order Chat"

**Chat Interface:**
- Modal or slide-out panel
- Group chat format (like WhatsApp group)
- Header shows:
  - Work Order Number (e.g., "WO #282546")
  - Location Name
  - Participants: Client Name, Admin, Subcontractor Name
  - Status indicator (online/offline)

**Message Features:**
- Text messages
- Photo attachments (before/after photos)
- File attachments (invoices, quotes, documents)
- Timestamp on each message
- Read receipts
- Typing indicators
- @mentions for specific participants

**Automated Messages (System Messages):**
- Work order status changes posted automatically:
  ```
  [System] Work order assigned to Wasim Plumbing - [timestamp]
  [System] Scheduled for Monday, Nov 4 at 9:00 AM - [timestamp]
  [System] Marked as complete by Wasim Plumbing - [timestamp]
  ```

**Notification Integration:**
- New message → Notification to all participants
- Badge on "Messages" navigation
- Email notification option (settings)
- Push notification (future mobile app)

**Storage:**
- Firebase Firestore collection: `workOrderChats`
- Structure:
  ```
  workOrderChats/
    {workOrderId}/
      participants: [clientId, adminId, subcontractorId]
      messages/
        {messageId}: {
          sender: userId,
          senderName: "John Doe",
          senderRole: "client",
          message: "Can you come at noon instead?",
          timestamp: Timestamp,
          attachments: [],
          read: [userId1, userId2]
        }
  ```

**Access Control:**
- Only participants can view/send messages
- Admin has access to all work order chats
- Chat history persists after work order completion
- Archive old chats after 90 days

---

### 2. General Messaging Portal

**Requirement:**
- Dedicated "Messages" section in all three portals
- List of all active chats (work order based)
- Quick access without navigating to specific work order

**Implementation:**

**Messages Page Layout:**
- Left sidebar: List of chats (work order groups)
- Right panel: Active conversation
- Similar to WhatsApp Web / Slack interface

**Chat List Item:**
```
WO #282546 - Keys Nightclub
"Can you come at noon instead?"
🟢 Online · 2 unread messages
```

**Features:**
- Search chats by work order number or location
- Filter by active/archived
- Sort by recent activity
- Pin important chats
- Mute notifications per chat

---

## Invoice Management Requirements

### 1. Invoice Generation Restrictions

**Current Issue:**
- Invoices can be generated before work is completed
- No validation on work order status

**Required Implementation:**

**Business Rule:**
- Invoice can ONLY be generated when:
  - Work Order Status = "Completed"
  - Subcontractor has submitted follow-up notes
  - Completion photos uploaded (if required)

**Validation:**
```typescript
if (workOrder.status !== 'completed') {
  // Show error message
  // Disable "Generate Invoice" button
  // Display: "Invoice can only be generated after work order is completed"
}
```

**UI/UX:**
- "Generate Invoice" button is disabled (greyed out) when status ≠ completed
- Tooltip on hover: "Complete the work order first"
- Button becomes active (green) when status = completed

---

### 2. Invoice Workflow

**Step 1: Admin Generates Invoice**
- Prerequisites checked automatically
- Invoice details auto-populated from work order & quote
- Admin can review/edit before generation
- PDF generated with company branding

**Step 2: Send to Client (Automatic)**
- **IMPORTANT:** Remove extra admin step
- Current: Admin clicks "Generate" then must click "Send to Client"
- Required: Auto-send on generation OR one-click operation

**Implementation:**
```typescript
// Option 1: Automatic send
generateInvoice() → sendToClient() → updateButton()

// Option 2: One-click with confirmation
Button: "Generate & Send Invoice"
Click → Confirmation modal → Generate → Send → Update status
```

**Button State Management:**
- Initial: "Generate & Send Invoice" (blue, active)
- After click: "Invoice Sent ✓" (green, disabled)
- Cannot click again (prevent duplicate sends)
- If re-send needed: "Resend Invoice" button appears

---

### 3. Client Invoice Notification & Payment

**Notification Flow:**
1. Invoice generated by admin
2. Client receives:
   - In-app notification (bell icon)
   - Email with PDF attachment
   - Email includes Stripe payment link

**Client Invoice View:**
- Badge on "Invoices" navigation
- Invoice list shows:
  - Invoice Number
  - Work Order Number (linked)
  - Date Issued
  - Amount Due
  - Status (Unpaid/Paid/Overdue)
  - [View PDF] [Pay Now] buttons

**Payment Process:**
- Click "Pay Now" → Stripe Checkout
- Payment success → Webhook updates invoice status
- Confirmation email sent
- Status updated across all portals

---

### 4. Follow-up Notes Visibility

**Current Issue:**
- Subcontractor submits follow-up notes after completion
- Notes not visible to client or admin
- Information lost in system

**Required Implementation:**

**Follow-up Notes Display:**

**Subcontractor Portal (Submission):**
- Work order completion form:
  - Upload completion photos (required)
  - Follow-up notes (required text area):
    ```
    Example:
    - Replaced broken toilet flange
    - Installed new wax ring
    - Tested for leaks - all clear
    - Recommended: Check bathroom floor for water damage
    ```
  - Time spent
  - Materials used

**Client Portal (View):**
- Work order detail page
- Section: "Work Completion Details"
- Display:
  - Completion date & time
  - Subcontractor name
  - Before/After photos (side-by-side)
  - Follow-up notes (formatted)
  - Materials used
  - Work duration

**Admin Portal (View):**
- Same as client view +
- Internal admin notes section
- Cost breakdown
- Invoice generation section

**Work Order Chat Integration:**
- Follow-up notes automatically posted to work order chat
- Format:
  ```
  [System] Work completed by Wasim Plumbing - Nov 4, 2025 at 11:30 AM

  Completion Notes:
  - Replaced broken toilet flange
  - Installed new wax ring
  - Tested for leaks - all clear
  - Recommended: Check bathroom floor for water damage

  [View Photos]
  ```

---

## UI/UX Improvements

### 1. Navigation Badges & Notifications

**Gmail-Style Badges:**
- Red circular badge with white number
- Position: Top-right of navigation item
- Real-time updates
- Examples:
  ```
  Locations (3)      ← 3 pending location approvals
  Work Orders (12)   ← 12 pending work orders
  Messages (5)       ← 5 unread messages
  Invoices (2)       ← 2 unpaid invoices
  ```

**Badge Behavior:**
- Appears when count > 0
- Disappears when count = 0
- Updates in real-time (Firebase listener)
- Animation on count increase (subtle scale up)
- Max display: "99+" for counts > 99

---

### 2. Notification Bell Component

**Design:**
- Bell icon in top navigation bar
- Badge shows total notification count
- Click → Dropdown panel

**Dropdown Panel:**
```
Notifications (5)                     [Mark all read]

[Icon] WO #282546 approved
       2 minutes ago                   [•]

[Icon] New quote received for WO #282547
       15 minutes ago                  [•]

[Icon] Invoice #INV-001 paid
       1 hour ago

[Icon] Message from Wasim Plumbing
       2 hours ago

[Icon] Location "Keys Nightclub" approved
       Yesterday

[View All]
```

**Features:**
- Unread notifications highlighted (bold, colored dot)
- Click notification → Navigate to relevant page
- Mark as read individually
- "Mark all as read" bulk action
- Persistent until manually dismissed
- Auto-dismiss option (settings)

---

### 3. Status Indicators & Color Coding

**Work Order Status Colors:**
- 🔴 **Red:** Overdue
- 🟡 **Yellow:** Pending (approval, scheduling)
- 🔵 **Blue:** Scheduled, In Progress
- 🟢 **Green:** Completed
- ⚫ **Grey:** Cancelled, Archived

**Location Status:**
- 🟡 **Yellow:** Pending Approval
- 🟢 **Green:** Active
- ⚫ **Grey:** Inactive

**Invoice Status:**
- 🔴 **Red:** Overdue
- 🟡 **Yellow:** Sent/Unpaid
- 🟢 **Green:** Paid

---

### 4. Dashboard Widgets

**Client Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ Company: The Hood Group                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [5] Active Locations    [12] Open Work Orders              │
│  [3] Scheduled Today     [2] Unpaid Invoices                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    MASTER CALENDAR                           │
│  Filter: [All Locations ▼]  View: [Month ▼]                │
│                                                              │
│  [Calendar Grid showing all work orders]                    │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Recent Activity                                             │
│  • WO #282546 completed - 2 hours ago                       │
│  • New quote received for WO #282547 - 4 hours ago          │
│  • Invoice #INV-001 sent - Yesterday                        │
└─────────────────────────────────────────────────────────────┘
```

**Admin Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ Admin Overview                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [5] Pending Approvals    [23] Active Work Orders           │
│  [8] Scheduled Today      [12] Pending Invoices             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    ALL WORK ORDERS CALENDAR                  │
│  Filter: [All Clients ▼] [All Locations ▼]                 │
│                                                              │
│  [Calendar Grid showing all work orders across clients]     │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Alerts & Notifications                                      │
│  🔴 3 work orders overdue                                   │
│  🟡 5 locations pending approval                            │
│  🟢 12 quotes submitted today                               │
└─────────────────────────────────────────────────────────────┘
```

**Subcontractor Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ Welcome, Wasim Plumbing                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [3] Jobs Available      [5] Assigned Jobs                  │
│  [2] Scheduled Today     [15] Completed This Month          │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    MY SCHEDULE                               │
│  View: [Month ▼]                                            │
│                                                              │
│  [Calendar Grid showing assigned work orders]               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Today's Jobs                                                │
│  • 9:00 AM - Keys Nightclub - Broken Toilet                 │
│  • 2:00 PM - Hood Group Office - HVAC Maintenance           │
│                                                              │
│  [3] New bidding opportunities available                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Stack & Architecture

### 1. Frontend Architecture

**Framework:**
- Next.js 14.2+ (App Router)
- React 18.3+
- TypeScript 5.2+

**State Management:**
```typescript
// Server State
- React Query (TanStack Query) for API calls, caching, synchronization

// Client State
- Zustand for global UI state
- React Context for auth state

// Form State
- React Hook Form + Zod validation
```

**Styling:**
- Tailwind CSS 3.3+
- Radix UI (headless components)
- Framer Motion (animations)
- Custom design system/tokens

---

### 2. Backend & Database

**Database:**
- Firebase Firestore (NoSQL)
- Real-time listeners for live updates
- Firestore Security Rules for access control

**Collections Structure:**
```
users/
  {userId}/
    role: 'client' | 'admin' | 'subcontractor'
    companyName: string
    email: string
    ...

companies/
  {companyId}/
    name: string
    locations: [locationId]
    ...

locations/
  {locationId}/
    companyId: string
    address: object
    status: 'pending' | 'active'
    ...

workOrders/
  {workOrderId}/
    companyId: string
    locationId: string
    clientId: string
    status: string
    category: string
    scheduledDate: Timestamp
    assignedSubcontractor: string
    quotes: [quoteId]
    ...

quotes/
  {quoteId}/
    workOrderId: string
    subcontractorId: string
    amount: number
    notes: string
    ...

invoices/
  {invoiceId}/
    workOrderId: string
    amount: number
    status: 'unpaid' | 'paid'
    stripePaymentLink: string
    ...

notifications/
  {notificationId}/
    userId: string
    type: string
    message: string
    read: boolean
    timestamp: Timestamp
    ...

workOrderChats/
  {workOrderId}/
    participants: []
    messages/
      {messageId}/
        ...
```

---

### 3. Authentication & Authorization

**Firebase Authentication:**
- Email/Password authentication
- Role-based access control (RBAC)
- Protected routes with middleware
- Session management

**Authorization Levels:**
```typescript
Roles:
  - admin (full access)
  - client (company-scoped access)
  - subcontractor (assigned work orders only)

Permissions:
  - admin: CRUD all resources
  - client: CRUD own locations, work orders, view invoices
  - subcontractor: View assigned work orders, submit quotes, update status
```

---

### 4. Third-Party Integrations

**Stripe:**
- Payment processing
- Invoice payment links
- Webhook handling (payment success)

**SendGrid:**
- Transactional emails
- Invoice emails with PDF attachments
- Notification emails

**Cloudinary (Current):**
- Image uploads (work order photos)
- Optimize for web delivery

**Calendar Integration (Future):**
- iCal export
- Google Calendar sync
- Outlook Calendar sync

---

### 5. Real-Time Features

**Firebase Realtime Listeners:**
```typescript
// Example: Listen for work order updates
useEffect(() => {
  const unsubscribe = onSnapshot(
    doc(db, 'workOrders', workOrderId),
    (snapshot) => {
      setWorkOrder(snapshot.data())
    }
  )
  return unsubscribe
}, [workOrderId])

// Example: Listen for new notifications
useEffect(() => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', currentUserId),
    where('read', '==', false),
    orderBy('timestamp', 'desc')
  )

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => doc.data())
    setNotifications(notifications)
  })

  return unsubscribe
}, [currentUserId])
```

---

### 6. Performance Optimization

**Code Splitting:**
- Route-based code splitting (automatic with Next.js App Router)
- Dynamic imports for heavy components (calendar, charts)

**Image Optimization:**
- Next.js Image component
- Cloudinary transformations
- Lazy loading

**Caching Strategy:**
```typescript
// React Query config
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
    },
  },
})
```

**Database Optimization:**
- Firestore indexes for complex queries
- Pagination for large lists
- Limit query results
- Use snapshot listeners selectively

---

## Detailed Feature Breakdown by Portal

### Client Portal Features

#### Dashboard
- ✅ Company overview statistics
- ✅ Master calendar (all locations)
- ✅ Location filter for calendar
- ✅ Recent activity feed
- ✅ Quick actions (Create Work Order, Add Location)
- ✅ Notification bell
- ✅ Upcoming scheduled work orders widget

#### Locations
- ✅ List all locations
- ✅ Add new location (pending admin approval)
- ✅ Edit location details
- ✅ View location-specific work order history
- ✅ Status indicator (Pending/Active)

#### Work Orders
- ✅ Create new work order
- ✅ View all work orders (with status filters)
- ✅ View work order details:
  - ✅ Fix address display bug
  - ✅ Show scheduled date/time prominently
  - ✅ Display assigned subcontractor
  - ✅ View submitted quotes
  - ✅ Accept quotes
  - ✅ View completion details & photos
- ✅ Filter by status (dropdown)
- ✅ Search by work order number
- ✅ Chat functionality per work order

#### Quotes
- ✅ View all received quotes
- ✅ Compare quotes side-by-side
- ✅ Accept/decline quotes
- ✅ Notification when new quote received

#### Invoices
- ✅ View all invoices
- ✅ Download invoice PDF
- ✅ Pay invoice (Stripe)
- ✅ View payment history
- ✅ Filter by status (Paid/Unpaid)

#### Messages
- ✅ List all work order chats
- ✅ Send/receive messages
- ✅ File/photo attachments
- ✅ Real-time messaging

#### Notifications
- ✅ Bell icon with badge count
- ✅ Dropdown notification list
- ✅ Work order approval notifications
- ✅ Quote received notifications
- ✅ Scheduling notifications
- ✅ Invoice notifications

---

### Admin Portal Features

#### Dashboard
- ✅ System-wide overview statistics
- ✅ All clients calendar view
- ✅ Filter by client/location/status
- ✅ Pending approvals widget
- ✅ Recent activity across all clients
- ✅ Alert notifications (overdue work orders)

#### Clients
- ✅ List all client companies
- ✅ View client details
- ✅ Add new client
- ✅ View client work order history
- ✅ Client performance metrics

#### Locations
- ✅ View all locations (all clients)
- ✅ Approve/reject pending locations
- ✅ Notification badge for pending approvals
- ✅ Edit location details
- ✅ Assign to clients

#### Work Orders
- ✅ View all work orders (all clients)
- ✅ Approve pending work orders
- ✅ Notification badge for pending approvals
- ✅ Share for bidding (category-filtered subcontractors)
- ✅ View submitted quotes
- ✅ Monitor work order progress
- ✅ Review completion details
- ✅ Generate invoices (only when completed)
- ✅ Send invoices to clients (one-click)
- ✅ Filter by status (dropdown)
- ✅ Search & advanced filters

#### Subcontractors
- ✅ List all subcontractors
- ✅ Add new subcontractor
- ✅ Assign categories/specialties
- ✅ View subcontractor performance
- ✅ Manage availability

#### Quotes
- ✅ View all quotes across work orders
- ✅ Monitor quote response times
- ✅ Quote analytics

#### Invoices
- ✅ View all invoices
- ✅ Generate invoices for completed work orders
- ✅ Send invoices to clients
- ✅ Track payment status
- ✅ Payment reconciliation

#### Messages
- ✅ Access all work order chats
- ✅ Monitor communications
- ✅ Intervene when needed

#### Recurring Work Orders
- ✅ Create recurring work orders
- ✅ Manage recurrence patterns
- ✅ View upcoming recurring instances
- ✅ Edit/skip occurrences

---

### Subcontractor Portal Features

#### Dashboard
- ✅ Personal statistics
- ✅ Personal calendar (assigned jobs only)
- ✅ Today's schedule widget
- ✅ Available bidding opportunities count
- ✅ Earnings summary
- ✅ Performance metrics

#### Bidding
- ✅ View available jobs (category-matched only)
- ✅ Notification badge for new opportunities
- ✅ Submit quotes
- ✅ View quote status
- ✅ Track quote acceptance rate

#### Assigned
- ✅ View assigned work orders
- ✅ Accept assignment
- ✅ Schedule service date/time
- ✅ View work order details
- ✅ Access location & client info
- ✅ Chat with client/admin

#### Scheduled
- ✅ View upcoming scheduled jobs
- ✅ Calendar integration
- ✅ Get directions to location
- ✅ Reschedule (with approval)

#### Completed
- ✅ Mark work order as complete
- ✅ Upload completion photos
- ✅ Submit follow-up notes
- ✅ Record materials used
- ✅ Track work duration
- ✅ View completion history

#### Messages
- ✅ Work order-specific chats
- ✅ Real-time messaging with clients/admin

#### Notifications
- ✅ Bell icon with badge count
- ✅ New job assignment notifications
- ✅ Bidding opportunity notifications
- ✅ Schedule change notifications
- ✅ Message notifications

---

## Data Flow & User Journey

### Journey 1: Client Creates Work Order → Completion

**Step-by-Step Flow:**

1. **Client: Create Work Order**
   - Navigate to Work Orders → Create New
   - Fill form:
     - Select Location (dropdown)
     - Select Category (e.g., Plumbing)
     - Enter description
     - Upload photos (optional)
     - Submit
   - Result: Work Order created with status "Pending Admin Approval"
   - Notification: Admin receives badge on "Work Orders" nav

2. **Admin: Approve & Share for Bidding**
   - Admin sees notification badge
   - Navigate to Work Orders → Pending
   - View work order details
   - Click "Approve & Share for Bidding"
   - System automatically filters subcontractors by category
   - Result:
     - Work Order status → "Bidding"
     - Notification → Client ("WO approved")
     - Notification → Matching subcontractors ("New job available")

3. **Subcontractors: Submit Quotes**
   - Subcontractors see notification badge on "Bidding"
   - Navigate to Bidding → View available jobs
   - Click work order → View details
   - Submit quote:
     - Enter amount
     - Estimated time
     - Availability
     - Notes
     - Submit
   - Result:
     - Quote stored
     - Notification → Client ("New quote received")
     - Badge increment on client's work order

4. **Client: Review & Accept Quote**
   - Client sees notification
   - Navigate to Work Order
   - Click "View Quotes" (badge shows count: "3")
   - Compare quotes side-by-side
   - Select best quote → Click "Accept Quote"
   - Result:
     - **AUTOMATIC**: Work order assigned to selected subcontractor
     - Status → "Assigned - Pending Schedule"
     - Notification → Subcontractor ("You've been assigned")
     - NO admin intervention required

5. **Subcontractor: Accept & Schedule**
   - Subcontractor sees notification
   - Navigate to Assigned Jobs
   - View work order details
   - Click "Accept & Schedule"
   - Select date & time from calendar
   - Submit
   - Result:
     - Status → "Scheduled"
     - Event added to all calendars (Client, Admin, Subcontractor)
     - Notification → Client ("WO scheduled for [date] at [time]")
     - Notification → Admin (for tracking)

6. **Subcontractor: Complete Work**
   - On scheduled date, complete work
   - Navigate to work order
   - Click "Mark as Complete"
   - Upload completion photos (required)
   - Enter follow-up notes (required)
   - Record materials & time spent
   - Submit
   - Result:
     - Status → "Completed - Pending Admin Review"
     - Follow-up notes posted to work order chat
     - Notification → Admin ("WO completed")
     - Completion details visible to client & admin

7. **Admin: Review & Generate Invoice**
   - Admin sees notification
   - Navigate to work order
   - Review completion details & photos
   - Verify work quality
   - Click "Generate & Send Invoice"
   - Invoice auto-populated from quote & work order
   - Confirm
   - Result:
     - Invoice PDF generated
     - Status → "Invoice Sent"
     - Email → Client (PDF + Stripe payment link)
     - Notification → Client ("Invoice ready")
     - Button state → "Invoice Sent ✓" (disabled)

8. **Client: Pay Invoice**
   - Client receives email
   - OR navigate to Invoices in portal
   - Click "Pay Now" → Stripe Checkout
   - Complete payment
   - Result:
     - Stripe webhook updates invoice status
     - Status → "Paid"
     - Notification → All parties (payment confirmation)
     - Work order archived to "Completed"

---

### Journey 2: Recurring Work Order Flow

**Setup:**

1. **Admin: Create Recurring Work Order**
   - Navigate to Recurring Work Orders → Create New
   - Fill form:
     - Select Client & Location
     - Select Category & Service
     - Set recurrence pattern:
       - Frequency: Daily/Weekly/Monthly/Custom
       - Days: (e.g., Every Monday)
       - Time: (e.g., 9:00 AM)
       - Start Date
       - End Date (optional) or Number of Occurrences
     - Assign Subcontractor (pre-assign)
     - Set pricing
     - Submit
   - Result:
     - Recurring work order created
     - First instance scheduled
     - All future instances generated (next 6 months)
     - Events added to all calendars
     - Notification → Client & Subcontractor

**Execution (Automated):**

2. **System: Generate Work Order Instances**
   - Cron job runs daily (API route: `/api/recurring-work-orders/cron`)
   - Checks for recurring work orders due today
   - Creates individual work order for each instance
   - Status: "Scheduled" (pre-assigned to subcontractor)
   - Adds to calendars
   - Notifications sent

3. **Subcontractor: Complete Recurring Job**
   - Same flow as one-time work order
   - Mark complete → Upload photos → Submit notes
   - Invoice generated automatically (if configured)

4. **Admin: Manage Recurring Series**
   - Edit future occurrences
   - Skip specific dates (e.g., holidays)
   - Change assigned subcontractor
   - Adjust pricing
   - End recurring series

---

## Implementation Priority

### Phase 1: Critical Fixes & Notifications (Week 1)

**Priority: HIGH**

1. ✅ Fix address display bug ("[object Object]")
   - Files: Work order detail pages (all portals)
   - Impact: All users

2. ✅ Implement notification system
   - Notification bell component (all portals)
   - Badge counts on navigation items
   - Firebase notification collection
   - Real-time listeners

3. ✅ Location approval notifications
   - Badge on Admin "Locations" nav
   - Client notification on approval/rejection

4. ✅ Work order approval notifications
   - Badge on Admin "Work Orders" nav
   - Client notification on approval

5. ✅ Quote submission notifications
   - Client badge/notification on new quote
   - "X bids received" indicator on work order

---

### Phase 2: Workflow Automation (Week 2)

**Priority: HIGH**

1. ✅ Auto-assign work order on quote acceptance
   - Remove admin intermediary step
   - Direct assignment to subcontractor
   - Automatic notifications

2. ✅ Category-based subcontractor filtering
   - Filter by work order category
   - Show only matching subcontractors in dropdown

3. ✅ Work order status dropdown navigation
   - Client portal: Filter by status
   - Admin portal: Filter with badge counts
   - Subcontractor portal: Organized sections

4. ✅ Invoice generation restrictions
   - Enable only when status = "Completed"
   - Validation & UI updates

5. ✅ Invoice send button improvement
   - One-click "Generate & Send"
   - Button state management (prevent duplicate sends)
   - "Invoice Sent ✓" confirmation state

---

### Phase 3: Calendar Integration (Week 3)

**Priority: HIGH**

1. ✅ Client Master Calendar
   - FullCalendar or React Big Calendar integration
   - Display all work orders for company
   - Multi-location filter
   - Month/Week/Day views

2. ✅ Admin Calendar
   - All clients view
   - Filter by client/location/status
   - Drag-and-drop rescheduling (optional)

3. ✅ Subcontractor Calendar
   - Personal schedule view
   - Assigned work orders only
   - Recurring work order display

4. ✅ Calendar event details
   - Hover tooltips
   - Click → Navigate to work order
   - Color-coded by status

5. ✅ Recurring work order calendar display
   - Visual distinction (icon/border)
   - Recurrence pattern tooltip
   - Edit series functionality

---

### Phase 4: Messaging System (Week 4)

**Priority: MEDIUM**

1. ✅ Work order chat functionality
   - Group chat (Client, Admin, Subcontractor)
   - Chat initiation button on work order page
   - Firebase Firestore chat storage

2. ✅ Messages portal page
   - List of all work order chats
   - WhatsApp-style interface
   - Real-time messaging

3. ✅ Chat features
   - Text messages
   - Photo/file attachments
   - Read receipts
   - Typing indicators
   - @mentions

4. ✅ Automated system messages
   - Status change notifications in chat
   - Completion notes posted automatically

5. ✅ Message notifications
   - Badge on "Messages" nav
   - Push to notification bell
   - Email notifications (optional)

---

### Phase 5: Enhanced Work Order Management (Week 5)

**Priority: MEDIUM**

1. ✅ Quote comparison interface
   - Side-by-side quote view
   - Sort & filter options
   - Accept quote with one click

2. ✅ Follow-up notes visibility
   - Display on work order detail page
   - Include completion photos
   - Auto-post to chat

3. ✅ Work order detail page improvements
   - Scheduled date/time prominently displayed
   - Created date, status timeline
   - All relevant information in one view

4. ✅ Work order filtering & search
   - Advanced filters (date range, category, status)
   - Search by work order number
   - Save filter preferences

---

### Phase 6: Dashboard Enhancements (Week 6)

**Priority: LOW**

1. ✅ Client dashboard widgets
   - Statistics cards
   - Calendar widget
   - Recent activity feed
   - Quick actions

2. ✅ Admin dashboard widgets
   - System overview
   - Pending approvals alerts
   - Calendar overview
   - Performance metrics

3. ✅ Subcontractor dashboard widgets
   - Personal statistics
   - Today's jobs
   - Calendar widget
   - Earnings summary

4. ✅ Dashboard customization
   - Widget preferences
   - Layout options
   - Dark mode (optional)

---

### Phase 7: Polish & Optimization (Ongoing)

**Priority: LOW**

1. ✅ Performance optimization
   - Code splitting
   - Image optimization
   - Database query optimization
   - Caching strategies

2. ✅ Accessibility improvements
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

3. ✅ Mobile responsiveness
   - Touch-friendly UI
   - Responsive layouts
   - Mobile-optimized calendar

4. ✅ Error handling & validation
   - Form validation (Zod schemas)
   - Error boundaries
   - User-friendly error messages

5. ✅ Testing
   - Unit tests (Jest)
   - Integration tests
   - E2E tests (Playwright/Cypress)

---

## Technology Recommendations

### State Management

**React Query (TanStack Query):**
```bash
npm install @tanstack/react-query
```
- Server state management
- Automatic caching & revalidation
- Optimistic updates
- Background refetching

**Zustand:**
```bash
npm install zustand
```
- Lightweight global state
- No boilerplate
- Perfect for UI state (notifications, modals, etc.)

---

### Calendar Libraries

**Option 1: FullCalendar (Recommended)**
```bash
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
```
- Feature-rich
- Drag-and-drop
- Multiple views
- Recurring events support
- Good documentation

**Option 2: React Big Calendar**
```bash
npm install react-big-calendar
```
- Simpler, lighter
- Good for basic calendar needs
- Google Calendar-like interface

---

### Form Management

**React Hook Form + Zod:**
```bash
npm install react-hook-form zod @hookform/resolvers
```
- Type-safe validation
- Minimal re-renders
- Great DX

Example:
```typescript
const schema = z.object({
  location: z.string().min(1, "Location is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(10, "Description too short"),
})

const { register, handleSubmit } = useForm({
  resolver: zodResolver(schema)
})
```

---

### Real-Time Communication

**Current: Firebase Firestore Listeners**
- Already integrated
- Real-time updates
- Good for notifications & chat

**Alternative: Socket.io** (if scaling issues)
```bash
npm install socket.io socket.io-client
```
- More control over real-time events
- Better for high-frequency updates

---

### UI Components

**Radix UI (Already installed):**
- Headless components
- Fully accessible
- Customizable with Tailwind

**Additional:**
```bash
npm install @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-avatar
```

---

### Animations

**Framer Motion:**
```bash
npm install framer-motion
```
- Smooth page transitions
- Notification animations
- Micro-interactions

Example:
```typescript
<motion.div
  initial={{ opacity: 0, y: -20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: 20 }}
>
  Notification content
</motion.div>
```

---

### Date Handling

**date-fns (Already installed):**
- Lightweight
- Tree-shakable
- Good for formatting & manipulation

Usage:
```typescript
import { format, addDays, isBefore } from 'date-fns'

const scheduledDate = format(workOrder.scheduledDate, 'PPP p')
// Output: "November 4, 2025 at 9:00 AM"
```

---

### PDF Generation

**Current: jsPDF (Already installed)**
- Works well for invoices

**Enhancement: react-pdf/renderer** (optional)
```bash
npm install @react-pdf/renderer
```
- React components for PDFs
- Better for complex layouts
- SSR-friendly

---

## Testing Strategy

### Unit Tests (Jest + React Testing Library)

**Already configured:**
- Component tests
- Hook tests
- Utility function tests

**Priority test coverage:**
1. Notification system
2. Quote acceptance workflow
3. Invoice generation validation
4. Calendar event rendering
5. Chat message sending

---

### Integration Tests

**Priority:**
1. Client work order creation → Admin approval flow
2. Quote submission → Client acceptance → Subcontractor assignment
3. Work completion → Invoice generation → Payment

---

### E2E Tests (Playwright recommended)

```bash
npm install -D @playwright/test
```

**Critical user journeys:**
1. Full work order lifecycle
2. Recurring work order creation & execution
3. Multi-location calendar filtering
4. Chat messaging across portals

---

## Security Considerations

### Firebase Security Rules

**Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Work Orders: Clients can only see their own
    match /workOrders/{workOrderId} {
      allow read: if isAdmin()
        || (isClient() && resource.data.clientId == request.auth.uid)
        || (isSubcontractor() && resource.data.assignedSubcontractor == request.auth.uid);

      allow create: if isClient() || isAdmin();
      allow update: if isAdmin()
        || (isClient() && resource.data.clientId == request.auth.uid)
        || (isSubcontractor() && resource.data.assignedSubcontractor == request.auth.uid);
    }

    // Notifications: Users can only see their own
    match /notifications/{notificationId} {
      allow read, write: if request.auth.uid == resource.data.userId || isAdmin();
    }

    // Chat messages: Only participants can access
    match /workOrderChats/{chatId}/messages/{messageId} {
      allow read, write: if isParticipant(chatId);
    }

    // Helper functions
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    function isClient() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'client';
    }

    function isSubcontractor() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'subcontractor';
    }

    function isParticipant(chatId) {
      return request.auth.uid in get(/databases/$(database)/documents/workOrderChats/$(chatId)).data.participants;
    }
  }
}
```

---

### Input Validation

**Always validate:**
- File uploads (type, size)
- Form inputs (Zod schemas)
- API requests (Next.js API routes)

**Example:**
```typescript
// API route validation
import { z } from 'zod'

const workOrderSchema = z.object({
  locationId: z.string().uuid(),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'general']),
  description: z.string().min(10).max(1000),
  photos: z.array(z.string().url()).max(10),
})

export async function POST(req: Request) {
  const body = await req.json()
  const validated = workOrderSchema.parse(body) // Throws if invalid

  // Proceed with validated data
}
```

---

### XSS Protection

- Sanitize user input (especially chat messages)
- Use React's built-in XSS protection (JSX escaping)
- Validate file uploads

---

### CSRF Protection

- Next.js API routes with proper authentication
- Verify Firebase ID tokens on every request

---

## Deployment & DevOps

### Environment Variables

**Required `.env.local`:**
```env
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (Server-side)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# SendGrid
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://www.groundops.co
```

---

### Vercel Deployment

**Recommended settings:**
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`
- Node Version: 20.x

**Environment Variables:**
- Add all `.env.local` variables to Vercel project settings
- Different values for production vs. preview deployments

---

### Monitoring & Analytics

**Recommended:**
1. **Vercel Analytics** (built-in)
   - Page views
   - Core Web Vitals
   - Performance metrics

2. **Sentry** (error tracking)
   ```bash
   npm install @sentry/nextjs
   ```
   - Real-time error alerts
   - Performance monitoring
   - User feedback

3. **Firebase Analytics** (optional)
   - User behavior tracking
   - Custom events (work order created, quote submitted, etc.)

---

## Appendix

### Glossary

- **Work Order (WO):** A request for facility maintenance or service
- **Recurring Work Order:** Automatically scheduled work order that repeats on a pattern
- **Quote/Bid:** Price proposal submitted by subcontractor for a work order
- **Master Calendar:** Comprehensive calendar view showing all work orders (client context: all locations)
- **Follow-up Notes:** Completion details submitted by subcontractor after finishing work
- **Category:** Service type classification (Plumbing, Electrical, HVAC, etc.)

---

### Contact & Support

**Development Team:**
- Platform: Hey Spruce App v2
- Technology: Next.js 14, React 18, Firebase, TypeScript
- Deployment: Vercel
- Repository: [To be added]

---

### Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Nov 3, 2025 | Initial requirements document | [Name] |

---

## Summary Checklist

### Must-Have Features (Phase 1-3)
- [ ] Fix address display bug
- [ ] Notification system (badges & bell)
- [ ] Location approval notifications
- [ ] Work order approval notifications
- [ ] Quote submission notifications
- [ ] Auto-assign on quote acceptance
- [ ] Category-based subcontractor filtering
- [ ] Work order status dropdown navigation
- [ ] Invoice generation restrictions
- [ ] Invoice send button improvement
- [ ] Client master calendar
- [ ] Admin calendar
- [ ] Subcontractor calendar
- [ ] Recurring work order calendar display

### Should-Have Features (Phase 4-5)
- [ ] Work order chat functionality
- [ ] Messages portal page
- [ ] Quote comparison interface
- [ ] Follow-up notes visibility
- [ ] Work order detail improvements
- [ ] Advanced filtering & search

### Nice-to-Have Features (Phase 6-7)
- [ ] Enhanced dashboard widgets
- [ ] Dashboard customization
- [ ] Performance optimization
- [ ] Mobile responsiveness
- [ ] Comprehensive testing

---

**END OF REQUIREMENTS DOCUMENT**
