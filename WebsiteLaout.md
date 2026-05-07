# Website UI Layout Prompt (Reference: Companies Permissions page)

Use this as a **single source of truth** prompt to give another coding model (e.g. Claude) so it can restyle pages to match the UI/UX of:

- `app/admin-portal/companies-permissions/page.tsx` (Companies Permissions)

The goal: **every page in this website** should look and feel like this page—same spacing, typography, surfaces, cards, tabs, master-detail patterns, and theme-aware styling.

---

## Objective

Update the entire web app UI to follow a consistent, modern portal design system:

- One scroll surface per page (avoid nested scroll panels unless absolutely required)
- Rounded “soft” surfaces (`rounded-2xl` / `rounded-xl`) with subtle borders and shadows
- Theme-aware styling (light + dark), using design tokens like `bg-card`, `bg-muted`, `border-border`, `text-muted-foreground`
- Strong information hierarchy: **Hero header → stats → master-detail/tabs → content sections**
- Clear affordances: hover states, ring outlines for selection, pill badges, compact iconography

---

## Hard requirements (do not deviate)

### Layout wrappers

- **Scope**: Apply this to **all route pages** in the repo: **100 pages total** (`app/**/page.tsx`).
- Every page in `app/**/page.tsx` must be wrapped in the correct layout component:
  - Admin: `AdminLayout`
  - Client: `ClientLayout`
  - Subcontractor: `SubcontractorLayout`
- Inside layout, wrap content in `PageContainer` (preferred) or a root `<div className="space-y-6">`.

### Typography + spacing

- Page content vertical rhythm is consistent: `space-y-4` or `space-y-6` at the top-level.
- Titles:
  - Primary title: `text-xl sm:text-2xl font-bold tracking-tight`
  - Secondary card titles: `text-sm font-semibold`
- Descriptions/subtitles:
  - `text-sm text-muted-foreground`
  - secondary helper text: `text-xs text-muted-foreground`

### Surface system (tokens)

Use the semantic Tailwind tokens already used by the app:

- Surfaces: `bg-card`, `bg-muted/30`, `bg-muted/20`, `bg-blue-50`, etc.
- Borders: `border border-border`, stronger emphasis borders for selected states
- Text: `text-foreground`, `text-muted-foreground`
- Shadows: `shadow-sm` on cards; `hover:shadow-md` on hoverable cards

Avoid hardcoding raw grays (like `text-gray-900`) unless the existing file already uses them. Prefer tokens to keep dark-mode correct.

---

## Reference components & patterns to reuse everywhere

### 1) Hero header (gradient panel)

Replicate the Companies Permissions hero header pattern:

- Container:
  - `relative overflow-hidden rounded-2xl border border-border`
  - Gradient background: `bg-gradient-to-br from-blue-50 via-card to-purple-50/60`
  - Dark mode: `dark:from-blue-950/30 dark:via-card dark:to-purple-950/20`
  - Decorative blobs: two absolutely positioned blurred circles (`blur-3xl`) with low opacity
- Content row:
  - `p-5 sm:p-6`
  - Left: icon-in-card (`rounded-xl bg-card border border-border shadow-sm p-3`) + title/subtitle
  - Right: optional compact stat pill row (desktop-only)

### 2) Stats row

Use `StatCards` when a page has obvious counts/metrics. Keep the same “4-up” density:

- Grid: `grid grid-cols-2 sm:grid-cols-4 gap-3`
- Each stat card uses semantic colors and icon + value + label.

### 3) Master-detail on desktop

Prefer this structure for “lists with detail” experiences:

- Grid:
  - `grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4`
- Left rail:
  - `bg-card rounded-2xl border border-border shadow-sm overflow-hidden`
  - Header strip: `px-4 py-3 border-b border-border bg-muted/30`
  - Search input with left icon
  - List items as buttons:
    - Selected: `bg-blue-50 ... ring-1 ring-blue-200 ... shadow-sm`
    - Default: `hover:bg-muted/60`
  - Each item: small avatar + name + metadata line + chevron
- Right panel:
  - On mobile, show a back button (`variant="ghost" size="sm"`)
  - Detail area uses **stacked cards** with `space-y-4`

Important: **Avoid inner scrollbars** inside rail/panel. The document should scroll.

### 4) Tabs

Tabs should look like the Companies Permissions tabs:

- Tab bar:
  - `border-t border-border bg-muted/30 px-3 sm:px-4 flex`
- Tab button:
  - `relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium`
  - Active: `text-blue-700 dark:text-blue-300` + bottom indicator `h-0.5 bg-blue-600`
  - Inactive: `text-muted-foreground hover:text-foreground`
- Include a count pill on each tab.

### 5) Setting cards (strip accent)

For “settings / toggles / config panels”, use the `SettingCard` pattern:

- Card:
  - `relative bg-card rounded-2xl border border-border shadow-sm overflow-hidden`
  - Left accent stripe via `before:` pseudo-element
- Header:
  - icon in rounded background + title + description
  - optional right-side “status badge”
- Body:
  - settings content
- Footer:
  - `flex justify-end mt-4 pt-4 border-t border-border`
  - primary action button (Save)

### 6) Switch & pill badges

Use:

- The modern `Switch` pattern (button with `role="switch"`, animated knob, disabled opacity)
- Status pills:
  - `inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border`
  - Dot indicator `h-1.5 w-1.5 rounded-full`

### 7) Tables and list views

If a page needs a table:

- wrapper: `bg-card rounded-xl border border-border shadow-sm overflow-hidden`
- header row: `border-b border-border bg-muted`
- row hover: `hover:bg-muted transition-colors`

### 8) Empty states / loading

- Empty state: `bg-card rounded-xl border border-border p-16 text-center` (or use `EmptyState`)
- Loading spinner: `animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600`

---

## Interactions and UX rules

- **Fast feedback**: always show `toast.success` / `toast.error` for mutations.
- **Disable buttons** while saving; show “Saving…” states.
- **Accessibility**:
  - use `aria-checked` / `role="switch"` for switches
  - ensure buttons have labels, not only icons (or add `title`)
- **Don’t regress mobile UX**:
  - master-detail collapses: left rail hidden when item selected, with a back button
  - avoid overflow traps

---

## Component usage guidance

Prefer these shared components when building pages:

- `@/components/ui/page-container`
- `@/components/ui/page-header`
- `@/components/ui/stat-cards`
- `@/components/ui/empty-state`
- `@/components/ui/button`
- `@/components/ui/input`
- `@/components/ui/checkbox`
- `sonner` toasts
- `lucide-react` icons (small, consistent sizes)

If a page is inconsistent today, refactor it toward these components rather than ad-hoc Tailwind.

---

## Work approach for Claude (how to execute)

When applying this across the website (ALL 100 pages):

1. Use the page inventory below as the checklist. Do not skip any file.
2. For each page (`page.tsx`):
   - Wrap content in `PageContainer` and ensure `space-y-6`
   - Add a hero header (title, subtitle, icon) consistent with Companies Permissions
   - Add stats row if the page has any totals
   - Convert list/detail pages to the master-detail layout where applicable
   - Replace any raw/legacy UI with the card/table/toolbar patterns above
3. Maintain existing business logic; this is a **styling/layout refactor**, not a behavioral rewrite.
4. Keep dark mode correct by using tokens (`bg-card`, `border-border`, etc.).
5. Acceptance criteria for “done”:
   - All pages have consistent header + spacing + surface system
   - No page introduces a second scrollbar region (unless it is a deliberate table horizontal scroll)
   - Buttons/inputs/tables use shared UI components where possible
   - Dark mode does not break contrast (use tokens rather than hard-coded grays)
   - `npm run build` passes (typecheck + lint)

---

## Page inventory (ALL pages that must match this layout)

These are the **100 route pages** (each file is a page). Restyle **every** one.

### Admin portal (51)

- `app/admin-portal/page.tsx`
- `app/admin-portal/account-settings/page.tsx`
- `app/admin-portal/admin-users/page.tsx`
- `app/admin-portal/analytics/page.tsx`
- `app/admin-portal/assets/page.tsx`
- `app/admin-portal/categories/page.tsx`
- `app/admin-portal/companies-permissions/page.tsx`
- `app/admin-portal/contractor-scorecard/page.tsx`
- `app/admin-portal/cron-jobs/page.tsx`
- `app/admin-portal/email-logs/page.tsx`
- `app/admin-portal/invoices/page.tsx`
- `app/admin-portal/invoices/new/page.tsx`
- `app/admin-portal/invoices/standard/page.tsx`
- `app/admin-portal/invoices/[id]/page.tsx`
- `app/admin-portal/locations/page.tsx`
- `app/admin-portal/locations/[id]/page.tsx`
- `app/admin-portal/maint-requests/page.tsx`
- `app/admin-portal/messages/page.tsx`
- `app/admin-portal/payment-logs/page.tsx`
- `app/admin-portal/payment-logs/[id]/page.tsx`
- `app/admin-portal/provider-search/page.tsx`
- `app/admin-portal/quotes/page.tsx`
- `app/admin-portal/quotes/[id]/page.tsx`
- `app/admin-portal/recurring-work-orders/page.tsx`
- `app/admin-portal/recurring-work-orders/create/page.tsx`
- `app/admin-portal/recurring-work-orders/location-map/page.tsx`
- `app/admin-portal/recurring-work-orders/[id]/page.tsx`
- `app/admin-portal/recurring-work-orders/[id]/edit/page.tsx`
- `app/admin-portal/rejected-work-orders/page.tsx`
- `app/admin-portal/reports/page.tsx`
- `app/admin-portal/resources/page.tsx`
- `app/admin-portal/rfps/page.tsx`
- `app/admin-portal/sandbox-refresh/page.tsx`
- `app/admin-portal/scheduled-invoices/page.tsx`
- `app/admin-portal/scheduled-invoices/create/page.tsx`
- `app/admin-portal/scheduled-invoices/[id]/page.tsx`
- `app/admin-portal/scheduled-invoices/[id]/edit/page.tsx`
- `app/admin-portal/subcontractors/page.tsx`
- `app/admin-portal/subcontractors/[id]/page.tsx`
- `app/admin-portal/subsidiaries/page.tsx`
- `app/admin-portal/subsidiaries/[id]/page.tsx`
- `app/admin-portal/support-tickets/page.tsx`
- `app/admin-portal/support-tickets/[id]/page.tsx`
- `app/admin-portal/user-activity/page.tsx`
- `app/admin-portal/work-orders/page.tsx`
- `app/admin-portal/work-orders/maintenance-requests/page.tsx`
- `app/admin-portal/work-orders/standard/page.tsx`
- `app/admin-portal/work-orders/[id]/page.tsx`
- `app/admin-portal/work-orders/create/guided/page.tsx`

### Client portal (26)

- `app/client-portal/page.tsx`
- `app/client-portal/account-settings/page.tsx`
- `app/client-portal/diagnostic-requests/page.tsx`
- `app/client-portal/diagnostic-requests/[id]/page.tsx`
- `app/client-portal/invoices/page.tsx`
- `app/client-portal/invoices/[id]/page.tsx`
- `app/client-portal/locations/page.tsx`
- `app/client-portal/locations/create/page.tsx`
- `app/client-portal/maintenance-requests/page.tsx`
- `app/client-portal/messages/page.tsx`
- `app/client-portal/payment-methods/page.tsx`
- `app/client-portal/quotes/page.tsx`
- `app/client-portal/quotes/[id]/page.tsx`
- `app/client-portal/recurring-work-orders/page.tsx`
- `app/client-portal/recurring-work-orders/create/page.tsx`
- `app/client-portal/recurring-work-orders/[id]/page.tsx`
- `app/client-portal/recurring-work-orders/[id]/edit/page.tsx`
- `app/client-portal/subcontractors/page.tsx`
- `app/client-portal/subsidiaries/page.tsx`
- `app/client-portal/subsidiaries/create/page.tsx`
- `app/client-portal/support-tickets/page.tsx`
- `app/client-portal/support-tickets/[id]/page.tsx`
- `app/client-portal/work-orders/page.tsx`
- `app/client-portal/work-orders/create/page.tsx`
- `app/client-portal/work-orders/maintenance-requests/page.tsx`
- `app/client-portal/work-orders/[id]/page.tsx`

### Subcontractor portal (10)

- `app/subcontractor-portal/page.tsx`
- `app/subcontractor-portal/account-settings/page.tsx`
- `app/subcontractor-portal/assigned/page.tsx`
- `app/subcontractor-portal/bidding/page.tsx`
- `app/subcontractor-portal/completed-jobs/page.tsx`
- `app/subcontractor-portal/messages/page.tsx`
- `app/subcontractor-portal/quotes/page.tsx`
- `app/subcontractor-portal/support-tickets/page.tsx`
- `app/subcontractor-portal/support-tickets/[id]/page.tsx`
- `app/subcontractor-portal/work-orders/[id]/page.tsx`

### Other (auth/landing/misc) (13)

- `app/page.tsx`
- `app/portal-login/page.tsx`
- `app/forgot-password/page.tsx`
- `app/reset-password/page.tsx`
- `app/set-password/page.tsx`
- `app/impersonate-login/page.tsx`
- `app/register-client/page.tsx`
- `app/register-subcontractor/page.tsx`
- `app/offline/page.tsx`
- `app/payment-success/page.tsx`
- `app/payment-failure/page.tsx`
- `app/payment-cancelled/page.tsx`
- `app/pay-bank/[id]/page.tsx`

---

## Concrete reference: source of truth

- Primary reference implementation:
  - `app/admin-portal/companies-permissions/page.tsx`
- Existing repo-wide guideline:
  - `.cursor/rules/page-ui-design.mdc`

