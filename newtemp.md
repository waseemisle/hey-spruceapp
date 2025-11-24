# Dashboard Requirements - ServiceChannel Style Layout
## Based on screenshot_temp.png

**Date:** Current
**Document Version:** 1.0
**Purpose:** Transform all three portals (Admin, Client, Subcontractor) to match the ServiceChannel dashboard layout shown in screenshot_temp.png

---

## 📋 EXECUTIVE SUMMARY

The user wants all three portals (Admin Portal, Client Portal, and Subcontractor Portal) to have dashboards that match the exact layout and structure shown in the screenshot. The screenshot displays a ServiceChannel-style dashboard with:

1. **Header Section** - Logo, navigation menu, user info
2. **Search and Action Bar** - Search dropdown, search input, "Create Service Request" button
3. **Three Main Content Sections:**
   - **Work Orders** section with categorized status columns
   - **Proposals** section (Note: In this system, "Proposals" = "Quotes")
   - **Invoices** section with categorized status columns

---

## 🎨 VISUAL LAYOUT REQUIREMENTS

### Header Section
- **Top Left:** Logo (ServiceChannel/Spruce App logo) with hamburger menu icon
- **Top Center:** Horizontal navigation bar with links:
  - Work Orders
  - Proposals (Quotes)
  - RFPs (if applicable)
  - Invoices
  - QuickView (if applicable)
  - Provider Search (if applicable)
- **Top Right:** 
  - Chat bubble icon
  - Person/user icon
  - User name/account info with dropdown arrow (e.g., "DEMO-PRESENT...")

### Search and Action Bar
- **Left:** Dropdown menu labeled "by Tracking #" (or similar search criteria selector)
- **Center:** Input field labeled "Exact Search..." for entering search queries
- **Right:** Blue search button with magnifying glass icon
- **Far Right:** Prominent blue button labeled "Create Service Request" (contextual per portal)

### Main Content Area
The dashboard should display three main sections side by side (or stacked on mobile):

1. **Work Orders Section**
2. **Proposals Section** (Quotes)
3. **Invoices Section**

Each section should have:
- Section title with external link icon
- Settings/gear icon on the far right (for configuration)
- Multiple status category columns with counts

---

## 📊 SECTION 1: WORK ORDERS

### Section Title
- Display: "Work Orders"
- Include small external link icon next to title
- Include settings/gear icon on far right

### Category Columns (Based on Screenshot)

#### Column 1: "Work Required" (Total: 209)
- **Sub-categories:**
  - "Dispatch Not Confirmed" - Shows count like "19/99" (19 in red, 99 total)
  - "Declined By Provider" - Shows count like "0/0"
  - "Late to Arrive" - Shows count like "2/89" (2 in red, 89 total)

**Status Mapping for "Work Required":**
- `dispatch_not_confirmed`: Work orders that are approved but not yet dispatched/assigned
- `declined_by_provider`: Work orders declined by subcontractor
- `late_to_arrive`: Work orders where scheduled time has passed but work hasn't started

#### Column 2: "In Progress" (Total: 1)
- **Sub-categories:**
  - "Parts on Order" - Shows count like "1/0" (1 in red)
  - "Waiting for Quote" - Shows count like "0/0"
  - "Unsatisfactory" - Shows count like "0"

**Status Mapping for "In Progress":**
- `parts_on_order`: Work orders assigned but waiting for parts
- `waiting_for_quote`: Work orders in bidding phase
- `unsatisfactory`: Work orders marked as unsatisfactory by client

#### Column 3: "Awaiting Action" (Total: 28)
- **Sub-categories:**
  - "Pending Confirmation" - Shows count like "16" (in blue)
  - "Action Required Work Orders" - Shows count like "10" with info icon
  - "My Action Required Work Orders" - Shows count like "2" (in red) with info icon

**Status Mapping for "Awaiting Action":**
- `pending_confirmation`: Work orders pending admin/client confirmation
- `action_required`: Work orders requiring immediate action
- `my_action_required`: Work orders specifically assigned to current user requiring action

### Portal-Specific Work Orders Display

#### Admin Portal:
- Show all work orders across all clients
- Categories should reflect admin's view of all work orders
- "My Action Required" = Work orders assigned to admin or requiring admin review

#### Client Portal:
- Show only work orders for the logged-in client
- Filter by client's assigned locations
- "My Action Required" = Work orders requiring client approval/action

#### Subcontractor Portal:
- Show work orders relevant to subcontractor:
  - Available for bidding
  - Assigned to them
  - In progress by them
- "My Action Required" = Work orders assigned to subcontractor requiring their action

---

## 📋 SECTION 2: PROPOSALS (QUOTES)

**IMPORTANT:** In this system, "Proposals" = "Quotes". The section should be labeled "Proposals" but display Quote data.

### Section Title
- Display: "Proposals"
- Include small external link icon next to title
- Note: This refers to Quotes in the system

### Category Columns (Based on Screenshot)

#### Column 1: "Pending Approval" 
- Shows count like "0/0" (0 in red, 0 total)
- **Status Mapping:** Quotes with status `pending` (not yet sent to client)

#### Column 2: "On Hold"
- Shows count like "0"
- **Status Mapping:** Quotes that are on hold (may need new status or use a flag)

#### Column 3: "Rejected"
- Shows count like "0"
- **Status Mapping:** Quotes with status `rejected`

#### Column 4: "Approved"
- Shows count like "1" (in blue)
- **Status Mapping:** Quotes with status `accepted`

### Portal-Specific Proposals/Quotes Display

#### Admin Portal:
- Show all quotes across all clients
- "Pending Approval" = Quotes with status `pending` (admin needs to review/forward)
- "On Hold" = Quotes that admin has put on hold
- "Rejected" = Quotes rejected by client or admin
- "Approved" = Quotes accepted by client

#### Client Portal:
- Show only quotes for the logged-in client
- "Pending Approval" = Quotes with status `sent_to_client` (awaiting client approval)
- "On Hold" = Quotes client has put on hold
- "Rejected" = Quotes client has rejected
- "Approved" = Quotes client has accepted

#### Subcontractor Portal:
- Show only quotes submitted by the logged-in subcontractor
- "Pending Approval" = Quotes with status `pending` (submitted, awaiting admin review)
- "On Hold" = Quotes on hold
- "Rejected" = Quotes rejected by client or admin
- "Approved" = Quotes accepted by client

---

## 💰 SECTION 3: INVOICES

### Section Title
- Display: "Invoices"
- Include small external link icon next to title

### Category Columns (Based on Screenshot)

#### Column 1: "Completed Not Invoiced"
- Shows count like "88" (in blue)
- **Status Mapping:** Work orders that are `completed` but don't have an invoice yet

#### Column 2: "Open & Reviewed"
- Shows count like "1147" (in blue)
- Shows "Mixed Currency" text below count
- **Status Mapping:** Invoices with status `sent` (sent to client, awaiting payment)

#### Column 3: "On Hold"
- Shows count like "0" with "0.00" below it
- **Status Mapping:** Invoices with status `draft` or on hold

#### Column 4: "Rejected"
- Shows count like "0" with "0.00" below it
- **Status Mapping:** Invoices that have been rejected (may need new status)

### Portal-Specific Invoices Display

#### Admin Portal:
- Show all invoices across all clients
- "Completed Not Invoiced" = Completed work orders without invoices
- "Open & Reviewed" = Invoices with status `sent`
- "On Hold" = Invoices with status `draft` or on hold
- "Rejected" = Rejected invoices

#### Client Portal:
- Show only invoices for the logged-in client
- "Completed Not Invoiced" = Client's completed work orders without invoices
- "Open & Reviewed" = Invoices with status `sent` (awaiting payment)
- "On Hold" = Invoices on hold
- "Rejected" = Rejected invoices

#### Subcontractor Portal:
- Show invoices related to subcontractor's work
- "Completed Not Invoiced" = Subcontractor's completed work without invoices
- "Open & Reviewed" = Invoices for subcontractor's work that are open
- "On Hold" = Invoices on hold
- "Rejected" = Rejected invoices

---

## 🔍 SEARCH FUNCTIONALITY

### Search Bar Components
1. **Dropdown Selector:**
   - Label: "by Tracking #" (or similar)
   - Options:
     - by Tracking #
     - by Work Order #
     - by Quote/Proposal #
     - by Invoice #
     - by Client Name
     - by Subcontractor Name
     - by Location

2. **Search Input:**
   - Placeholder: "Exact Search..."
   - Should filter results based on selected dropdown option

3. **Search Button:**
   - Blue button with magnifying glass icon
   - Executes search based on selected criteria

### Search Behavior
- Search should filter all three sections (Work Orders, Proposals, Invoices)
- Results should update in real-time as user types (optional enhancement)
- Search should be case-insensitive

---

## ➕ CREATE SERVICE REQUEST BUTTON

### Button Location
- Far right of the search bar
- Prominent blue button
- Label: "Create Service Request"

### Portal-Specific Actions

#### Admin Portal:
- Button: "Create Work Order"
- Action: Navigate to `/admin-portal/work-orders` with create modal/form

#### Client Portal:
- Button: "Create Service Request" or "Create Work Order"
- Action: Navigate to `/client-portal/work-orders/create`

#### Subcontractor Portal:
- Button: "Create Service Request" (may not be applicable)
- Action: Could be disabled or navigate to appropriate page

---

## 🎨 DESIGN SPECIFICATIONS

### Color Scheme
- **Primary Blue:** Used for buttons, links, and highlighted numbers
- **Red:** Used for urgent/action-required counts
- **White Background:** Clean, modern interface
- **Blue Accents:** Throughout the interface

### Typography
- Section titles: Bold, larger font
- Counts: Large, bold numbers
- Sub-categories: Smaller, regular font
- Labels: Medium weight

### Layout
- **Desktop:** Three sections side by side
- **Tablet:** Two sections per row, then one
- **Mobile:** Stacked vertically

### Icons
- External link icon: Small icon next to section titles
- Settings/gear icon: Far right of each section
- Info icon: Next to "Action Required" items
- Magnifying glass: Search button
- Chat bubble: Header
- User icon: Header

### Number Display Format
- Format: "X/Y" where X is current count (may be in red), Y is total
- Or just "X" for single counts
- Currency: Display "0.00" format for invoice amounts
- "Mixed Currency" text below counts when applicable

---

## 📱 RESPONSIVE DESIGN

### Desktop (≥1024px)
- Three sections in a row
- Full search bar visible
- All navigation items visible

### Tablet (768px - 1023px)
- Two sections per row
- Search bar may wrap
- Navigation may collapse to hamburger menu

### Mobile (<768px)
- Sections stack vertically
- Search bar stacks vertically
- Hamburger menu for navigation
- Touch-friendly button sizes

---

## 🔄 REAL-TIME UPDATES

### Requirements
- All counts should update in real-time using Firestore listeners
- No page refresh needed when data changes
- Smooth transitions when numbers update

### Implementation Notes
- Use `onSnapshot` from Firestore for real-time listeners
- Update counts when:
  - New work orders are created
  - Work order status changes
  - New quotes are submitted
  - Quote status changes
  - Invoices are created or updated
  - Invoice status changes

---

## 🗂️ DATA STRUCTURE REQUIREMENTS

### Work Order Status Mapping

Current statuses in system:
- `pending` → "Pending Confirmation" (Awaiting Action)
- `approved` → "Dispatch Not Confirmed" (Work Required)
- `rejected` → Not shown (or in separate category)
- `quote_received` / `quotes_received` → "Waiting for Quote" (In Progress)
- `assigned` → "Parts on Order" or "In Progress"
- `in-progress` → "In Progress"
- `completed` → "Completed Not Invoiced" (if no invoice) or removed from Work Orders

**New Status Categories Needed:**
- `dispatch_not_confirmed` - Approved but not dispatched
- `declined_by_provider` - Declined by subcontractor
- `late_to_arrive` - Scheduled time passed
- `parts_on_order` - Waiting for parts
- `unsatisfactory` - Marked as unsatisfactory
- `action_required` - Requires immediate action
- `my_action_required` - Requires current user's action

### Quote/Proposal Status Mapping

Current statuses in system:
- `pending` → "Pending Approval" (admin review)
- `sent_to_client` → "Pending Approval" (client review)
- `accepted` → "Approved"
- `rejected` → "Rejected"

**New Status Needed:**
- `on_hold` - Quote on hold

### Invoice Status Mapping

Current statuses in system:
- `draft` → "On Hold"
- `sent` → "Open & Reviewed"
- `paid` → Not shown (or separate category)
- `overdue` → "Open & Reviewed" (with overdue indicator)

**New Categories Needed:**
- "Completed Not Invoiced" - Work orders completed but no invoice created
- "Rejected" - Rejected invoices (may need new status)

---

## 🔗 NAVIGATION REQUIREMENTS

### Header Navigation Links

#### Admin Portal:
- Work Orders → `/admin-portal/work-orders`
- Proposals → `/admin-portal/quotes`
- RFPs → (if applicable)
- Invoices → `/admin-portal/invoices`
- QuickView → (if applicable)
- Provider Search → `/admin-portal/subcontractors` (or search page)

#### Client Portal:
- Work Orders → `/client-portal/work-orders`
- Proposals → `/client-portal/quotes`
- RFPs → (if applicable)
- Invoices → `/client-portal/invoices`
- QuickView → (if applicable)
- Provider Search → (if applicable)

#### Subcontractor Portal:
- Work Orders → `/subcontractor-portal/bidding` or `/subcontractor-portal/assigned`
- Proposals → `/subcontractor-portal/quotes`
- RFPs → (if applicable)
- Invoices → (if applicable)
- QuickView → (if applicable)
- Provider Search → (if applicable)

### Section Title Links
- Clicking on section title (e.g., "Work Orders") should navigate to the full page for that section
- External link icon indicates clickable

---

## ⚙️ SETTINGS/GEAR ICON FUNCTIONALITY

### Per Section Settings
Each section should have a gear/settings icon that allows:
- Filter preferences
- Column visibility
- Display options
- Export options
- Refresh data

---

## 📊 COUNT CALCULATION LOGIC

### Work Orders Counts

#### "Work Required" Total:
```
Sum of:
- dispatch_not_confirmed count
- declined_by_provider count
- late_to_arrive count
```

#### "In Progress" Total:
```
Sum of:
- parts_on_order count
- waiting_for_quote count
- unsatisfactory count
```

#### "Awaiting Action" Total:
```
Sum of:
- pending_confirmation count
- action_required count
- my_action_required count
```

### Proposals/Quotes Counts

#### "Pending Approval":
- Count of quotes with status `pending` (admin) or `sent_to_client` (client)

#### "On Hold":
- Count of quotes with status `on_hold` or flag set

#### "Rejected":
- Count of quotes with status `rejected`

#### "Approved":
- Count of quotes with status `accepted`

### Invoices Counts

#### "Completed Not Invoiced":
- Count of work orders with status `completed` AND no associated invoice

#### "Open & Reviewed":
- Count of invoices with status `sent`

#### "On Hold":
- Count of invoices with status `draft` or on hold flag

#### "Rejected":
- Count of rejected invoices

---

## 🎯 PORTAL-SPECIFIC IMPLEMENTATION DETAILS

### Admin Portal Dashboard (`/admin-portal/page.tsx`)

**Current State:**
- Shows stat cards in grid layout
- Displays calendar
- Shows pending approvals counts

**Required Changes:**
- Replace current dashboard with ServiceChannel-style layout
- Add three main sections: Work Orders, Proposals, Invoices
- Add search bar with dropdown and "Create Work Order" button
- Update header navigation to match screenshot style
- Remove or relocate calendar (or keep as separate section below)

**Data Queries:**
- Query all work orders (no client filter)
- Query all quotes (no client filter)
- Query all invoices (no client filter)
- Calculate counts for each category

### Client Portal Dashboard (`/client-portal/page.tsx`)

**Current State:**
- Shows stat cards for locations, work orders, quotes, invoices
- Displays calendar with location filter

**Required Changes:**
- Replace current dashboard with ServiceChannel-style layout
- Add three main sections filtered by client
- Add search bar with dropdown and "Create Service Request" button
- Update header navigation
- Filter all data by `clientId` or `assignedLocations`

**Data Queries:**
- Query work orders where `clientId == currentUser.uid` OR `locationId in assignedLocations`
- Query quotes where `clientId == currentUser.uid`
- Query invoices where `clientId == currentUser.uid`
- Calculate counts for each category

### Subcontractor Portal Dashboard (`/subcontractor-portal/page.tsx`)

**Current State:**
- Shows stat cards for available jobs, submitted quotes, assigned jobs, earnings
- Displays calendar

**Required Changes:**
- Replace current dashboard with ServiceChannel-style layout
- Add three main sections filtered by subcontractor
- Add search bar (may not need "Create Service Request" button)
- Update header navigation
- Filter all data by `subcontractorId`

**Data Queries:**
- Query work orders from `biddingWorkOrders` and `assignedJobs` collections
- Query quotes where `subcontractorId == currentUser.uid`
- Query invoices related to subcontractor's work
- Calculate counts for each category

---

## 🔄 MIGRATION STRATEGY

### Phase 1: Data Model Updates
1. Add new work order status values if needed
2. Add `on_hold` status for quotes if needed
3. Ensure invoice statuses support all categories
4. Add flags for "action_required" and "my_action_required"

### Phase 2: Component Creation
1. Create reusable dashboard section components:
   - `WorkOrdersSection.tsx`
   - `ProposalsSection.tsx` (Quotes)
   - `InvoicesSection.tsx`
2. Create search bar component: `DashboardSearchBar.tsx`
3. Update header navigation components

### Phase 3: Dashboard Updates
1. Update Admin Portal dashboard
2. Update Client Portal dashboard
3. Update Subcontractor Portal dashboard

### Phase 4: Testing
1. Test real-time updates
2. Test search functionality
3. Test responsive design
4. Test portal-specific filtering

---

## 📝 ADDITIONAL NOTES

### Important Considerations
1. **Terminology:** "Proposals" = "Quotes" in this system. UI should say "Proposals" but use Quote data.
2. **Real-time:** All counts must update in real-time without page refresh.
3. **Performance:** Use efficient Firestore queries with proper indexes.
4. **Accessibility:** Ensure all interactive elements are keyboard accessible.
5. **Loading States:** Show loading indicators while fetching data.
6. **Error Handling:** Display error messages if data fetch fails.

### Future Enhancements (Optional)
1. Export functionality from each section
2. Customizable dashboard layout
3. Drag-and-drop section reordering
4. Date range filters
5. Advanced search with multiple criteria
6. Quick actions from dashboard (approve, reject, etc.)

---

## ✅ ACCEPTANCE CRITERIA

The implementation will be considered complete when:

1. ✅ All three portals display the ServiceChannel-style dashboard layout
2. ✅ Work Orders section shows three category columns with correct counts
3. ✅ Proposals section shows four category columns with correct counts
4. ✅ Invoices section shows four category columns with correct counts
5. ✅ Search bar with dropdown and search functionality works
6. ✅ "Create Service Request" button appears and functions correctly per portal
7. ✅ Header navigation matches screenshot style
8. ✅ All counts update in real-time
9. ✅ Portal-specific filtering works correctly
10. ✅ Responsive design works on mobile, tablet, and desktop
11. ✅ All links navigate to correct pages
12. ✅ Settings/gear icons are present (functionality can be added later)
13. ✅ External link icons are present on section titles
14. ✅ Color scheme matches screenshot (blue accents, red for urgent items)
15. ✅ Number formatting matches screenshot (X/Y format, currency format)

---

## 📎 REFERENCE FILES

### Current Dashboard Files:
- `app/admin-portal/page.tsx` - Admin dashboard
- `app/client-portal/page.tsx` - Client dashboard
- `app/subcontractor-portal/page.tsx` - Subcontractor dashboard

### Layout Files:
- `components/admin-layout.tsx` - Admin layout with navigation
- `components/client-layout.tsx` - Client layout with navigation
- `components/subcontractor-layout.tsx` - Subcontractor layout with navigation

### Data Model Files:
- `types/index.ts` - TypeScript type definitions

### Related Pages:
- `app/admin-portal/work-orders/page.tsx` - Work orders management
- `app/admin-portal/quotes/page.tsx` - Quotes management
- `app/admin-portal/invoices/page.tsx` - Invoices management
- `app/client-portal/work-orders/page.tsx` - Client work orders
- `app/client-portal/quotes/page.tsx` - Client quotes
- `app/client-portal/invoices/page.tsx` - Client invoices

---

## 🎬 IMPLEMENTATION PRIORITY

1. **High Priority:**
   - Dashboard layout structure
   - Three main sections (Work Orders, Proposals, Invoices)
   - Basic count calculations
   - Portal-specific data filtering

2. **Medium Priority:**
   - Search functionality
   - Real-time updates
   - Header navigation updates
   - "Create Service Request" button

3. **Low Priority:**
   - Settings/gear icon functionality
   - Advanced filtering
   - Export functionality
   - Customizable layout

---

**END OF DOCUMENT**

