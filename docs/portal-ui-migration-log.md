# Portal UI migration log

## Page shell spec (from admin work order detail)

Reference: `app/admin-portal/work-orders/[id]/page.tsx`.

1. **Backdrop**: Full-bleed slate/zinc vertical gradient; horizontal bleed past layout padding (`-mx-4 md:-mx-6`).
2. **Column**: `PortalPageSurface` applies an inner `max-w-[92rem]` column; `PageContainer` handles vertical rhythm inside pages.
3. **Hero**: Breadcrumb, back, title/metadata, actions in a glass panel (`rounded-[1.75rem]`, border, shadow, backdrop-blur).
4. **Body**: Section cards and `space-y-6` vertical rhythm.
5. **Loading / empty / error**: Context label + centered spinner or message panel + primary action.

**Phase 1–2**: `PortalPageSurface` in all three portal layouts applies the backdrop globally and constrains main content width. Work order detail no longer duplicates the outer gradient or max-width wrapper.

## Theme / tokens

| File | Status | Notes |
|------|--------|-------|
| `app/layout.tsx` | Done | `min-h-dvh bg-background`; viewport light themeColor aligned to slate wash. |
| `app/globals.css` | Done | Slate wash light background, zinc dark shell, blue `primary` / `ring`, `--radius` 0.75rem. |
| `components/theme-toggle.tsx` | Done | Header-aligned outline control (`rounded-xl`, subtle shadow). |
| `components/theme-provider.tsx` | N/C | Thin `next-themes` wrapper; unchanged. |
| `components/ui/portal-page-surface.tsx` | Done | Gradient shell + inner max-width column (`bleedContent` escape hatch). |
| `components/ui/portal-global-search-trigger.tsx` | Done | Shared search trigger + command palette panel classes. |
| `components/ui/portal-route-loading.tsx` | Done | Shared segment `loading.tsx` spinner. |

## Navigation / layout shell

| File | Status | Notes |
|------|--------|-------|
| `components/admin-layout.tsx` | Done | `PortalPageSurface` wraps page children; loading spinner unified. |
| `components/client-layout.tsx` | Done | Admin-style header, sidebar geometry, active links, `PortalPageSurface`. |
| `components/subcontractor-layout.tsx` | Done | Same as client. |
| `components/global-search-dialog.tsx` | Done | Uses `PortalGlobalSearchTrigger` + `PORTAL_GLOBAL_SEARCH_PANEL_CLASS`. |
| `components/client-global-search-dialog.tsx` | Done | Same shared trigger + panel. |
| `components/subcontractor-global-search-dialog.tsx` | Done | Same shared trigger + panel. |
| `app/admin-portal/loading.tsx` | Done | `PortalRouteLoading`. |
| `app/client-portal/loading.tsx` | Done | `PortalRouteLoading`. |
| `app/subcontractor-portal/loading.tsx` | Done | `PortalRouteLoading`. |

## Calendar

| File | Status | Notes |
|------|--------|-------|
| `components/calendar/calendar-shell.tsx` | Done | Outer chrome matches work order glass (`rounded-[1.75rem]`, shadow, ring, blur); search field uses `ring-ring`. |
| `components/calendar/admin-calendar.tsx` | Done | Inherits shell via `CalendarShell`. |
| `components/calendar/client-calendar.tsx` | Done | Inherits shell via `CalendarShell`. |
| `components/calendar/subcontractor-calendar.tsx` | Done | Inherits shell via `CalendarShell`. |

## Messaging

| File | Status | Notes |
|------|--------|-------|
| `components/messaging/message-logs-page.tsx` | Done | Column width from layout; `PageContainer` only. |

## Portal routes (94 files)

| Route | File | Status | Notes |
|-------|------|--------|-------|
| `/admin-portal/account-settings` | `app/admin-portal/account-settings/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/admin-users` | `app/admin-portal/admin-users/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/analytics` | `app/admin-portal/analytics/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/assets` | `app/admin-portal/assets/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/categories` | `app/admin-portal/categories/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/clients/:id` | `app/admin-portal/clients/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/clients` | `app/admin-portal/clients/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/companies-permissions` | `app/admin-portal/companies-permissions/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/contractor-scorecard` | `app/admin-portal/contractor-scorecard/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/cron-jobs` | `app/admin-portal/cron-jobs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/email-logs` | `app/admin-portal/email-logs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/invoices/:id` | `app/admin-portal/invoices/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/invoices/new` | `app/admin-portal/invoices/new/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/invoices` | `app/admin-portal/invoices/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/invoices/standard` | `app/admin-portal/invoices/standard/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/locations/:id` | `app/admin-portal/locations/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/locations` | `app/admin-portal/locations/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/maint-requests` | `app/admin-portal/maint-requests/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/messages` | `app/admin-portal/messages/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal` | `app/admin-portal/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/payment-logs/:id` | `app/admin-portal/payment-logs/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/payment-logs` | `app/admin-portal/payment-logs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/provider-search` | `app/admin-portal/provider-search/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/quotes/:id` | `app/admin-portal/quotes/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/quotes` | `app/admin-portal/quotes/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/recurring-work-orders/:id/edit` | `app/admin-portal/recurring-work-orders/[id]/edit/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/recurring-work-orders/:id` | `app/admin-portal/recurring-work-orders/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/recurring-work-orders/create` | `app/admin-portal/recurring-work-orders/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/recurring-work-orders/location-map` | `app/admin-portal/recurring-work-orders/location-map/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/recurring-work-orders` | `app/admin-portal/recurring-work-orders/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/rejected-work-orders` | `app/admin-portal/rejected-work-orders/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/reports` | `app/admin-portal/reports/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/resources` | `app/admin-portal/resources/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/rfps` | `app/admin-portal/rfps/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/sandbox-refresh` | `app/admin-portal/sandbox-refresh/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/scheduled-invoices/:id/edit` | `app/admin-portal/scheduled-invoices/[id]/edit/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/scheduled-invoices/:id` | `app/admin-portal/scheduled-invoices/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/scheduled-invoices/create` | `app/admin-portal/scheduled-invoices/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/scheduled-invoices` | `app/admin-portal/scheduled-invoices/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/sms-logs` | `app/admin-portal/sms-logs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/subcontractors-permissions` | `app/admin-portal/subcontractors-permissions/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/subcontractors/:id` | `app/admin-portal/subcontractors/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/subcontractors` | `app/admin-portal/subcontractors/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/subsidiaries/:id` | `app/admin-portal/subsidiaries/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/subsidiaries` | `app/admin-portal/subsidiaries/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/support-tickets/:id` | `app/admin-portal/support-tickets/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/support-tickets` | `app/admin-portal/support-tickets/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/user-activity` | `app/admin-portal/user-activity/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/whatsapp-logs` | `app/admin-portal/whatsapp-logs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-order-groups/:id` | `app/admin-portal/work-order-groups/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-order-groups` | `app/admin-portal/work-order-groups/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-orders/:id` | `app/admin-portal/work-orders/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-orders/create/guided` | `app/admin-portal/work-orders/create/guided/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-orders/maintenance-requests` | `app/admin-portal/work-orders/maintenance-requests/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-orders` | `app/admin-portal/work-orders/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/admin-portal/work-orders/standard` | `app/admin-portal/work-orders/standard/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/account-settings` | `app/client-portal/account-settings/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/diagnostic-requests/:id` | `app/client-portal/diagnostic-requests/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/diagnostic-requests` | `app/client-portal/diagnostic-requests/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/invoices/:id` | `app/client-portal/invoices/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/invoices` | `app/client-portal/invoices/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/locations/create` | `app/client-portal/locations/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/locations` | `app/client-portal/locations/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/maintenance-requests` | `app/client-portal/maintenance-requests/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/messages` | `app/client-portal/messages/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal` | `app/client-portal/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/payment-methods` | `app/client-portal/payment-methods/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/quotes/:id` | `app/client-portal/quotes/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/quotes` | `app/client-portal/quotes/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/recurring-work-orders/:id/edit` | `app/client-portal/recurring-work-orders/[id]/edit/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/recurring-work-orders/:id` | `app/client-portal/recurring-work-orders/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/recurring-work-orders/create` | `app/client-portal/recurring-work-orders/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/recurring-work-orders` | `app/client-portal/recurring-work-orders/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/subcontractors` | `app/client-portal/subcontractors/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/subsidiaries/create` | `app/client-portal/subsidiaries/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/subsidiaries` | `app/client-portal/subsidiaries/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/support-tickets/:id` | `app/client-portal/support-tickets/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/support-tickets` | `app/client-portal/support-tickets/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-order-groups/:id` | `app/client-portal/work-order-groups/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-order-groups` | `app/client-portal/work-order-groups/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-orders/:id` | `app/client-portal/work-orders/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-orders/create` | `app/client-portal/work-orders/create/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-orders/maintenance-requests` | `app/client-portal/work-orders/maintenance-requests/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/client-portal/work-orders` | `app/client-portal/work-orders/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/account-settings` | `app/subcontractor-portal/account-settings/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/assigned` | `app/subcontractor-portal/assigned/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/bidding` | `app/subcontractor-portal/bidding/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/completed-jobs` | `app/subcontractor-portal/completed-jobs/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/messages` | `app/subcontractor-portal/messages/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal` | `app/subcontractor-portal/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/quotes` | `app/subcontractor-portal/quotes/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/support-tickets/:id` | `app/subcontractor-portal/support-tickets/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/support-tickets` | `app/subcontractor-portal/support-tickets/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |
| `/subcontractor-portal/work-orders/:id` | `app/subcontractor-portal/work-orders/[id]/page.tsx` | Done | Phase 1: content inside layout `PortalPageSurface`. |

## Redirect-only routes

| Route | File |
|-------|------|
| `/admin-portal/rfps` | `app/admin-portal/rfps/page.tsx` |
| `/client-portal/locations/create` | `app/client-portal/locations/create/page.tsx` |
| `/client-portal/work-orders/create` | `app/client-portal/work-orders/create/page.tsx` |

## Follow-up

Optional: extract a shared **detail hero** from the work order glass header for long-tail detail pages; strip redundant `mx-auto max-w-[92rem]` from individual `PageContainer`s now that the layout constrains width; extend `components/ui/*` (tables, dialogs) for any remaining one-off grays outside the token set.
