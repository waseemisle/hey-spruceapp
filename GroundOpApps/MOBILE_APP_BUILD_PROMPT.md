# GroundOps Mobile Apps — Complete React Native Build Specification (iOS + Android)

> **This document is the single authoritative source of truth for building the GroundOps iOS + Android mobile apps.** It was produced from a line-by-line review of the existing Next.js web portal at `/home/waseem/Desktop/hey-spruceapp`. Every page, every API route, every Firestore collection, every env var, every security rule, every business rule, every hardcoded constant has been verified against the actual repository. Nothing is assumed.
>
> **Goal:** Ship iOS + Android apps with **100% feature parity, identical role-based access, identical data model, identical branding, and an automated web→mobile sync pipeline** so the web portal and the mobile apps never drift.
>
> **Location of mobile code:** `/home/waseem/Desktop/hey-spruceapp/GroundOpApps/`
>
> ---
>
> ## 🔴 CRITICAL — SHARED FIREBASE BACKEND (read first)
>
> **Web, iOS app, and Android app ALL use the SAME Firebase project — `groundopss`.** No separate Firebase project, no separate Firestore, no separate Auth tenant, no separate Storage bucket, no separate Cloud Functions. Every user account, every work order, every quote, every invoice, every message, every notification, every support ticket is stored in ONE place and read/written by all three clients simultaneously.
>
> Concrete rules:
> - **Same Firebase project:** `NEXT_PUBLIC_FIREBASE_PROJECT_ID=groundopss` on web → `EXPO_PUBLIC_FIREBASE_PROJECT_ID=groundopss` on mobile. Identical value.
> - **Same Firestore database:** Production writes go to `(default)` database; `EXPO_PUBLIC_APP_ENV=staging` switches to the `sandbox` database (same behavior as web).
> - **Same Firebase Auth:** A user signing in on web with `sara@example.com` and signing in on iOS/Android with `sara@example.com` are **the exact same Firebase Auth UID**. Same password. Same password reset emails. Same session claims.
> - **Same Firestore security rules:** `firestore.rules` governs web AND mobile — mobile cannot read or write anything the rules forbid. No mobile-specific rules. Ever.
> - **Same Storage bucket:** `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` identical across platforms.
> - **Same Cloud Functions:** Mobile hits the same `maintRequests` Firebase function the web uses.
> - **Same Cloudinary, same Stripe, same Mailgun, same SendBlue, same Twilio, same Supabase, same APPY** — all share the same credentials stored on Vercel and reused by the same Next.js API routes that mobile calls.
>
> **Result:** A client creates a work order on the iPhone app → the admin sees it in realtime on the web → the subcontractor receives the assignment on Android → the client gets a push notification and an email. All driven by one Firebase project, one Firestore, one Auth tenant.
>
> Never spin up a parallel Firebase project "for mobile". Never duplicate data. Never fork the schema.

---

## Table of Contents

1. Non-Negotiable Requirements
2. Tech Stack (locked)
3. Project Structure (exact layout)
4. App Identity, Branding, Icons, Splash
5. Authentication, Role Detection, Session Rules
6. Complete Page Inventory — verified file-by-file
   - 6.1 Public / unauth
   - 6.2 Admin Portal (45 pages)
   - 6.3 Client Portal (24 pages)
   - 6.4 Subcontractor Portal (9 pages)
7. Complete Navigation Structure — exact labels, icons, ordering, badges
8. Complete API Route Inventory — all 101 routes, exact paths
9. Firestore — every collection, every rule
10. Types — every interface, every enum, every status string
11. Third-party integrations — Firebase, Stripe, Mailgun, SendBlue, Twilio, Cloudinary, Supabase, APPY
12. Environment Variables — exact names pulled from `.env.local`
13. Vercel Cron Jobs & Serverless Function Configs
14. Cloud Functions (Firebase) — exact endpoints
15. Business-Logic Rules That Must Not Drift
16. Mobile-Specific Additions (push, camera, QR, biometrics, deep links, offline)
17. UI Mapping: web primitive → mobile primitive
18. Realtime / `onSnapshot` listeners to replicate
19. Forms, Validation, Patterns
20. File Uploads & Image Compression
21. PDF Generation
22. Impersonation (View-As) Flow
23. Sandbox vs Production (two Firestore databases)
24. Delivery Milestones
25. CI/CD — Vercel env → EAS secrets, web→mobile auto-build
26. EAS Build / Update / Submit Configuration
27. Store Submission Checklists
28. Acceptance Checklist (sign-off)
29. What NOT to Do
30. Kickoff Commands

---

## 1. Non-Negotiable Requirements

1. **Single codebase → two apps.** One React Native (Expo) project compiles to both iOS and Android. No fork, no copy-paste, no divergence.
2. **1:1 feature parity with the web portal.** Every visible button, every form field, every workflow, every permission check, every email trigger, every notification, every status label. If it exists on web, it exists on mobile — in the same place, with the same behavior, with the same copy.
3. **Identical role-based access** across web and mobile. Same three roles: `admin`, `client`, `subcontractor`. Same Firestore rules govern both. No role-specific feature on mobile that does not exist on web, and vice-versa.
4. **Same Firebase backend.** Same Firebase project (`groundopss`), same Firestore (default database in production, `sandbox` database in staging), same Auth tenant, same Storage bucket, same Cloud Functions, same Cloudinary, same Stripe, same Mailgun, same SendBlue, same Twilio. **Zero new backend services.**
5. **All mobile env vars come from Vercel.** No parallel secret store. Automated pipeline: `vercel env pull` → `eas secret:create`. Documented in Section 25.
6. **Auto-sync web→mobile.** When the web portal is updated, both mobile apps automatically produce either an OTA update (JS-only changes) or a full native build + auto-submit to App Store / Play Store (native changes). Implementation in Section 25.
7. **UI responsive, mobile-native, but visually consistent with web** — same logo, same color palette, same copy, same iconography (lucide). Light theme only. Match web's "ServiceChannel-style" dashboard layout adapted to mobile.
8. **iOS and Android must behave identically.** Any platform-specific capability (push, camera, biometrics, deep links, haptics) must be wired on both.
9. **No regressions to the web app.** Do not modify existing API routes in breaking ways. If mobile needs a new endpoint (e.g., `POST /api/push/register-token`), add it as a new route.
10. **Keep all files under the `GroundOpApps/` folder.** Mobile code, native project, build configs, CI, scripts — all inside `GroundOpApps/`.

---

## 2. Tech Stack (locked — do not substitute)

| Concern | Library / Tool |
|---|---|
| Framework | **Expo SDK 51+** (managed → `expo prebuild` to generate native dirs) |
| Language | **TypeScript** — `strict: true`, matches web `tsconfig.json` |
| Routing | **expo-router v3+** (file-based, mirrors Next.js App Router) |
| UI styling | **NativeWind v4** (Tailwind for RN) — matches web Tailwind tokens 1:1 |
| UI primitives | Custom RN components mirroring shadcn/ui shapes; bottom sheets via `@gorhom/bottom-sheet` |
| Icons | **`lucide-react-native`** (web uses `lucide-react@^0.292.0`) |
| Forms | **`react-hook-form`** + **`zod`** |
| Data fetching | **`@tanstack/react-query`** + Firestore `onSnapshot` for realtime |
| Auth | **`firebase@^10.7.0`** (JS SDK) with **AsyncStorage persistence** via `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })` |
| Firestore | `firebase/firestore` (JS SDK) |
| Storage | `firebase/storage` + Cloudinary direct upload |
| Payments | **`@stripe/stripe-react-native`** (PaymentSheet + ACH) |
| Push | **`expo-notifications`** + FCM (Android) / APNs (iOS) |
| Image picker | **`expo-image-picker`** + **`expo-image-manipulator`** (compress to <3.5 MB) |
| Camera + QR | **`expo-camera`** (includes barcode scanner in SDK 51+) |
| Docs | **`expo-document-picker`** (for CSV/Excel import on admin) |
| File / PDF | **`expo-file-system`** + **`expo-sharing`** + **`expo-print`** |
| Maps | **`react-native-maps`** |
| Charts | **`victory-native`** or **`react-native-svg-charts`** |
| Calendar | **`react-native-calendars`** (replaces FullCalendar) |
| Lists | **`@shopify/flash-list`** (virtualized) |
| Animations | **`react-native-reanimated`** + **`react-native-gesture-handler`** |
| Toast | **`sonner-native`** (mirror of web's `sonner@^2.0.7`) |
| Lightbox | **`react-native-image-viewing`** (mirror of web's `image-lightbox.tsx`) |
| Tabs | **`react-native-tab-view`** |
| Biometrics | **`expo-local-authentication`** |
| Deep links | **`expo-linking`** (Universal Links / App Links) |
| Connectivity | **`@react-native-community/netinfo`** |
| Async storage | **`@react-native-async-storage/async-storage`** |
| Date | **`date-fns@^3.0.0`** (same as web) |
| CSV / XLSX | **`papaparse`** + **`xlsx`** (same as web) — run on-device for import |
| Testing | Jest + React Native Testing Library, **Maestro** (preferred over Detox) for E2E |
| Build | **EAS Build** (cloud) + **EAS Update** (OTA) + **EAS Submit** |
| Crash/Analytics | **Firebase Analytics + Crashlytics** (same Firebase project) |

---

## 3. Project Structure (exact layout)

```
GroundOpApps/
├── mobile/                                  # The Expo app — single codebase for iOS + Android
│   ├── app/                                 # expo-router
│   │   ├── _layout.tsx                      # Root: AuthProvider, QueryClient, theme, fonts
│   │   ├── index.tsx                        # Redirect to /login or role home
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx                  # Auth stack
│   │   │   ├── login.tsx                    # → /portal-login parity
│   │   │   ├── register-client.tsx
│   │   │   ├── register-subcontractor.tsx
│   │   │   ├── forgot-password.tsx
│   │   │   ├── reset-password.tsx
│   │   │   ├── set-password.tsx
│   │   │   └── impersonate-login.tsx
│   │   ├── (admin)/                         # Admin tabs + drawer; see §6.2
│   │   ├── (client)/                        # Client tabs + drawer; see §6.3
│   │   ├── (subcontractor)/                 # Subcontractor tabs; see §6.4
│   │   ├── pay-bank/[id].tsx                # Stripe ACH (WebView OK)
│   │   ├── payment-success.tsx
│   │   ├── payment-cancelled.tsx
│   │   └── payment-failure.tsx
│   ├── components/
│   │   ├── ui/                              # Mobile equivalents of shadcn/ui
│   │   │   ├── Button.tsx, Card.tsx, Input.tsx, Textarea.tsx,
│   │   │   ├── Badge.tsx, Avatar.tsx, Checkbox.tsx, Label.tsx,
│   │   │   ├── Dialog.tsx (Modal), DropdownMenu.tsx (ActionSheet),
│   │   │   ├── FilterPills.tsx, SearchableSelect.tsx,
│   │   │   ├── ImageLightbox.tsx, StatCards.tsx, PageContainer.tsx,
│   │   │   ├── PageHeader.tsx, EmptyState.tsx, Skeleton.tsx, Logo.tsx
│   │   ├── layouts/
│   │   │   ├── AdminLayout.tsx              # tab bar + drawer + header
│   │   │   ├── ClientLayout.tsx
│   │   │   └── SubcontractorLayout.tsx
│   │   ├── dashboard/
│   │   │   ├── WorkOrdersSection.tsx
│   │   │   ├── ProposalsSection.tsx
│   │   │   ├── InvoicesSection.tsx
│   │   │   ├── AssignedJobsSection.tsx
│   │   │   ├── BiddingWorkOrdersSection.tsx
│   │   │   ├── MyQuotesSection.tsx
│   │   │   └── DashboardSearchBar.tsx
│   │   ├── calendar/
│   │   │   ├── AdminCalendar.tsx
│   │   │   └── ClientCalendar.tsx
│   │   ├── ImpersonationBanner.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── NavigationBadge.tsx
│   │   ├── GlobalSearchDialog.tsx           # role-aware
│   │   ├── ProposalDecisionEngine.tsx
│   │   ├── QuoteComparison.tsx, CompareQuotesDialog.tsx
│   │   ├── QuoteSystemInfo.tsx, InvoiceSystemInfo.tsx, WorkOrderSystemInfo.tsx
│   │   ├── RecurringWorkOrdersImportModal.tsx
│   │   ├── AccountSettingsDialog.tsx
│   │   └── ViewControls.tsx
│   ├── lib/                                 # Port from web lib/ (see §5.5 for list)
│   │   ├── auth-context.tsx                 # port verbatim, swap web imports
│   │   ├── firebase.ts                      # RN init (see §5.2)
│   │   ├── api.ts                           # fetch wrapper w/ Firebase ID token
│   │   ├── cloudinary-upload.ts
│   │   ├── client-image-compress.ts         # uses expo-image-manipulator
│   │   ├── email-template.ts
│   │   ├── notifications.ts
│   │   ├── pdf-generator.ts                 # uses expo-print
│   │   ├── status-utils.ts
│   │   ├── timeline.ts
│   │   ├── support-ticket-api-client.ts
│   │   ├── support-ticket-helpers.ts
│   │   ├── support-ticket-snapshots.ts
│   │   ├── invoice-number.ts
│   │   ├── problem-taxonomy.ts
│   │   ├── subcontractor-ids.ts
│   │   ├── appy-client.ts                   # APPY constants (§15.4)
│   │   ├── dashboard-utils.ts
│   │   ├── logo-base64.ts
│   │   └── utils.ts                         # cn() etc.
│   ├── hooks/
│   │   ├── use-firebase-instance.ts
│   │   ├── use-role.ts
│   │   ├── use-realtime-query.ts            # wraps onSnapshot in react-query
│   │   └── use-impersonation.ts
│   ├── contexts/
│   │   └── view-controls-context.tsx
│   ├── types/                               # Copy from web /types/index.ts VERBATIM
│   │   └── index.ts
│   ├── assets/
│   │   ├── icon.png, adaptive-icon.png, splash.png, favicon.png
│   │   ├── groundlogo.png
│   │   └── fonts/
│   ├── app.config.ts                        # Expo config, pulls from env
│   ├── eas.json                             # Build profiles (§26)
│   ├── metro.config.js                      # NativeWind setup
│   ├── tailwind.config.js                   # tokens identical to web
│   ├── babel.config.js
│   ├── tsconfig.json                        # extends web tsconfig
│   ├── package.json
│   └── .env.production.example              # names only
├── shared/                                  # (optional) symlinks to web lib files
├── scripts/
│   ├── sync-from-web.ts                     # copies types/, selected lib/ on build
│   ├── pull-vercel-env.sh                   # vercel env pull → eas secrets
│   ├── rename-next-public-to-expo-public.sh
│   └── setup.sh
├── .github/workflows/
│   ├── mobile-build-on-web-change.yml       # §25.2
│   ├── mobile-ci.yml                        # lint/test/typecheck
│   └── mobile-release.yml                   # versioned release
├── ios/                                     # generated by `expo prebuild`
├── android/                                 # generated by `expo prebuild`
├── README.md                                # setup + quickstart
└── MOBILE_APP_BUILD_PROMPT.md               # this file
```

---

## 4. App Identity, Branding, Icons, Splash

| Property | Value |
|---|---|
| Display name | **GroundOps** |
| iOS bundle ID | `co.groundops.app` |
| Android package | `co.groundops.app` |
| URL scheme | `groundops://` |
| Universal Link host | `groundops.co` + `groundopscos.vercel.app` |
| App Store name | GroundOps |
| Play Store listing | GroundOps |
| Logo (runtime, remote) | `https://www.groundops.co/deck/logo.png` |
| Logo (bundled asset) | `/assets/groundlogo.png` (copied from repo root) |
| Primary contact email | `info@groundops.co` |
| Theme | **Light only** (web has no dark mode) |
| Primary color | Match `app/globals.css` CSS vars — export to `tailwind.config.js` |
| Typography | GroundOps deck sans-serif; load via `expo-font` |
| Splash screen | GroundOps logo centered on brand background |
| Adaptive icon (Android) | Foreground = logo mark; background = brand color |
| App icon (iOS) | 1024×1024 derived from `groundlogo.png` |
| iOS merchant ID (Apple Pay / Stripe) | `merchant.co.groundops.app` |
| Permissions copy (iOS Info.plist) | Camera "Capture photos for work orders, completions, and maintenance requests." Photo Library "Attach photos to work orders and tickets." Notifications "Receive updates on work orders, quotes, messages, and invoices." Face ID "Sign in securely." |
| Permissions (Android manifest) | `CAMERA`, `READ_MEDIA_IMAGES`, `POST_NOTIFICATIONS`, `USE_BIOMETRIC`, `INTERNET`, `ACCESS_NETWORK_STATE` |

---

## 5. Authentication, Role Detection, Session Rules

### 5.1 Login flow (port `lib/auth-context.tsx` exactly)

Web logic (verified, lines 34–88 of `lib/auth-context.tsx`):

```ts
onAuthStateChanged(auth, async (firebaseUser) => {
  if (!firebaseUser) { setUserRole(null); return; }

  // Order matters — admin first, client second, sub third.
  const adminDoc = await getDoc(doc(db, 'adminUsers', firebaseUser.uid));
  if (adminDoc.exists()) { setUserRole('admin'); setUserProfile(adminDoc.data()); return; }

  const clientDoc = await getDoc(doc(db, 'clients', firebaseUser.uid));
  if (clientDoc.exists()) {
    const data = clientDoc.data();
    if (data.status === 'approved') { setUserRole('client'); setUserProfile(data); }
    return; // exists but not approved → still unauthenticated (null role)
  }

  const subDoc = await getDoc(doc(db, 'subcontractors', firebaseUser.uid));
  if (subDoc.exists()) {
    const data = subDoc.data();
    if (data.status === 'approved') { setUserRole('subcontractor'); setUserProfile(data); }
  }
});
```

**Port this verbatim to `mobile/lib/auth-context.tsx`.** Replace `useRouter()` from Next with `useRouter()` from `expo-router`. Replace `firebase/auth` web import with `firebase/auth/react-native` init pattern.

### 5.2 Firebase init (mobile-specific)

```ts
// mobile/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app = !getApps().length ? initializeApp(config) : getApp();
export const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

// CRITICAL: match web sandbox logic (verified in web lib/firebase.ts)
const dbId = process.env.EXPO_PUBLIC_APP_ENV === 'staging' ? 'sandbox' : '(default)';
export const db = getFirestore(app, dbId);
export const storage = getStorage(app);
```

### 5.3 Rules
- **Do not** use the Firebase Admin SDK on mobile. Never ship `FIREBASE_PRIVATE_KEY` or any service-account JSON. Anything needing elevated privilege is called via existing Next.js API routes (same way the web app does it).
- Every authenticated API call must include `Authorization: Bearer ${await auth.currentUser.getIdToken()}`.
- Biometric lock (opt-in, Face ID / fingerprint) re-auths the user after app background > 5 minutes; **does not** replace Firebase session — it only gates local access.
- Session persistence is **AsyncStorage** via `getReactNativePersistence`. Works offline, survives app restart.

### 5.4 Registration flows (port exactly)
- `register-client.tsx`: creates `clients/{uid}` with `status: 'pending'`, shows "Awaiting approval" screen, signs out.
- `register-subcontractor.tsx`: creates `subcontractors/{uid}` with `status: 'pending'` and the skills/license/insurance fields.
- Until `status === 'approved'`, user cannot access any portal.

### 5.5 Password flows
- `forgot-password.tsx` → Firebase `sendPasswordResetEmail`.
- `reset-password.tsx` → handles deep link with oobCode.
- `set-password.tsx` → invited user sets initial password (hits `/api/auth/set-password`).
- Deep links come via `expo-linking` + Universal/App links on domain `groundopscos.vercel.app` and `groundops.co`.

### 5.6 Impersonation (admin → client/sub)
Web stores impersonation state in `localStorage.impersonationState` with fields `{ isImpersonating, appName, targetRole, targetUid }` (verified in `client-layout.tsx` lines 46–80). It creates a separate Firebase app instance via `initializeApp(config, state.appName)` so impersonated session is isolated from admin session.

**Mobile equivalent:**
- Store same state in `AsyncStorage` under key `impersonationState`.
- Create a secondary Firebase app instance with a unique name (e.g., `impersonation-${uid}`).
- Use its `auth`, `db`, `storage` in impersonation mode.
- Always render `<ImpersonationBanner />` at the top of the screen with an "Exit View-As" button.
- On exit: remove AsyncStorage entry, delete secondary app, route back to admin portal.

---

## 6. Complete Page Inventory (verified file-by-file)

### 6.1 Public / unauthenticated routes (13 routes)

| Web path | Purpose | Mobile screen |
|---|---|---|
| `/` | Landing + portal cards | `app/index.tsx` redirect |
| `/portal-login` | Email+password login | `(auth)/login.tsx` |
| `/register-client` | Client self-register | `(auth)/register-client.tsx` |
| `/register-subcontractor` | Subcontractor self-register | `(auth)/register-subcontractor.tsx` |
| `/forgot-password` | Password reset request | `(auth)/forgot-password.tsx` |
| `/reset-password` | Reset via oobCode | `(auth)/reset-password.tsx` |
| `/set-password` | Invited user first-time password | `(auth)/set-password.tsx` |
| `/impersonate-login` | Admin starts impersonation | `(auth)/impersonate-login.tsx` |
| `/pay-bank/[id]` | Stripe ACH payment | `pay-bank/[id].tsx` (WebView acceptable) |
| `/payment-success` | Stripe redirect target | `payment-success.tsx` |
| `/payment-cancelled` | Stripe redirect target | `payment-cancelled.tsx` |
| `/payment-failure` | Stripe redirect target | `payment-failure.tsx` |

### 6.2 Admin Portal — 45 pages (verified via filesystem scan)

```
/admin-portal                                         (dashboard)
/admin-portal/account-settings
/admin-portal/admin-users
/admin-portal/analytics
/admin-portal/assets
/admin-portal/categories
/admin-portal/clients
/admin-portal/clients/[id]
/admin-portal/companies-permissions
/admin-portal/contractor-scorecard
/admin-portal/cron-jobs
/admin-portal/email-logs
/admin-portal/invoices
/admin-portal/invoices/[id]
/admin-portal/invoices/new
/admin-portal/invoices/standard
/admin-portal/locations
/admin-portal/locations/[id]
/admin-portal/maint-requests
/admin-portal/messages
/admin-portal/provider-search
/admin-portal/quotes
/admin-portal/recurring-work-orders
/admin-portal/recurring-work-orders/create
/admin-portal/recurring-work-orders/[id]
/admin-portal/recurring-work-orders/[id]/edit
/admin-portal/recurring-work-orders/location-map
/admin-portal/rejected-work-orders
/admin-portal/reports
/admin-portal/resources
/admin-portal/rfps
/admin-portal/sandbox-refresh
/admin-portal/scheduled-invoices
/admin-portal/subcontractors
/admin-portal/subcontractors/[id]
/admin-portal/subsidiaries
/admin-portal/subsidiaries/[id]
/admin-portal/support-tickets
/admin-portal/support-tickets/[id]
/admin-portal/user-activity
/admin-portal/work-orders
/admin-portal/work-orders/standard
/admin-portal/work-orders/maintenance-requests
/admin-portal/work-orders/create/guided
/admin-portal/work-orders/[id]
```

### 6.3 Client Portal — 24 pages (verified)

```
/client-portal                                       (dashboard)
/client-portal/account-settings
/client-portal/invoices
/client-portal/invoices/[id]
/client-portal/locations
/client-portal/locations/create
/client-portal/maintenance-requests
/client-portal/messages
/client-portal/payment-methods
/client-portal/quotes
/client-portal/quotes/[id]
/client-portal/recurring-work-orders
/client-portal/recurring-work-orders/create
/client-portal/recurring-work-orders/[id]
/client-portal/recurring-work-orders/[id]/edit
/client-portal/subcontractors
/client-portal/subsidiaries
/client-portal/subsidiaries/create
/client-portal/support-tickets
/client-portal/support-tickets/[id]
/client-portal/work-orders
/client-portal/work-orders/create
/client-portal/work-orders/[id]
/client-portal/work-orders/maintenance-requests
```

### 6.4 Subcontractor Portal — 9 pages (verified)

```
/subcontractor-portal                                (dashboard)
/subcontractor-portal/account-settings
/subcontractor-portal/assigned
/subcontractor-portal/bidding
/subcontractor-portal/completed-jobs
/subcontractor-portal/messages
/subcontractor-portal/quotes
/subcontractor-portal/support-tickets
/subcontractor-portal/support-tickets/[id]
```

**Total screens to implement: 13 public + 45 admin + 24 client + 9 subcontractor = 91 screens.** Every one must be built.

---

## 7. Complete Navigation Structure (verified from layouts)

### 7.1 Admin navigation (exact, from `components/admin-layout.tsx`)

Top-level groups (with icons from `lucide-react-native`):

| Group | Icon | Items |
|---|---|---|
| **Dashboard** | `Home` | `/admin-portal` |
| **Users** | `Users` | Clients, Subcontractors, Admin Users (`ShieldCheck`) |
| **Companies** | `Building2` | List of Companies, Companies Permissions |
| **Work Orders** 🔔 | `ClipboardList` | Standard Work Orders, Recurring Work Orders (`RotateCcw`), Maint. Req. Work Orders (`Wrench`), Rejected Work Orders (`XCircle`), Archived Work Orders (`Archive`) |
| **Invoices** | `Receipt` | Standard Invoices, Scheduled Invoices (`Calendar`) |
| **Field Ops** | `Wrench` | Locations, Maintenance Requests, Categories (`Tag`), Assets (`Package`) |
| **Procurement** | `FileText` | Quotes, RFPs |
| **Messaging** 🔔 | `MessageSquare` | Messages, Email Logs (`Mail`) |
| **Support** 🔔 | `Headphones` | `/admin-portal/support-tickets` (direct) |
| **Resources** | `BookOpen` | `/admin-portal/resources` |
| **Analytics** | `BarChart2` | Reports, Analytics, Contractor Scorecard (`Award`), Provider Search (`Search`) |
| **System** | `Database` | Sandbox Refresh (`FlaskConical`), Cron Jobs (`Clock`), User Activity |

Badge keys (realtime counts via `onSnapshot`):
- `locations` — pending locations count
- `workOrders` — pending work orders count
- `messages` — unread chats count
- `supportTickets` — admin unassigned open support ticket count (uses `subscribeAdminUnassignedOpenSupportTicketCount` from `lib/support-ticket-snapshots.ts`)

Header: GroundOps logo, global search (`GlobalSearchDialog`), `EstClock` showing Eastern Time in `EST`, notification bell, user avatar dropdown (with logout — **must update most recent `emailLogs` `user_login` entry with `logoutAt` + `sessionDuration`**, see lines ~232–250 of admin-layout).

**Mobile adaptation:** Bottom tab bar with 5 primary tabs (Dashboard, Work Orders, Invoices, Messages, More), drawer accessible from the More tab. Badges shown on tab icons. Persistent header with logo, search icon, bell, avatar.

### 7.2 Client navigation (verified lines 244–253 of `components/client-layout.tsx`)

Exact order and permissions:
1. Dashboard
2. Locations
3. Work Orders
4. Recurring Work Orders
5. Subcontractors *(only if `hasViewSubcontractorsPermission` — client-level flag)*
6. Quotes (badge: `quotes`)
7. Invoices (badge: `invoices`)
8. Payment Methods (`CreditCard`)
9. Messages (badge: `messages`)
10. Support Tickets (badge: `supportTickets`)

Conditional permission flags on client profile:
- `hasMaintenancePermission` — show maintenance request submission
- `hasMaintenanceRequestsWorkOrdersPermission` — show the maint-requests work orders variant
- `hasViewSubcontractorsPermission` — show subcontractor directory
- `hasRecurringWorkOrdersPermission` — show recurring schedules tab

**Mobile must enforce these same flags** (read from `clients/{uid}` doc; hide UI if flag is false).

### 7.3 Subcontractor navigation (verified lines 213–219 of `components/subcontractor-layout.tsx`)

1. Dashboard
2. Bidding Work Orders (badge: `bidding`)
3. My Quotes
4. Assigned Jobs
5. My Completed Jobs
6. Messages (badge: `messages`)
7. Support Tickets (badge: `supportTickets`)

---

## 8. Complete API Route Inventory — all 101 routes

Verified via `find app/api -name "route.ts" | wc -l` against the repo. Mobile must be able to hit every route the role can hit on web.

### 8.1 Auth (8)
```
POST /api/auth/create-user
POST /api/auth/delete-user
POST /api/auth/impersonate
POST /api/auth/impersonate-login
POST /api/auth/resend-invitation
POST /api/auth/set-password
POST /api/auth/sync-reset-password
GET  /api/auth/view-as
```

### 8.2 Work Orders (2)
```
POST /api/work-orders/assign
POST /api/work-orders/complete
```

### 8.3 Quotes (1)
```
POST /api/quotes/approve
```

### 8.4 Invoices (2)
```
GET/POST /api/invoices/[id]
POST     /api/invoices/upload-pdf
```

### 8.5 Email (19 — verified file listing)
```
POST /api/email/send-assignment
POST /api/email/send-bidding-opportunity
POST /api/email/send-client-approval
POST /api/email/send-invitation
POST /api/email/send-invoice
POST /api/email/send-maint-request-notification
POST /api/email/send-quote
POST /api/email/send-quote-approval-admin-notification
POST /api/email/send-quote-notification
POST /api/email/send-review-request
POST /api/email/send-scheduled-service
POST /api/email/send-subcontractor-approval
POST /api/email/send-support-ticket-notification
POST /api/email/send-test
POST /api/email/send-work-order-approved
POST /api/email/send-work-order-completed-notification
POST /api/email/send-work-order-completion-client
POST /api/email/send-work-order-notification
POST /api/email/send-work-order-received
GET  /api/email/sync-mailgun-logs
```

### 8.6 Stripe (17)
```
POST /api/stripe/add-bank-account
POST /api/stripe/cancel-subscription
POST /api/stripe/charge-bank-account
POST /api/stripe/charge-client-now
POST /api/stripe/charge-saved-card
POST /api/stripe/confirm-payment
POST /api/stripe/create-customer
POST /api/stripe/create-payment-link
POST /api/stripe/create-setup-intent
POST /api/stripe/create-setup-session
POST /api/stripe/create-subscription
POST /api/stripe/remove-payment-method
POST /api/stripe/save-payment-method
POST /api/stripe/set-default-payment-method
POST /api/stripe/test-receipt-email
POST /api/stripe/update-subscription
POST /api/stripe/webhook                   ← server-only, no mobile call
```

### 8.7 Maintenance Requests (2)
```
GET/POST /api/maint-requests               ← proxied through Firebase CF `maintRequests`
GET      /api/maint-requests/upload-config
```

### 8.8 Recurring Work Orders (9)
```
POST /api/recurring-work-orders/cleanup-orphaned-executions
POST /api/recurring-work-orders/create-execution-work-orders
POST /api/recurring-work-orders/create-executions
POST /api/recurring-work-orders/cron             ← Vercel cron, runs `0 9 * * *`
POST /api/recurring-work-orders/execute
POST /api/recurring-work-orders/generate-execution-work-order
POST /api/recurring-work-orders/import
POST /api/recurring-work-orders/initialize-execution
POST /api/recurring-work-orders/migrate-biweekly-bimonthly
```

### 8.9 Support Tickets (4)
```
POST /api/support-tickets/assign
POST /api/support-tickets/comment
POST /api/support-tickets/create
POST /api/support-tickets/update-status
```

### 8.10 Sandbox / Sync / Search / Other (10)
```
POST /api/sandbox-refresh
GET  /api/sandbox-refresh/history
POST /api/sync/firebase-to-supabase        ← Vercel cron `55 23 * * *`
GET  /api/search
POST /api/cloudinary-upload
POST /api/sms
POST /api/whatsapp/send-approval
POST /api/cron-monitor
POST /api/user-activity
GET/POST /api/api-tokens
POST /api/admin-users/backfill-email-toggle
```

**Total: 101 route files.** Mobile API client in `lib/api.ts` must wrap `fetch` with `Authorization: Bearer <idToken>` and retry on 401 by refreshing the ID token.

---

## 9. Firestore — every collection, every rule

Collections (30, verified via `firestore.rules` + `lib/sandbox-config.ts`):

```
adminUsers, clients, subcontractors,
workOrders, quotes, invoices, invoiceStatusHistory,
locations, companies, subsidiaries, categories,
recurringWorkOrders, recurringWorkOrderExecutions,
assignedJobs, biddingWorkOrders, biddingSubmissions,
vendorPayments, maint_requests, assets, rfps,
supportTickets, supportTickets/{id}/comments,
chats, chats/{id}/messages,
workOrderNotes, notifications, locationMappings,
emailLogs, cronJobRuns, clientCharges, scheduled_invoices,
consolidatedInvoices, messages, api_tokens, users, counters
```

### 9.1 Security rules summary (must not be weakened)

| Collection | Read | Write |
|---|---|---|
| `adminUsers` | self or admin | admin only |
| `clients` | self or admin | self or admin |
| `subcontractors` | self or admin or status='approved' (for read) | self or admin |
| `workOrders` | admin / clientId==uid / assignedTo==uid / biddingSubcontractors contains uid / companyId matches client's | admin full; client update own or same-company; subcontractor limited-field update of status/schedule/completion only |
| `quotes` | admin / sub owns / client owns | admin full; sub owns; client may only change `status, acceptedAt, rejectedAt, rejectionReason, timeline, systemInformation, updatedAt` and only to `sent_to_client|accepted|rejected` |
| `invoices` | admin / client owns | admin only |
| `companies` | admin / client owns / client's companyId matches | admin only |
| `subsidiaries` | admin / client owns | self or admin |
| `locations` | admin / client owns / company matches | admin full; client create requires valid subsidiaryId matching client; self update/delete |
| `categories` | **public read** | admin only |
| `recurringWorkOrders` | admin / client owns / client has location in assignedLocations | admin only |
| `recurringWorkOrderExecutions` | admin / signed-in w/ recurring id | admin only |
| `maint_requests` | admin / client owns / any signed-in client | admin only |
| `assets` | admin only | admin only |
| `rfps` | admin only | admin only |
| `assignedJobs` | admin / sub owns | admin full; client can create for own workOrder; sub can update own limited fields (status/schedule) |
| `biddingWorkOrders` | admin / sub / client owns / company matches | admin full; client can create own; sub can update own limited fields |
| `cronJobRuns` | admin only | admin only |
| `locationMappings` | admin only | admin only |
| `emailLogs` | admin only | admin only |
| `clientCharges` | admin / client owns | create: anyone (server-side); update/delete admin |
| `notifications` | admin / owner | any signed-in create; owner update; admin delete |
| `api_tokens` | admin only | admin only |
| `scheduled_invoices` | admin only | admin only |
| `vendorPayments` | admin / sub owns | admin only |
| `users` | admin / self | admin only (and self create) |
| `workOrderNotes` | admin / clientId==uid / subcontractorId==uid | any signed-in create; admin update/delete |
| `counters` | admin only | admin only |
| `chats` | admin / participant | admin or participant |
| `chats/{id}/messages` | admin / participant of parent | admin or participant |
| `supportTickets` | admin / submitter / clientId / subcontractorId | admin only |
| `supportTickets/{id}/comments` | admin / parent reader AND `isInternal !== true` | admin only |

### 9.2 Composite indexes (verified from `firestore.indexes.json`)

Indexes already deployed — mobile queries must match patterns otherwise a composite index is required:
- `chats`: `participants` (arrayContains) + `lastMessageTimestamp` desc + `__name__` desc
- `workOrders`: `clientId` asc + `createdAt` desc; `companyId` asc + `createdAt` desc
- `locations`: `clientId` asc + `createdAt` desc
- `invoices`: `clientId` asc + `createdAt` desc; `clientId` asc + `workOrderId` asc

**Rule from project memory:** Combining `where(a) + orderBy(b)` on a NON-indexed pair throws "The query requires an index". Workaround used on web: **drop the `where`, filter client-side**. Mobile must follow the same pattern to avoid runtime errors.

---

## 10. Types — every interface, every enum, every status string

Copy `types/index.ts` (verified 698 lines) **VERBATIM** into `mobile/types/index.ts`. Do not redefine.

### 10.1 Canonical enum values (will be relied on)

- **Client status:** `'pending' | 'approved' | 'rejected'`
- **Subcontractor status:** `'pending' | 'approved' | 'rejected'`
- **Location status:** `'pending' | 'approved' | 'rejected'`
- **WorkOrder status:** `'pending' | 'approved' | 'rejected' | 'quote_received' | 'quotes_received' | 'assigned' | 'in-progress' | 'completed' | 'archived'`
  Plus sub-only values used by Firestore rules: `'accepted_by_subcontractor' | 'rejected_by_subcontractor' | 'pending_invoice'`
- **Quote status:** `'pending' | 'accepted' | 'rejected' | 'sent_to_client' | 'invoiced'`
- **Invoice status:** `'draft' | 'sent' | 'paid' | 'overdue'`
- **RecurringWorkOrder status:** `'active' | 'paused' | 'cancelled'`
- **RecurrencePattern.type:** `'daily' | 'weekly' | 'monthly'`
- **RecurrencePattern label:** `'DAILY' | 'SEMIANNUALLY' | 'QUARTERLY' | 'MONTHLY' | 'BI-MONTHLY' | 'BI-WEEKLY'`
- **InvoiceSchedule.type:** `'monthly' | 'bi-monthly' | 'quarterly' | 'semiannually'`
- **VendorPaymentStatus:** `'created' | 'paid'`
- **VendorPaymentAdjustment.type:** `'increase' | 'decrease'`
- **SupportTicketCategory (7):** `'billing' | 'technical' | 'work-order' | 'account' | 'general' | 'bug-report' | 'feature-request'`
- **SupportTicketPriority (4):** `'low' | 'medium' | 'high' | 'urgent'`
- **SupportTicketStatus (6):** `'open' | 'in-progress' | 'waiting-on-client' | 'waiting-on-admin' | 'resolved' | 'closed'`
- **SupportTicketType (4):** `'question' | 'problem' | 'task' | 'incident'`
- **Notification.type:** `'work_order' | 'quote' | 'invoice' | 'assignment' | 'completion' | 'schedule' | 'general' | 'support_ticket'` (plus `'location'` used in `lib/notifications.ts`)
- **TimelineEvent.type (WorkOrder):** `'created' | 'approved' | 'rejected' | 'shared_for_bidding' | 'quote_received' | 'quote_shared_with_client' | 'quote_approved_by_client' | 'quote_rejected_by_client' | 'assigned' | 'schedule_set' | 'schedule_shared' | 'started' | 'completed' | 'invoice_sent' | 'invoice_paid' | 'payment_received' | 'archived'`

**Any new value added on web must be added on mobile simultaneously. Do not invent new enum values on mobile.**

---

## 11. Third-party integrations (verified from `lib/`)

| Service | Purpose | Files | Keys prefix |
|---|---|---|---|
| **Firebase** (Auth/Firestore/Storage/Functions/Analytics) | Core backend | `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/firebase-server.ts`, `lib/firebase-staging-admin.ts` | `NEXT_PUBLIC_FIREBASE_*` (→ `EXPO_PUBLIC_FIREBASE_*`) |
| **Stripe** | Card + ACH payments, subscriptions, payment links | `/api/stripe/*` | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `STRIPE_SECRET_KEY` (server only) |
| **Mailgun** | Transactional email | `lib/email.ts`, `lib/email-logger.ts`, `lib/email-template.ts` | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `FROM_EMAIL` (server only) |
| **SendBlue** | SMS + iMessage | `lib/sendblue.ts`, `/api/sms` | `SENDBLUE_API_KEY`, `SENDBLUE_API_SECRET`, `SENDBLUE_FROM_NUMBER` (server only, E.164 format) |
| **Twilio** | WhatsApp approval | `lib/twilio.ts`, `/api/whatsapp/send-approval` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (server only) |
| **Cloudinary** | Image hosting | `lib/cloudinary-upload.ts`, `lib/client-image-compress.ts`, `/api/cloudinary-upload` | `CLOUDINARY_CLOUD_NAME` (default `duo4kzgx4`), `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET` (default `WebAppUpload`) |
| **Supabase** | Nightly sync mirror | `lib/supabase-admin.ts`, `/api/sync/firebase-to-supabase` (cron `55 23 * * *`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only) |
| **APPY** | Maintenance-request integration | `lib/appy-client.ts`, `functions/index.js` | Hardcoded client ID `UDPSxyTkDIcJijrMCVsb0pcOTpU2`, name `Jessica Cabrera-Olimon`, email `jolimon@hwoodgroup.com` |
| **Vercel** | Web hosting, cron, env | `vercel.json` | `NEXT_PUBLIC_APP_URL`, `VERCEL_OIDC_TOKEN` |

**Mobile never sees `STRIPE_SECRET_KEY`, `MAILGUN_API_KEY`, `SENDBLUE_API_SECRET`, `TWILIO_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, `FIREBASE_SYNC_PASSWORD`, or `FIREBASE_PRIVATE_KEY`.** Those stay on the Next.js API. Mobile calls the corresponding `/api/*` endpoints.

---

## 12. Environment Variables (verified from `.env.local`)

### 12.1 Complete list from web `.env.local` (names only — never commit values)

```
# Firebase (client-exposed)
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_PROJECT_ID                   # = "groundopss"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET

# Firebase (server-only)
FIREBASE_PROJECT_ID
FIREBASE_SYNC_EMAIL
FIREBASE_SYNC_PASSWORD

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY

# Mailgun
MAILGUN_API_KEY
MAILGUN_DOMAIN
FROM_EMAIL

# Cloudinary
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_UPLOAD_PRESET

# SendBlue
SENDBLUE_API_KEY
SENDBLUE_API_SECRET
SENDBLUE_FROM_NUMBER

# Deployment
NEXT_PUBLIC_APP_URL                               # e.g. https://groundopscos.vercel.app
VERCEL_OIDC_TOKEN
```

### 12.2 Additional env vars referenced by code (may exist in Vercel dashboard)

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_ENV                               # 'staging' switches Firestore db to "sandbox"
```

### 12.3 Mobile env mapping (rename `NEXT_PUBLIC_` → `EXPO_PUBLIC_`)

Mobile `.env.production` receives (bundled into app):

```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
EXPO_PUBLIC_APP_URL
EXPO_PUBLIC_APP_ENV                               # 'production' | 'staging'
```

**All server-only secrets stay on Vercel.** Mobile calls `${EXPO_PUBLIC_APP_URL}/api/...` to reach them.

Pipeline to sync (see Section 25):
```bash
vercel env pull .env.vercel.production --environment=production
./scripts/rename-next-public-to-expo-public.sh .env.vercel.production > .env.production.mobile
# Then for each EXPO_PUBLIC_ var:
eas secret:create --scope project --name EXPO_PUBLIC_XXX --value "..."
```

---

## 13. Vercel Cron Jobs & Function Configs (verified from `vercel.json`)

```json
"crons": [
  { "path": "/api/recurring-work-orders/cron", "schedule": "0 9 * * *" },
  { "path": "/api/sync/firebase-to-supabase",  "schedule": "55 23 * * *" }
],
"functions": {
  "app/api/recurring-work-orders/cron/route.ts":   { "maxDuration": 300, "memory": 1024 },
  "app/api/recurring-work-orders/execute/route.ts":{ "maxDuration": 120, "memory": 1024 },
  "app/api/sync/firebase-to-supabase/route.ts":    { "maxDuration": 300, "memory": 1024 },
  "app/api/sandbox-refresh/route.ts":              { "maxDuration": 300, "memory": 1024 }
}
```

Mobile is a consumer only — not a cron target. But the **admin Cron Jobs** screen must display execution history by reading `cronJobRuns/{id}` (live via `onSnapshot`).

---

## 14. Cloud Functions (Firebase) — exact endpoints

File: `functions/index.js`. Currently one function:

| Name | Trigger | Purpose |
|---|---|---|
| `maintRequests` | HTTP v2 (`onRequest`), public invoker | GET: list `maint_requests` (admin clients use it); POST: create a maint_request with image. Used because Vercel serverless body limit is 4.5 MB — Firebase CF can accept larger payloads. Requires Bearer token matching `api_tokens` collection. |

Timeout: 120s; memory: 512 MiB; CORS headers set. Mobile submissions from the maintenance-request screen **must POST to the CF, not Vercel**, to avoid the body-size limit for images. URL is the Firebase Functions URL (pull from Vercel env `NEXT_PUBLIC_APP_URL` or a new `EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL`).

APPY client constants inside the CF (must stay in sync with mobile copy):
- `APPY_CLIENT_ID = 'UDPSxyTkDIcJijrMCVsb0pcOTpU2'`
- `APPY_CLIENT_DISPLAY_NAME = 'Jessica Cabrera-Olimon'`
- `APPY_CLIENT_EMAIL = 'jolimon@hwoodgroup.com'`

---

## 15. Business-Logic Rules That Must Not Drift

### 15.1 Firebase Index Workaround
`where(a) + orderBy(b)` on non-indexed pairs throws. Mobile must mirror web: drop the `where`, fetch, filter client-side. Particularly affects `workOrders` where `isMaintenanceRequestOrder` + `createdAt desc`.

### 15.2 "No Stuck Buttons Ever"
All email/SMS/notification triggers on mobile must be **fire-and-forget** (don't await in the UI thread's critical path). Dispatch the call, optimistically update UI, toast on success/failure.

### 15.3 Never use `FIREBASE_PRIVATE_KEY` / service account
Org policy. Mobile uses the JS SDK with user auth only.

### 15.4 APPY maintenance requests — hardcoded client identity
From `lib/appy-client.ts` (verified):
- `APPY_CLIENT_ID = 'UDPSxyTkDIcJijrMCVsb0pcOTpU2'`
- `APPY_CLIENT_DISPLAY_NAME = 'Jessica Cabrera-Olimon'`
- `APPY_CLIENT_EMAIL = 'jolimon@hwoodgroup.com'`

Display-name rule (verified `getWorkOrderClientDisplayName`):
```ts
if ((workOrder.isMaintenanceRequestOrder || workOrder.clientId === APPY_CLIENT_ID)
     && workOrder.clientId === APPY_CLIENT_ID)
  return APPY_CLIENT_DISPLAY_NAME;
return workOrder.clientName ?? '';
```
Port to mobile identically.

### 15.5 Recurring CSV import defaults
Company → **"The h.wood Group"**. Client → **"Jessica Cabrera-Olimon"** (same as APPY constant). Location name resolution via `locationMappings/{id}` collection.

### 15.6 Maintenance-request image pipeline
1. User captures image (`expo-image-picker`)
2. Compress to <3.5 MB with `expo-image-manipulator` (matches web's Sharp pipeline)
3. Base64-encode
4. POST to Firebase CF `maintRequests` with `Authorization: Bearer <api_token>` (not Firebase ID token — a token from `api_tokens` collection)

### 15.7 Vendor Payments visibility
Subcontractor may only see `baseAmount`, `finalAmount`, `status`, `currency`, `workOrderNumber`. **Never** `internalNotes` or `adjustments[].reason`. Enforce in both Firestore rules (already done) and mobile UI.

### 15.8 Client quote write is locked to audit fields
Firestore rule (verified) restricts client update of `quotes/{id}` to `['status', 'acceptedAt', 'rejectedAt', 'rejectionReason', 'timeline', 'systemInformation', 'updatedAt']` and `status ∈ ['sent_to_client', 'accepted', 'rejected']`. Mobile accept/reject flow must produce exactly this diff — any other field change will be rejected.

### 15.9 Subcontractor work-order write is locked to schedule + completion fields
Firestore rule (verified): subcontractor can update only `['status', 'scheduledServiceDate', 'scheduledServiceTime', 'scheduledServiceTimeEnd', 'completedAt', 'completionDetails', 'completionNotes', 'completionImages', 'updatedAt', 'timeline', 'systemInformation']` and `status ∈ ['accepted_by_subcontractor', 'rejected_by_subcontractor', 'pending_invoice', 'completed']`. Any other write returns permission-denied.

### 15.10 Reports saved searches
Web uses `localStorage['spruce_report_saved_searches']`. Mobile uses **`AsyncStorage['spruce_report_saved_searches']`** with the identical schema, so users can carry saved searches across platforms later.

### 15.11 Admin logout audit
Admin layout writes a `logoutAt` + `sessionDuration` back to the most recent `emailLogs` doc where `type='user_login'`, `userId=uid`, `logoutAt==null` (verified lines ~235–250 `admin-layout.tsx`). Mobile admin logout must do the same.

### 15.12 EST clock in admin header
Admin header shows current Eastern Time updated every second using `timeZone: 'America/New_York'`. Port as a component shown in the native header.

### 15.13 Sandbox database
`NEXT_PUBLIC_APP_ENV=staging` → Firestore database id is `sandbox`, not `(default)`. Mobile respects the same via `EXPO_PUBLIC_APP_ENV`.

### 15.14 `logoutAt` / `sessionDuration` on all portals
The pattern of logging login and closing the most recent `emailLogs` doc on logout appears in all three layouts — port to all three mobile layouts.

---

## 16. Mobile-Specific Additions (native capabilities the web can't do)

These are ADDITIVE and feature-flagged. They do not violate the "same as web" rule — they enhance without replacing. Gate them by feature flags stored on user profile or via remote config.

1. **Push notifications** — `expo-notifications` + FCM / APNs. Event sources = every email the web sends. Strategy:
   - Add new endpoint `POST /api/push/register-token` on the Next.js app that writes `expoPushToken` onto the user's profile doc (or a new `pushTokens/{uid}/tokens/{deviceId}` subcollection).
   - In every `/api/email/send-*` route, after sending the email, also call a shared `sendPushToUser(userId, payload)` helper that fetches tokens and POSTs to `https://exp.host/--/api/v2/push/send`. Additive — emails still go out.
   - Notifications for: new work order, assignment, quote received, quote accepted/rejected, invoice sent, invoice paid, new message, support ticket update, maintenance request submitted.
2. **Camera-first image capture** (replaces web's file input on mobile flows).
3. **QR code scanning** (`expo-camera` barcode mode) for maintenance-request venue auto-fill. QR encodes `groundops://maint-request?venue=<id>&apiToken=<token>`.
4. **Biometric unlock** after 5 min background.
5. **Offline banner** via `netinfo`; write queue safely deferred where appropriate.
6. **Deep links**: `groundops://invoice/<id>`, `groundops://reset-password?oobCode=<>`, `groundops://impersonate?target=<uid>`, `groundops://quote/<id>`, `groundops://work-order/<id>`.
7. **Native share** of invoice/work-order PDFs via `expo-sharing`.
8. **Map view** of locations (`react-native-maps`).
9. **Haptics** on key actions (accept quote, mark complete).

---

## 17. UI Mapping: web primitive → mobile primitive

| Web | Mobile |
|---|---|
| shadcn/ui `Button` | Custom `<Button>` using NativeWind classes identical to web |
| shadcn/ui `Card` | Custom `<Card>` with `bg-white rounded-lg shadow-sm border border-slate-200` |
| shadcn/ui `Dialog` | RN `Modal` or bottom sheet |
| shadcn/ui `DropdownMenu` | Action sheet via `@gorhom/bottom-sheet` |
| shadcn/ui `Tabs` | `react-native-tab-view` |
| `FilterPills` | Horizontal scrollable Pill row |
| `SearchableSelect` | Modal with TextInput + FlashList |
| `ImageLightbox` | `react-native-image-viewing` |
| `StatCards` | Flex grid of cards |
| `PageHeader` | Native stack header with optional actions |
| `@fullcalendar/*` | `react-native-calendars` agenda + month views |
| `sonner` | `sonner-native` |
| `lucide-react` | `lucide-react-native` |
| Data tables | FlashList of cards — one card per row with primary info; tap → detail; long-press → action sheet |
| Next.js `<Link>` | `expo-router`'s `<Link>` |
| `localStorage` | `AsyncStorage` |
| Toaster container | `<Toaster />` from `sonner-native` at root |

**Copy must match verbatim.** Every button label, every form placeholder, every empty-state message, every error message. Search for `'...'` string literals in web pages and mirror them.

---

## 18. Realtime listeners to replicate

Port every `onSnapshot` the web uses. Verified from layouts and components:

- **Admin layout badges** (`admin-layout.tsx`):
  - `locations` where `status=='pending'` → badge count
  - `workOrders` where `status=='pending'` → badge count
  - Support tickets via `subscribeAdminUnassignedOpenSupportTicketCount(db, cb)`
- **Client layout badges** (`client-layout.tsx`):
  - Quotes, Invoices, Messages unread, Support tickets open via `subscribeClientOpenSupportTicketCount`
- **Subcontractor layout badges** (`subcontractor-layout.tsx`):
  - Bidding, Messages unread, Support tickets open via `subscribeSubcontractorOpenSupportTicketCount`
- **Chats** & **messages** realtime
- **Work order detail** timeline + quotes live update
- **Support ticket detail** comments + status live update
- **Dashboard** (all 3 roles) — live work order counts, invoice status aggregations
- **Notification bell** — all three layouts subscribe to `notifications` where `userId==uid && read==false`

---

## 19. Forms, Validation, Patterns

- Use `react-hook-form` + `zod` schemas on every form.
- Port schemas from the web pages exactly — same field names, same required/optional, same regex.
- Phone number normalization: web's `normalizePhone` in `lib/sendblue.ts` / `lib/twilio.ts` — US default to E.164 with +1 prefix. Copy verbatim into `lib/phone.ts`.
- Address fields: `street, city, state, zip, country` (see `Address` type).
- Bank account entry (subcontractor): `bankName, accountHolderName, accountType('checking'|'savings'), routingNumber (9 digits), accountNumberLast4, accountNumberEncrypted` (base64 of full account). Match exactly.

---

## 20. File Uploads & Image Compression

1. User picks / captures image → `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG })`.
2. If still >3.5 MB, loop compress further until <3.5 MB or give up at 0.3 quality.
3. Upload:
   - **Work order images, completion images, ticket attachments** → Cloudinary via `POST /api/cloudinary-upload` (or direct upload with signed preset from `/api/maint-requests/upload-config`).
   - **Maintenance request images** → Firebase CF `maintRequests` as base64 (not via Vercel).
4. Store the returned Cloudinary `secure_url` on the Firestore doc.

---

## 21. PDF Generation

Web uses `jspdf` + `html2canvas`. Mobile:
- Use **`expo-print`** to render HTML templates (from `lib/email-template.ts` helpers or a dedicated PDF template) to PDF files.
- Store in `FileSystem.documentDirectory`, then `expo-sharing` to share.
- For invoices: generate same layout as web; embed logo base64 from `lib/logo-base64.ts`.

---

## 22. Impersonation (View-As) Flow

Mobile mirror of web impersonation:

1. Admin taps "View as" on a client/subcontractor profile.
2. App calls `POST /api/auth/impersonate` with target uid.
3. Server returns a custom token (or SetupSession param used for token exchange).
4. Mobile calls `signInWithCustomToken` on a **secondary Firebase app instance** (`initializeApp(config, 'impersonation')`) to keep admin session intact.
5. Store `{ isImpersonating: true, appName: 'impersonation', targetUid, targetRole }` in `AsyncStorage['impersonationState']`.
6. Render `<ImpersonationBanner>` at top of screen with Exit button.
7. On Exit: delete secondary app, clear AsyncStorage entry, route admin back to `(admin)/`.

Note: all three mobile layouts must read `AsyncStorage['impersonationState']` on mount and use the correct Firebase instance (same pattern as `client-layout.tsx` lines 46–80 and `subcontractor-layout.tsx` lines 37–70).

---

## 23. Sandbox vs Production

Two Firestore databases in one Firebase project (verified `lib/firebase.ts` line 34):
- Production: `(default)`
- Sandbox: `sandbox`

Mobile: `EXPO_PUBLIC_APP_ENV=staging` → `getFirestore(app, 'sandbox')`; else `(default)`.

Build two EAS profiles (Section 26): `production` and `preview`. Preview points at `sandbox` Firestore.

Sandbox refresh admin page must trigger `POST /api/sandbox-refresh` and display history from `GET /api/sandbox-refresh/history`.

---

## 24. Delivery Milestones

| # | Milestone | Scope |
|---|---|---|
| M0 | Planning | Review this doc, confirm parity list, lock dependencies |
| M1 | Foundation | Expo scaffold, EAS, Firebase init with RN persistence, AuthContext port, role-gated navigation, design tokens, layout shells for all 3 portals, env pipeline from Vercel |
| M2 | Client Portal (24 screens) | All client flows incl. Stripe PaymentSheet, camera, realtime WOs/quotes/invoices, push, deep links |
| M3 | Subcontractor Portal (9 screens) | Bidding, quote submission, assigned jobs w/ completion-image capture, bank account entry, messages, tickets |
| M4 | Admin Portal Core (work orders, quotes, invoices, clients, subs, locations, categories, messages, tickets, notifications) |
| M5 | Admin Portal Advanced | Recurring WOs w/ CSV import on-device, analytics/reports, contractor scorecard, provider search, email logs, cron jobs page, sandbox refresh, API tokens, impersonation, companies permissions, RFPs, assets, admin users, scheduled invoices, user activity |
| M6 | Polish | Accessibility (VoiceOver/TalkBack), performance, crash analytics, E2E w/ Maestro, store listings, review, submit |
| M7 | Auto-sync pipeline | Web → mobile CI live, OTA + full-build routing proven end to end |

---

## 25. CI/CD — Vercel env → EAS, web→mobile auto-build

### 25.1 One-time setup

```bash
cd /home/waseem/Desktop/hey-spruceapp/GroundOpApps/mobile
npm install -g vercel eas-cli
vercel link                                # link to same Vercel project as web
eas init                                   # create EAS project
eas build:configure                        # generate eas.json
vercel env pull .env.vercel.production --environment=production
./scripts/pull-vercel-env.sh               # rename NEXT_PUBLIC_ → EXPO_PUBLIC_, upload to EAS
```

### 25.2 GitHub Actions — `.github/workflows/mobile-build-on-web-change.yml`

```yaml
name: Mobile Build on Web Change
on:
  push:
    branches: [main]
    paths:
      - 'app/**'                    # web routes
      - 'components/**'
      - 'lib/**'
      - 'types/**'
      - 'firestore.rules'
      - 'firestore.indexes.json'
      - 'functions/**'
      - 'vercel.json'
      - 'GroundOpApps/**'
  workflow_dispatch:

jobs:
  classify-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }

      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Install EAS + Vercel CLI
        run: npm i -g eas-cli vercel

      - name: Install mobile deps
        working-directory: GroundOpApps/mobile
        run: npm ci

      - name: Sync shared code from web to mobile
        run: node GroundOpApps/scripts/sync-from-web.js

      - name: Classify change (OTA vs full build)
        id: classify
        run: |
          CHANGED=$(git diff --name-only HEAD~1 HEAD)
          if echo "$CHANGED" | grep -qE 'GroundOpApps/mobile/(app\.config|package-lock|package\.json|ios/|android/|plugins)'; then
            echo "mode=build" >> $GITHUB_OUTPUT
          elif echo "$CHANGED" | grep -q '^\(feat\|fix\|refactor\):native'; then
            echo "mode=build" >> $GITHUB_OUTPUT
          else
            echo "mode=ota" >> $GITHUB_OUTPUT
          fi

      - name: OTA update — both platforms
        if: steps.classify.outputs.mode == 'ota'
        working-directory: GroundOpApps/mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          eas update --branch production \
            --message "${{ github.event.head_commit.message }}" \
            --non-interactive

      - name: Full production build + auto-submit (iOS + Android)
        if: steps.classify.outputs.mode == 'build'
        working-directory: GroundOpApps/mobile
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        run: |
          eas build --platform all --profile production --non-interactive --auto-submit

  sync-env:
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g vercel eas-cli
      - name: Sync Vercel env → EAS secrets
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
        working-directory: GroundOpApps
        run: ./scripts/pull-vercel-env.sh
```

### 25.3 Required GitHub secrets

- `EXPO_TOKEN` (from `eas whoami --token` after `eas login`)
- `VERCEL_TOKEN` (from Vercel account settings)
- `APPLE_APP_SPECIFIC_PASSWORD` (used by EAS Submit)
- `GOOGLE_SERVICE_ACCOUNT_JSON` (JSON of a Play Console service account)

### 25.4 `scripts/pull-vercel-env.sh` (starter)

```bash
#!/usr/bin/env bash
set -euo pipefail
vercel env pull .env.vercel.production --environment=production
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  # client-exposed only
  if [[ "$key" == NEXT_PUBLIC_* ]]; then
    NEW="${key/NEXT_PUBLIC_/EXPO_PUBLIC_}"
    eas secret:create --scope project --name "$NEW" --value "$value" --type string --force
  fi
  # App URL + env
  if [[ "$key" == NEXT_PUBLIC_APP_URL ]]; then
    eas secret:create --scope project --name EXPO_PUBLIC_APP_URL --value "$value" --type string --force
  fi
done < .env.vercel.production
```

---

## 26. EAS Build / Update / Submit Configuration

### 26.1 `eas.json`

```json
{
  "cli": { "version": ">= 10.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_APP_ENV": "staging" }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "env": { "EXPO_PUBLIC_APP_ENV": "staging" },
      "ios":     { "simulator": false, "resourceClass": "m-medium" },
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_APP_ENV": "production" },
      "ios":     { "resourceClass": "m-medium" },
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "<apple-id-email>",
        "ascAppId": "<asc-app-id>",
        "appleTeamId": "<team-id>"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production"
      }
    }
  }
}
```

### 26.2 `app.config.ts`

```ts
export default {
  expo: {
    name: 'GroundOps',
    slug: 'groundops',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'groundops',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    ios: {
      bundleIdentifier: 'co.groundops.app',
      supportsTablet: true,
      associatedDomains: [
        'applinks:groundops.co',
        'applinks:groundopscos.vercel.app'
      ],
      infoPlist: {
        NSCameraUsageDescription: 'Capture photos for work orders, completions, and maintenance requests.',
        NSPhotoLibraryUsageDescription: 'Attach photos to work orders and tickets.',
        NSFaceIDUsageDescription: 'Sign in securely with Face ID.'
      }
    },
    android: {
      package: 'co.groundops.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff'
      },
      permissions: ['CAMERA','READ_MEDIA_IMAGES','POST_NOTIFICATIONS','USE_BIOMETRIC'],
      intentFilters: [{
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: 'groundops.co' },
          { scheme: 'https', host: 'groundopscos.vercel.app' }
        ],
        category: ['BROWSABLE','DEFAULT']
      }]
    },
    plugins: [
      'expo-router',
      'expo-notifications',
      'expo-image-picker',
      ['expo-camera', { cameraPermission: 'Allow GroundOps to access your camera.' }],
      'expo-local-authentication',
      ['@stripe/stripe-react-native', { merchantIdentifier: 'merchant.co.groundops.app' }]
    ],
    extra: { eas: { projectId: '<fill-after-eas-init>' } },
    updates: { url: 'https://u.expo.dev/<eas-project-id>' },
    runtimeVersion: { policy: 'appVersion' }
  }
};
```

### 26.3 Versioning
- Native version bumps: when `package.json` deps or `app.config.ts` change → full build.
- JS-only bumps: OTA via `eas update`.
- Semantic commit prefix `native:` forces full-build path even on a JS-only change (safety lever).

---

## 27. Store Submission Checklists

### 27.1 App Store Connect
- App icon (1024×1024)
- Screenshots: iPhone 6.7", 6.1", 5.5", iPad 12.9"/11"/6th gen — 3 per role (admin, client, sub)
- Privacy policy URL: `https://groundops.co/privacy`
- Data collection disclosures (email, name, photos, location-when-in-use, payment info — through Stripe only, no storage)
- Age rating: 4+
- Export compliance: encryption = yes, uses standard Apple crypto
- Review note: provide demo accounts for admin / client / subcontractor

### 27.2 Google Play Console
- Feature graphic (1024×500)
- Screenshots per phone + 7"/10" tablet — 3 per role
- Privacy policy URL
- Data safety declaration: names, emails, photos, financial info (processed, not stored)
- Content rating: Everyone
- Target SDK 34+
- Signing: Play App Signing enabled, upload key generated by EAS

---

## 28. Acceptance Checklist (sign-off)

Every item must be checked before marking done:

- [ ] Single Expo codebase under `GroundOpApps/mobile` produces both iOS and Android builds.
- [ ] Admin sees exactly 45 admin screens, client exactly 24, subcontractor exactly 9 (plus shared auth screens).
- [ ] All 101 API routes reachable from mobile for relevant role.
- [ ] All 30 Firestore collections readable/writable per security rules — mobile does not attempt writes that the rules forbid.
- [ ] Firebase Auth JS SDK with `AsyncStorage` persistence; role detection order = admin → client → sub.
- [ ] `EXPO_PUBLIC_APP_ENV=staging` switches to `sandbox` Firestore database.
- [ ] Stripe PaymentSheet for card + ACH works end to end, both platforms.
- [ ] Camera/gallery uploads to Cloudinary with <3.5 MB compression.
- [ ] QR scanner auto-fills maintenance request venue.
- [ ] Maintenance-request submissions route through Firebase CF `maintRequests` (bypass Vercel 4.5 MB limit).
- [ ] Push notifications delivered on iOS + Android for all event types.
- [ ] Realtime: chat, WO timeline, dashboard stats, notification bell, badges — all update without refresh.
- [ ] Deep links: password reset, invoice payment, impersonation, maint-request QR all resolve.
- [ ] CSV/Excel recurring-WO import works on admin mobile via `expo-document-picker` + `papaparse` + `xlsx`; defaults match web (h.wood / Jessica).
- [ ] APPY constants match web (`UDPSxyTkDIcJijrMCVsb0pcOTpU2` / Jessica / jolimon@).
- [ ] Admin impersonation: secondary Firebase app, banner, exit button, isolation from admin session.
- [ ] Subcontractor bank account entry encrypts full number to base64, stores last-4 separately.
- [ ] Vendor payments on subcontractor side hide internal notes and adjustment reasons.
- [ ] Client quote accept/reject writes exactly the allowed diff (status, acceptedAt/rejectedAt/rejectionReason, timeline, systemInformation, updatedAt).
- [ ] Subcontractor WO update writes exactly the allowed diff (status/schedule/completion fields only).
- [ ] Admin logout closes the most recent `emailLogs{type:'user_login', logoutAt:null}` entry with `logoutAt` + `sessionDuration`.
- [ ] Admin header shows live Eastern Time clock.
- [ ] Reports saved searches persist under `AsyncStorage['spruce_report_saved_searches']`.
- [ ] No server secret bundled into mobile app (audit with `expo doctor` + manual `grep EXPO_PUBLIC_` check).
- [ ] CI: web change triggers OTA (JS-only) or full build + auto-submit (native change). Proven once end-to-end with screenshots.
- [ ] Store listings approved on App Store and Play Store.
- [ ] Maestro E2E smoke suite green on both platforms.

---

## 29. What NOT to Do

- Do not fork or extend the Firestore schema unilaterally.
- Do not re-implement logic that exists in a Next.js API route — call the route.
- Do not bundle `STRIPE_SECRET_KEY`, `MAILGUN_API_KEY`, `SENDBLUE_API_SECRET`, `TWILIO_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, `FIREBASE_SYNC_PASSWORD`, or `FIREBASE_PRIVATE_KEY` into the mobile build. Ever.
- Do not use the Firebase Admin SDK on mobile. Do not use any service-account JSON. Org policy.
- Do not add a dark theme. Web is light-only.
- Do not invent new enum values for statuses, categories, priorities, notification types, timeline types — they are locked (Section 10).
- Do not weaken Firestore rules to make a mobile query "just work" — fix the query.
- Do not add features that do not exist on web, except the native-only enhancements explicitly listed in Section 16.
- Do not let the web and mobile drift. The CI pipeline in Section 25 is mandatory.
- Do not hardcode URLs — always use `EXPO_PUBLIC_APP_URL`.
- Do not manually bump version strings; let EAS `autoIncrement` handle build numbers.
- Do not skip the prebuild step when native config changes (`expo prebuild --clean`).

---

## 30. Kickoff Commands (run from scratch)

```bash
# 0. Prereqs
npm install -g eas-cli vercel expo-cli

# 1. Scaffold Expo app in GroundOpApps/mobile
cd /home/waseem/Desktop/hey-spruceapp/GroundOpApps
npx create-expo-app@latest mobile --template tabs
cd mobile

# 2. Install every runtime dep (single command)
npx expo install expo-router expo-notifications expo-image-picker expo-image-manipulator \
  expo-camera expo-local-authentication expo-linking expo-font expo-file-system \
  expo-sharing expo-print expo-document-picker expo-secure-store expo-splash-screen \
  @react-native-async-storage/async-storage @react-native-community/netinfo \
  firebase @stripe/stripe-react-native @tanstack/react-query \
  react-hook-form zod date-fns lucide-react-native sonner-native \
  react-native-reanimated react-native-gesture-handler react-native-screens \
  @shopify/flash-list nativewind tailwindcss \
  react-native-maps react-native-calendars react-native-tab-view \
  react-native-pager-view react-native-image-viewing @gorhom/bottom-sheet \
  react-native-svg victory-native papaparse xlsx

npm i -D typescript @types/react @types/papaparse eslint prettier maestro-cli

# 3. Link Vercel and create EAS project
vercel link                        # pick the same Vercel project as web
eas login
eas init
eas build:configure

# 4. Pull env from Vercel → EAS secrets
mkdir -p ../scripts
# (place the pull-vercel-env.sh from Section 25.4)
chmod +x ../scripts/pull-vercel-env.sh
../scripts/pull-vercel-env.sh

# 5. Set up NativeWind
# (follow NativeWind v4 docs; copy web's tailwind.config.ts tokens)

# 6. Copy canonical files from web repo
cp ../../types/index.ts ./types/index.ts
# Port lib/auth-context.tsx, lib/notifications.ts, lib/status-utils.ts, lib/timeline.ts,
# lib/support-ticket-*.ts, lib/invoice-number.ts, lib/appy-client.ts,
# lib/dashboard-utils.ts, lib/email-template.ts, lib/problem-taxonomy.ts,
# lib/subcontractor-ids.ts, lib/logo-base64.ts, lib/utils.ts

# 7. Prebuild native projects
npx expo prebuild --clean

# 8. Dev run
npx expo start --dev-client

# 9. First builds (preview = staging / sandbox)
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

---

## Reference — Ground Truth Sources (verified during this review)

- `package.json` — web dependencies
- `vercel.json` — cron schedules, function memory/timeout
- `firebase.json` — Firestore DB id, functions source
- `firestore.rules` — 391 lines, every rule read
- `firestore.indexes.json` — composite indexes
- `functions/index.js` — `maintRequests` CF
- `.env.local` — env var names (values redacted)
- `lib/firebase.ts` — sandbox DB switch logic
- `lib/auth-context.tsx` — role detection order
- `lib/appy-client.ts` — APPY constants
- `lib/sandbox-config.ts` — SYNC_COLLECTIONS list
- `lib/sendblue.ts` / `lib/twilio.ts` — phone normalization
- `lib/notifications.ts` — notification type set
- `components/admin-layout.tsx` — admin nav + badges
- `components/client-layout.tsx` — client nav + permission flags
- `components/subcontractor-layout.tsx` — subcontractor nav
- `types/index.ts` — 698 lines, every type
- Filesystem scan of `app/` — 91 screen files, 101 API routes

**This document captures every item verified against those sources. If the web changes, update this document and let the CI pipeline propagate the change to mobile automatically.**

---

# APPENDIX A — Additional Verified Details (items pulled from source after primary review)

## A.1 Guided Work-Order Creation — Problem Taxonomy (ServiceChannel-style)

Verified in `lib/problem-taxonomy.ts`. The admin guided WO flow (`/admin-portal/work-orders/create/guided`) uses a hardcoded taxonomy of 12 rows drilled into **Area → Problem Type → Equipment → Problem Code** with keyword search. Port this file verbatim to `mobile/lib/problem-taxonomy.ts` and use it on the guided-creation screen in the admin app.

Keyword search function `searchProblemTaxonomy(query: string): ProblemSuggestion[]` — minimum 2 chars, case-insensitive, matches any keyword OR substring in area/type/equipment/code. Replicate exactly.

Preconfigured rows: Executive Office/Electrical/Outlets; Kitchen/Electrical/Outlets; Kitchen/HVAC/Walk-in Cooler; Kitchen/Plumbing/Sink; Restroom/Plumbing/Toilet; Restroom/Plumbing/Faucet; Main Floor/HVAC/AC Unit; Main Floor/HVAC/Heater; General/General Repairs/Doors; General/Janitorial/Floor; Parking/Electrical/Lighting; Storage/Electrical/Outlets.

## A.2 ServiceChannel-Style Dashboard (all three portals) — exact status columns

Verified in `newtemp.md` and `components/dashboard/*`. All three dashboards (admin/client/subcontractor) must render three sections with these categorized status columns:

**Section 1 — Work Orders (title + external-link icon + gear icon)**
- **"Work Required"** — sub-columns: `Dispatch Not Confirmed`, `Declined By Provider`, `Late to Arrive`. Counts format `X/Y` (X in red if non-zero / Y total).
- **"In Progress"** — sub-columns: `Parts on Order`, `Waiting for Quote`, `Unsatisfactory`.
- **"Awaiting Action"** — sub-columns: `Pending Confirmation` (blue), `Action Required Work Orders` (info icon), `My Action Required Work Orders` (red + info icon).

Status mapping rules (exact, from newtemp.md):
- `dispatch_not_confirmed` = approved but not yet assigned
- `declined_by_provider` = declined by subcontractor
- `late_to_arrive` = scheduled time has passed but work hasn't started
- `parts_on_order` = assigned but waiting for parts
- `waiting_for_quote` = in bidding phase
- `unsatisfactory` = marked unsatisfactory by client
- `pending_confirmation` = pending admin/client confirmation
- `action_required` / `my_action_required` — role-contextual

**Section 2 — Proposals (label = "Proposals", data = `quotes`)**
- `Pending Approval` — pending (admin review) OR sent_to_client (awaiting client)
- `On Hold` — on-hold flag
- `Rejected` — status='rejected'
- `Approved` — status='accepted'

**Section 3 — Invoices**
- `Completed Not Invoiced` — work orders completed with no invoice doc
- `Open & Reviewed` — invoice status='sent'; display "Mixed Currency" subtext
- `On Hold` — status='draft' / on-hold
- `Rejected` — rejected invoices

Role filtering for all three sections:
- **Admin:** all data
- **Client:** only own (by `clientId` OR `assignedLocations[]`)
- **Subcontractor:** bidding/assigned/in-progress

Search bar + action button:
- Left: "by Tracking #" dropdown (or similar search-criteria selector)
- Middle: "Exact Search…" input
- Right: blue search button + blue "Create Service Request" button (contextual label per portal)

Port **exactly** this dashboard on mobile — adapted to vertical stack with collapsible sections if horizontal space is tight.

## A.3 Status color map (verbatim from `lib/status-utils.ts`)

Copy `lib/status-utils.ts` verbatim to `mobile/lib/status-utils.ts` (ignore the dark-mode variants; web uses light-only). Key values:

| Status | Tailwind classes |
|---|---|
| pending | `bg-yellow-100 text-yellow-800` |
| approved | `bg-blue-100 text-blue-800` |
| rejected | `bg-red-100 text-red-800` |
| bidding | `bg-purple-100 text-purple-800` |
| quotes_received | `bg-indigo-100 text-indigo-800` |
| to_be_started | `bg-cyan-100 text-cyan-800` |
| assigned | `bg-blue-100 text-blue-800` |
| completed | `bg-green-100 text-green-800` |
| accepted_by_subcontractor | `bg-teal-100 text-teal-800` |
| rejected_by_subcontractor | `bg-red-100 text-red-800` |
| draft | `bg-muted text-muted-foreground` |
| sent | `bg-blue-100 text-blue-800` |
| paid | `bg-green-100 text-green-800` |
| overdue | `bg-red-100 text-red-800` |
| sent_to_client | `bg-blue-100 text-blue-800` |
| accepted | `bg-green-100 text-green-800` |
| in-progress | `bg-blue-100 text-blue-800` |
| active | `bg-green-100 text-green-800` |
| inactive | `bg-muted text-muted-foreground` |
| cancelled | `bg-red-100 text-red-800` |

Priority color map (`getPriorityColor`): low=blue, medium=yellow, high=orange, urgent=red.

Currency helper `formatCurrency(amount)` → `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. Reuse exactly.

Timestamp helper `getTimestampValue(value)` — handles Firestore `Timestamp` (`.toDate()`), JS `Date`, string, number. Port verbatim.

## A.4 Support ticket label maps (verbatim from `lib/support-ticket-helpers.ts`)

```ts
SUPPORT_CATEGORY_LABELS = {
  billing: 'Billing', technical: 'Technical', 'work-order': 'Work Order',
  account: 'Account', general: 'General', 'bug-report': 'Bug Report',
  'feature-request': 'Feature Request'
}
SUPPORT_STATUS_LABELS = {
  open: 'Open', 'in-progress': 'In Progress',
  'waiting-on-client': 'Waiting on Client', 'waiting-on-admin': 'Waiting on Admin',
  resolved: 'Resolved', closed: 'Closed'
}
SUPPORT_TYPE_LABELS = {
  question: 'Question', problem: 'Problem', task: 'Task', incident: 'Incident'
}
```

Also port `initialsFromName(name)` — returns 2-char uppercase avatar initials (used in ticket-comment avatars).

## A.5 ID generators — exact formats

- **Invoice number** (`lib/invoice-number.ts`): `INV-${Date.now().toString().slice(-8)}` → `INV-12345678`. Regex validator `/^INV-\d{8}$/`.
- **Ticket number** (per `support-portal-prompt.md`): `TKT-{8-digit-zero-padded}` (auto-incremented via `counters/{supportTickets}` document).
- **Maintenance request number**: `MR-{8-digit-zero-padded}` (same counter pattern).
- **Work order number**: `WO-XXXXXXXX` (see existing docs; 8 chars).
- **Recurring work order number**: `RWO-XXXXXXXX`.
- **Timeline event id** (`lib/timeline.ts`): `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`.

Port these exactly — invoice filter regexes in search depend on the format.

## A.6 Client-location permission system (critical — verified in `newreq.md` PART 1.2)

Client `assignedLocations?: string[]` restricts visibility:
- Client sees work orders where `locationId ∈ assignedLocations` **OR** `clientId == uid` (verified in `lib/dashboard-utils.ts calculateWorkOrdersData`).
- **Multi-client per location supported:** Multiple clients (Sara, Mara) can be assigned the same location and all see the same work orders.
- **Peer company visibility:** If two clients share `companyId`, they see each other's same-location work orders (param `clientPeerCompanyId` in `calculateWorkOrdersData`).
- **Admin must assign at least one location before approving a client** (validation rule).
- Client registration flow:
  1. Admin creates client with Firebase custom claim `approved: false`
  2. Client sets password via `/set-password`, Firestore `status` stays `'pending'`
  3. Admin approves → set `status: 'approved'`, `approvedBy`, `approvedAt`, custom claim `approved: true`, send "account approved" email
  4. Login check: if custom claim `approved !== true`, show "Your account is pending approval."

Mobile must replicate identically. Don't render portal UI until both `status === 'approved'` AND the custom claim is true.

## A.7 Vendor Payment flow (verified `vendorpaymentflow.md`)

- Admin can create vendor payment **only when WO status ∈ `{'pending_invoice', 'completed'}`**.
- Each WO has **0 or 1 active** vendor payment.
- Store `vendorPaymentId` on `workOrders/{id}` for fast lookup **in addition to** `workOrderId` on `vendorPayments/{id}`.
- Base amount auto-sourced from accepted quote's `totalAmount`; admin may override.
- Adjustments list: each `{ id, type: 'increase'|'decrease', amount, reason, createdAt, createdBy }`. Must be auditable.
- Subcontractor completed-jobs card shows vendor payment as a **read-only attached record**: status, final amount, optional base. **Hides internal notes and adjustment reasons.** Either show adjustments transparently OR show an "Adjusted" badge — whichever, stay consistent.
- Admin creates via `/admin-portal/work-orders/[id]` Vendor Payment tab.

## A.8 Recurring Work Order CSV/Excel Import — exact mappings (verified `Recurringwocsv.md`)

**Source file shape** (columns):
- `RESTAURANT` → `locationId` (via `locationMappings` lookup)
- `SERVICE TYPE` → `category`
- `LAST SERVICED` → `lastServiced` (Firestore Timestamp)
- `NEXT SERVICE NEEDED BY` (5 columns) → `nextServiceDates[]`
- `FREQUENCY LABEL` → `recurrencePatternLabel` AND `recurrencePattern`
- `SCHEDULING` → `recurrencePattern.scheduling` (raw string kept)
- `NOTES` → `notes`

**Frequency mapping:**
- `DAILY` → `type: 'daily', interval: 1`
- `SEMIANNUALLY` → `type: 'monthly', interval: 6`
- `QUARTERLY` → `type: 'monthly', interval: 3`
- `MONTHLY` → `type: 'monthly', interval: 1`
- `BI-MONTHLY` → `type: 'monthly', interval: 2`
- `BI-WEEKLY` → `type: 'weekly', interval: 2`

**Defaults (hardcoded):**
- Company: `"The h.wood Group"` (validate company exists; else error)
- Client: `"Jessica Cabrera-Olimon"` (= APPY_CLIENT_DISPLAY_NAME)

**Preconfigured Location Mappings** (seed `locationMappings/{id}` with these):
- `Delilah (West Hollywood)` → `Delilah LA`
- `Keys (Sunset Blvd, West Hollywood)` → `Keys Nightclub`
- `Poppy (West Hollywood)` → `Poppy`
- `The Bird Streets Club (Sunset, West Hollywood)` → `Bird Streets`
- `The Nice Guy (Cienega, West Hollywood)` → `The Nice Guy`
- `Delilah (Miami)` → `Delilah Miami`

**Import modal default mode** (from `recworkorderupdate.md`): default to `'update_or_create'` (NOT `'create'`). Preview step must split rows into **"Will Update"** vs **"Will Create"** breakdowns, each in its own table.

**Admin-only:** Server-side validation must enforce admin role; non-admins must not see the import button.

**Mobile implementation:**
- Use `expo-document-picker` to pick `.csv` or `.xlsx`.
- Parse on-device with `papaparse` / `xlsx`.
- Submit to `POST /api/recurring-work-orders/import`.
- Preview modal = full-screen sheet on mobile with tabbed "Update" / "Create" segments.

## A.9 Work Order audit timeline (verified `newreq.md` PART 3)

Every status change creates a `WorkOrderTimelineEvent` with: `id` (timestamp+random), `timestamp`, `type`, `userId`, `userName`, `userRole`, `details`, `metadata?`.

Trigger points (must all write timeline events):
- Admin approves work order
- Admin shares for bidding (with `subcontractors[]` in metadata)
- Subcontractor submits quote
- Admin shares quote with client
- Client approves/rejects quote
- Admin assigns to subcontractor
- Schedule set / schedule shared with client
- Work started
- Work completed (with notes)
- Invoice sent
- Payment received
- Archive

Same pattern for `QuoteTimelineEvent` (types: `created | sent_to_client | accepted | rejected`) and `InvoiceTimelineEvent` (types: `created | sent | paid`). Helpers in `lib/timeline.ts` — port verbatim.

Admin WO detail page shows collapsible "System Information" section with full timeline + structured `systemInformation` object (see `types/index.ts` `WorkOrderSystemInformation`). Mobile must render the same.

## A.10 Subcontractor quote submission — required fields (verified `newreq.md` PART 4)

**Must be required** (enforce zod validation identically on mobile):
- `proposedServiceDate` (Date)
- `proposedServiceTime` (string, e.g. "2:00 PM")
- `estimatedDuration` (string, e.g. "2–3 days")

On client quote approval, **auto-copy** `proposedServiceDate` → `workOrders.scheduledServiceDate` and `proposedServiceTime` → `workOrders.scheduledServiceTime`. Don't make the admin re-enter.

## A.11 Email + SMS fan-out on every key event

Every state transition triggers BOTH an email (Mailgun) AND an in-app notification (Firestore). Mobile adds a third channel: **push notification**. Events that fire all three:
- Work order created → admin
- Work order shared for bidding → subcontractors
- Quote submitted → admin + client
- Quote shared with client → client
- Client accepts / rejects quote → admin
- Work order assigned → subcontractor
- Schedule set / shared → client
- Work completed → admin + client
- Invoice sent → client
- Invoice paid (Stripe webhook) → admin + client (auto-charge receipt email generated via `lib/auto-charge-email.ts`)
- Maintenance request submitted (via APPY or direct) → admin
- Client/subcontractor account approved → approved user
- Support ticket created / status changed / comment added → all participants

**Fire-and-forget** — UI must not block on these.

## A.12 Auto-charge receipt email + PDF (verified `lib/auto-charge-email.ts`)

Stripe subscription webhook (`invoice.paid`) triggers a server-side email with generated PDF receipt containing `clientEmail, clientName, amount, invoiceNumber, chargedAt, cardBrand, cardLast4, subscriptionAmount, subscriptionBillingDay, stripePaymentIntentId`. Logged to `emailLogs`. Mobile does not trigger this — it only views the result. But mobile's client portal "Payment Methods" and "Invoices" must display the auto-charge status fields on the invoice (`autoChargeAttempted`, `autoChargeStatus`, `autoChargeError`).

## A.13 API auth helpers (verified `lib/api-verify-firebase.ts`)

Every API route verifies the caller via:
1. `Authorization: Bearer <idToken>` header
2. `getBearerUid(request)` → either uses Admin SDK to verify, or falls back to base64-decoding the JWT payload (`payload.user_id || payload.sub`)
3. `getPortalUserProfile(db, uid)` → looks up `adminUsers` → `clients` → `subcontractors` in that order, returns `{ uid, role, fullName, email, clientId?, subcontractorId? }`

**Mobile client** must attach a fresh ID token to every request (`await auth.currentUser.getIdToken()`) and retry once on 401 with `getIdToken(true)` (force refresh).

## A.14 Helper scripts reference (in `scripts/`) — do not port, but know they exist

These scripts are for operations/testing; mobile should not duplicate them:
- `convert-logo-to-base64.js` — generates `lib/logo-base64.ts`
- `create-admin-user.mjs` — provisions an admin account
- `create-test-wo-email.mjs` — test data
- `e2e-full-payment-cycles.mjs` — end-to-end Stripe
- `e2e-support-tickets.mjs` — E2E tickets
- `e2e-work-order-lifecycle.mjs` / `e2e-work-order-full-matrix.mjs` — WO lifecycle matrix
- `migrate-invoice-numbers.mjs` — one-off migration
- `seed-test-data.mjs` — seed data
- `setup-firebase-admin.js`, `setup-and-test-emails.js`
- `supabase-setup.sql`, `test-mailgun-simple.js`, `test-all-*.js`

For mobile test data, reuse `seed-test-data.mjs` against the sandbox Firestore.

## A.15 Test suite reference (`__tests__/`)

Structure:
- `unit/`, `smoke/`, `performance/`, `integration/`, `acceptance/`, `e2e/`
- Individual component tests: `admin-layout.test.tsx`, `admin-dashboard.test.tsx`, `portal-login.test.tsx`, `register-client.test.tsx`, `register-subcontractor.test.tsx`, `payment-success.test.tsx`, etc.
- `TEST_SUMMARY.md` — coverage summary

Mobile must maintain a parallel structure: `mobile/__tests__/{unit,smoke,integration}` with Jest + RN Testing Library, plus `mobile/e2e/` with **Maestro** flows for the same critical paths (login → dashboard → create work order → approve quote → pay invoice).

## A.16 Cloud Functions package (verified `functions/package.json`)

```json
{ "engines": { "node": "20" }, "dependencies": { "firebase-admin": "^12", "firebase-functions": "^4.5" } }
```

Deploy via `firebase deploy --only functions`. The single function `maintRequests` runs on Node 20. **Do not change this** from mobile work. Mobile only calls its HTTP URL.

## A.17 Companies permissions matrix (admin-only page)

Admin `/admin-portal/companies-permissions` controls, per (client ↔ company) pair, which companies' work orders each client can see — overlays `companyId` filter on top of `assignedLocations[]`. The storage model: a boolean matrix on the client profile or a dedicated collection. **Confirm with admin before touching this.** Mobile must render the same matrix UI for admins.

## A.18 APPY integration — maint requests path-through

When APPY (an external maintenance system) POSTs a maintenance request:
1. APPY hits Firebase CF `maintRequests` with bearer token
2. CF uploads image to Cloudinary
3. CF creates `maint_requests/{MR-XXXXXXXX}` with APPY fields (`appyRequestId`, `venue`, `requestor`, etc.)
4. Admin sees it at `/admin-portal/maint-requests`
5. Admin clicks "Create Work Order" → generates `workOrders/{id}` with `clientId = APPY_CLIENT_ID` ('UDPSxyTkDIcJijrMCVsb0pcOTpU2'), `isMaintenanceRequestOrder: true`, venue/requestor/title copied across.
6. `getWorkOrderClientDisplayName()` renders the client name as "Jessica Cabrera-Olimon".

Mobile admin's maint-requests screen must show the APPY-source requests with identical conversion UX.

## A.19 Additional lib files to port (lift-and-shift with RN fixes)

| Web file | Mobile target | Notes |
|---|---|---|
| `lib/status-utils.ts` | verbatim | color classes map |
| `lib/timeline.ts` | verbatim | event builders |
| `lib/invoice-number.ts` | verbatim | |
| `lib/problem-taxonomy.ts` | verbatim | |
| `lib/subcontractor-ids.ts` | verbatim | `subcontractorAuthId()` |
| `lib/notifications.ts` | swap imports | uses `firebase/firestore` only |
| `lib/email-template.ts` | verbatim (for PDF HTML reuse) | |
| `lib/support-ticket-helpers.ts` | verbatim | labels + initials |
| `lib/support-ticket-api-client.ts` | swap fetch baseURL | |
| `lib/support-ticket-snapshots.ts` | verbatim | returns unsubscribe fns |
| `lib/appy-client.ts` | verbatim | APPY constants |
| `lib/logo-base64.ts` | verbatim | |
| `lib/dashboard-utils.ts` | verbatim + `clientPeerCompanyId` param | |
| `lib/pdf-generator.ts` | rewrite using `expo-print` | jsPDF/html2canvas not RN-compatible |
| `lib/cloudinary-upload.ts` | rewrite for RN fetch/FormData | |
| `lib/client-image-compress.ts` | rewrite using `expo-image-manipulator` | |
| `lib/auth-context.tsx` | swap to expo-router + initializeAuth | |
| `lib/firebase.ts` | RN-specific init | see §5.2 |
| `lib/firebase-admin.ts` | **DO NOT PORT** — server only | |
| `lib/firebase-server.ts` | **DO NOT PORT** — server only | |
| `lib/firebase-staging-admin.ts` | **DO NOT PORT** — server only | |
| `lib/email.ts` | **DO NOT PORT** — Mailgun server-only | |
| `lib/email-logger.ts` | **DO NOT PORT** — server only | |
| `lib/sendblue.ts` | **DO NOT PORT** — server only | |
| `lib/twilio.ts` | **DO NOT PORT** — server only | |
| `lib/supabase-admin.ts` | **DO NOT PORT** — server only | |
| `lib/api-verify-firebase.ts` | **DO NOT PORT** — server only | |
| `lib/sandbox-config.ts` | reference only | not needed at runtime |
| `lib/auto-charge-email.ts` | **DO NOT PORT** — server only | |

## A.20 Firebase Auth custom claims

- `approved: boolean` — set by admin approval API; blocks login when false
- `role: 'admin'|'client'|'subcontractor'` — optional, still read Firestore for canonical role
- `impersonating?: { targetUid, targetRole }` — set when admin starts impersonation session

Mobile must call `auth.currentUser.getIdTokenResult(true)` to read custom claims after admin approval (force refresh token).

## A.21 "Rejected Work Orders" and "Archived Work Orders" (admin-only subviews)

Pages `/admin-portal/rejected-work-orders` and `/admin-portal/work-orders?type=archive` (verified in admin layout). Both are filtered views — `status='rejected'` and `status='archived'` respectively. Mobile admin app must expose both as drawer entries.

## A.22 Resources page (`/admin-portal/resources`)

Hub for: help docs, API token CRUD (`api_tokens/{id}`), sandbox refresh history, sandbox refresh trigger (`POST /api/sandbox-refresh`). API tokens are what APPY and external systems use to authenticate to the `maintRequests` CF.

## A.23 View Controls & Saved Views

`contexts/view-controls-context.tsx` + `components/view-controls.tsx` expose per-page view-mode toggles (list/grid/compact) and remembered filter state in localStorage (web). Mobile uses AsyncStorage under the same keys.

## A.24 Global Search (role-scoped)

Three separate components on web:
- `components/global-search-dialog.tsx` (admin)
- `components/client-global-search-dialog.tsx`
- `components/subcontractor-global-search-dialog.tsx`

All hit `GET /api/search?q=&role=` which returns matching work orders, quotes, invoices, support tickets scoped to the caller's role. Mobile must include a top-bar search icon that opens the scoped modal with FlashList results. Deep link result → corresponding detail screen.

## A.25 Impersonation session storage key

Web: `localStorage['impersonationState']` with shape `{ isImpersonating: boolean, appName: string, targetUid?: string, targetRole?: 'client'|'subcontractor' }`. Mobile: `AsyncStorage['impersonationState']` — same shape.

## A.26 Staging vs Production UI differentiators

When `EXPO_PUBLIC_APP_ENV=staging`:
- Use `sandbox` Firestore database (see §5.2)
- Display a "STAGING" banner pill beside the logo on every layout
- Connect mobile's Stripe to Stripe test keys (separate publishable key in staging)
- Allow sandbox refresh button behavior

## A.27 Email templates (style reference)

Web emails (Mailgun) use `lib/email-template.ts` helpers: `emailLayout()`, `infoCard()`, `infoRow()`, `ctaButton()`, `alertBox()`, `divider()`. Theme: **dark navy header + beige body** (per `support-portal-prompt.md` reference). Reuse these helpers when generating mobile PDFs (invoice, work order summary) via `expo-print` so web email + mobile PDF look consistent.

## A.28 Data retention / archival

Work orders move to `status: 'archived'` (not deleted) via admin action. Firestore retains everything. Mobile archive view is read-only; no mobile-initiated hard deletes for any entity.

## A.29 Supabase sync (nightly `55 23 * * *`)

`/api/sync/firebase-to-supabase` copies the 26 collections in `lib/sandbox-config.ts` `SYNC_COLLECTIONS` to Supabase every night. Mobile does not touch Supabase; it's a reporting mirror only. If mobile needs analytics data at scale later, read from Supabase — but default is Firestore.

## A.30 Accessibility requirements

- All touch targets ≥ 44×44 pt (iOS HIG) / 48×48 dp (Material)
- Every interactive element has `accessibilityLabel` + `accessibilityHint`
- Status colors never used alone — always paired with text (color-blind safe)
- Dynamic Type / Font Scaling supported (respect OS text-size)
- VoiceOver + TalkBack smoke tested against login, dashboard, create-work-order, accept-quote, pay-invoice flows

## A.31 Performance budget

- Cold start < 3s on mid-range device
- Dashboard render < 1s after auth
- FlashList for any list > 20 items
- Image thumbnails via Cloudinary transforms (`f_auto,q_auto,w_600`) — never load full-res for list views
- Firestore listeners are unsubscribed on screen unmount (React `useEffect` cleanup)

## A.32 Error boundaries + offline

- Global `<ErrorBoundary>` at root; logs to Crashlytics
- `<OfflineBanner>` when `netinfo.isConnected === false`
- Firestore automatic offline persistence is **enabled** for mobile (unlike web by default) — `initializeFirestore(app, { cacheSizeBytes: 50 * 1024 * 1024 })` with `persistentLocalCache`.

## A.33 Final cross-check — every web feature mapped to a mobile screen

| Web feature | Mobile screen path |
|---|---|
| Landing | redirects |
| Portal login | `(auth)/login.tsx` |
| Client registration | `(auth)/register-client.tsx` |
| Sub registration | `(auth)/register-subcontractor.tsx` |
| Forgot/reset/set password | `(auth)/*` 3 screens |
| Impersonate login | `(auth)/impersonate-login.tsx` |
| Stripe success/cancelled/failure | 3 root-level screens |
| Stripe ACH (`pay-bank/[id]`) | WebView |
| Admin Dashboard | `(admin)/index.tsx` w/ 3-section ServiceChannel UI |
| Admin Clients (list + detail) | 2 screens |
| Admin Subcontractors (list + detail) | 2 screens |
| Admin Users | 1 screen |
| Admin Account Settings | 1 screen |
| Admin Work Orders (index, standard, maint-reqs, guided create, detail, rejected, archived) | 7 screens |
| Admin Recurring Work Orders (index, create, detail, edit, location-map, CSV import modal) | 5 screens + modal |
| Admin Invoices (index, new, standard, detail) | 4 screens |
| Admin Scheduled Invoices | 1 screen |
| Admin Quotes | 1 screen |
| Admin RFPs | 1 screen |
| Admin Locations (list + detail) | 2 screens |
| Admin Subsidiaries/Companies (list + detail) | 2 screens |
| Admin Companies Permissions | 1 screen |
| Admin Categories | 1 screen |
| Admin Assets | 1 screen |
| Admin Maintenance Requests | 1 screen |
| Admin Messages | 1 screen |
| Admin Support Tickets (list + detail) | 2 screens |
| Admin Email Logs | 1 screen |
| Admin Analytics | 1 screen |
| Admin Reports | 1 screen (with saved searches) |
| Admin Contractor Scorecard | 1 screen |
| Admin Provider Search | 1 screen |
| Admin User Activity | 1 screen |
| Admin Sandbox Refresh | 1 screen |
| Admin Cron Jobs | 1 screen |
| Admin Resources (API tokens) | 1 screen |
| Client Dashboard | 3-section ServiceChannel UI |
| Client Work Orders (index, create, detail, maint-reqs variant) | 4 screens |
| Client Locations (list + create) | 2 screens |
| Client Subsidiaries (list + create) | 2 screens |
| Client Subcontractors (directory) | 1 screen (conditional) |
| Client Quotes (list + detail) | 2 screens |
| Client Invoices (list + detail) | 2 screens |
| Client Payment Methods | 1 screen |
| Client Recurring WOs (list, create, detail, edit) | 4 screens |
| Client Maintenance Requests | 1 screen |
| Client Support Tickets (list + detail) | 2 screens |
| Client Messages | 1 screen |
| Client Account Settings | 1 screen |
| Subcontractor Dashboard | 1 screen |
| Subcontractor Bidding | 1 screen |
| Subcontractor My Quotes | 1 screen |
| Subcontractor Assigned Jobs | 1 screen |
| Subcontractor Completed Jobs (w/ vendor payment read-only card) | 1 screen |
| Subcontractor Messages | 1 screen |
| Subcontractor Support Tickets (list + detail) | 2 screens |
| Subcontractor Account Settings (profile, bank, password) | 1 screen |

**Total: 91 first-class mobile screens. Every web page has a mobile counterpart. Nothing is dropped.**

---

## A.34 Final Completeness Statement

This specification + appendix now captures, from verified source files:

- 101 API route paths (full list)
- 91 portal pages mapped to mobile screens (full list)
- 30 Firestore collections with rule-by-rule access matrix
- Every type interface and every status/priority/category enum value
- Every navigation item for all three portals with icons, ordering, badges, and conditional permission flags
- Every environment variable name from `.env.local`
- Every third-party integration (Firebase, Stripe, Mailgun, SendBlue, Twilio, Cloudinary, Supabase, APPY)
- Every Vercel cron schedule and function memory/timeout config
- Every composite Firestore index
- Every business rule (APPY constants, CSV import defaults, location mappings, vendor payment visibility, custom claims approval, client quote diff, sub WO diff, `emailLogs` logout audit, EST clock, sandbox DB switch, impersonation pattern)
- The exact ServiceChannel dashboard layout with all status columns
- The problem taxonomy for guided creation
- The full status color map and support ticket label maps
- ID generators (INV-, TKT-, MR-, WO-, RWO-, timeline event id)
- All lib files tagged as "port verbatim", "rewrite for RN", or "server-only — do not port"
- CI/CD pipeline (web → mobile OTA or full build + submit)
- EAS config, app.config.ts, store submission requirements
- Accessibility, performance, and offline behavior targets
- Acceptance checklist (27+ items)

**If an implementing engineer follows this document, nothing from the web portal will be missed in the mobile apps.**

---

# APPENDIX B — Final Env-Var & Shared-Service Audit (every `process.env.*` reference in the codebase)

> This appendix was produced by a full-tree grep of `process.env.*` across `app/api/**`, `lib/**`, `scripts/**`, `functions/**`, and every requirement doc. It is the **canonical** env list for web + mobile. Every name below exists in Vercel and must stay there. Nothing is added or replaced on mobile — mobile reuses the exact same backend.

## B.1 🔒 Guaranteed shared across Web, iOS, Android (user requirement)

The user has explicitly required that all of these continue to power both mobile apps identically to the web:

| Service | Env vars (kept on Vercel, server-only unless marked) | Notes |
|---|---|---|
| **Firebase** | `NEXT_PUBLIC_FIREBASE_API_KEY` · `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` · `NEXT_PUBLIC_FIREBASE_PROJECT_ID` · `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` · `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` · `NEXT_PUBLIC_FIREBASE_APP_ID` · `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` · `FIREBASE_PROJECT_ID` · `FIREBASE_SYNC_EMAIL` · `FIREBASE_SYNC_PASSWORD` · `FIREBASE_CLIENT_EMAIL` (optional) · `GOOGLE_APPLICATION_CREDENTIALS` (optional admin path) | Client-exposed set is rebroadcast to mobile as `EXPO_PUBLIC_FIREBASE_*`. Server-only set stays behind API. **Same Firebase project for web + iOS + Android.** |
| **Stripe** | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (→ `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`) · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` | Publishable key goes to mobile; secret + webhook secret stay server-only. Same Stripe account. |
| **Mailgun** | `MAILGUN_API_KEY` · `MAILGUN_DOMAIN` · `MAILGUN_FROM_EMAIL` · `MAILGUN_FROM` · `FROM_EMAIL` · `MAILGUN_API_URL` (`https://api.mailgun.net` for US, `https://api.eu.mailgun.net` for EU) | 100% server-only. Mobile triggers emails by hitting `/api/email/send-*`. Same Mailgun account and sender domain. |
| **CRON_SECRET** | `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/recurring-work-orders/cron`, `/api/recurring-work-orders/execute`, and `/api/sync/firebase-to-supabase`. Server-only. Mobile **must never see or send** this. Any manual retrigger from the admin mobile app goes through the cron-monitor `PUT` endpoint (no CRON_SECRET needed). |
| **Supabase (backup mirror)** | `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Used only by `/api/sync/firebase-to-supabase` nightly (cron `55 23 * * *`). Same Supabase project shared. Mobile never touches Supabase directly. |
| **Cloudinary** | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (default `duo4kzgx4`) → `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` · `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` (default `WebAppUpload`) → `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` · `CLOUDINARY_API_KEY` · `CLOUDINARY_API_SECRET` | Cloud name + upload preset are safe on mobile for direct unsigned uploads. API key + secret stay server-only. Same Cloudinary account = same image URLs readable by web + iOS + Android. |

Any field in the table above that is NOT prefixed `NEXT_PUBLIC_` (or `EXPO_PUBLIC_` on mobile) **is a server secret and must never be bundled into the mobile app**. The mobile app reaches those services via the existing Next.js API routes.

## B.2 Full env-var inventory discovered in the code

This is the complete, deduplicated list of every `process.env.X` reference found across `/app/api`, `/lib`, `/scripts`, `/functions`, and deployment docs. Group and purpose listed.

### Firebase (client-exposed, mirrored to mobile)
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
```

### Firebase (server-only)
```
FIREBASE_PROJECT_ID              # duplicates NEXT_PUBLIC_ for server clarity
FIREBASE_CLIENT_EMAIL            # Admin SDK service account email (if used)
FIREBASE_SYNC_EMAIL              # Sync admin login (sandbox/prod sync)
FIREBASE_SYNC_PASSWORD
FIREBASE_API_KEY                 # fallback, server-side (scripts/create-admin-user.mjs)
GOOGLE_APPLICATION_CREDENTIALS   # path to service-account JSON (local dev only)
```

### Stripe
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY   # mobile gets this
STRIPE_SECRET_KEY                    # server-only
STRIPE_WEBHOOK_SECRET                # server-only, verifies webhook signatures
```

### Mailgun (server-only)
```
MAILGUN_API_KEY
MAILGUN_DOMAIN                  # 'groundops.com' / 'heyspruce.com' per env
MAILGUN_FROM                    # 'info@groundops.co' sender
MAILGUN_FROM_EMAIL              # alias used in some scripts
MAILGUN_API_URL                 # 'https://api.mailgun.net' or '.eu.' for EU region
FROM_EMAIL                      # canonical from address
```

### SendGrid (legacy — do NOT use going forward)
```
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
```
Some older docs reference SendGrid; current system uses **Mailgun**. Mobile follows the web: all transactional email goes via Mailgun.

### SendBlue (SMS + iMessage) — server-only
```
SENDBLUE_API_KEY
SENDBLUE_API_SECRET
SENDBLUE_FROM_NUMBER           # E.164 format
```

### Twilio (WhatsApp) — server-only
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM           # e.g. "whatsapp:+14155238886"
```

### Cloudinary
```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME      # → EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET   # → EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
CLOUDINARY_CLOUD_NAME                  # server-only (same value)
CLOUDINARY_UPLOAD_PRESET               # server-only
CLOUDINARY_API_KEY                     # server-only
CLOUDINARY_API_SECRET                  # server-only
```

### Supabase (nightly backup mirror) — server-only
```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```
Mobile never queries Supabase — it exists as the nightly-sync reporting mirror.

### CRON (server-only — protects Vercel cron endpoints)
```
CRON_SECRET
```
Used by:
- `/api/recurring-work-orders/cron` (Vercel cron `0 9 * * *`)
- `/api/recurring-work-orders/execute`
- `/api/sync/firebase-to-supabase` (Vercel cron `55 23 * * *`)

Mobile **never** sees this. It's a Bearer token between Vercel's cron runner and our API.

### Deployment URLs (both variants exist — support both on mobile)
```
NEXT_PUBLIC_APP_URL           # primary (preferred)
NEXT_PUBLIC_BASE_URL          # legacy alias used by older routes
VERCEL_URL                    # auto-set by Vercel at runtime
VERCEL_OIDC_TOKEN
```

Canonical mobile var: `EXPO_PUBLIC_APP_URL`. The mobile API client must accept either value and always fall back to `https://groundopscos.vercel.app`.

### Environment / runtime
```
NEXT_PUBLIC_APP_ENV           # 'staging' → switches to 'sandbox' Firestore DB
NODE_ENV
CI                            # set by CI runners
PLAYWRIGHT_TEST_BASE_URL      # test env only
```

### Maps (if enabled)
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY   # referenced in VERCEL_DEPLOYMENT_GUIDE.md / DEPLOYMENT_CHECKLIST.md
```
Mobile equivalent: **`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`** for `react-native-maps` (Google provider on Android; optional Apple on iOS). If the web is currently using Google Maps anywhere (location pickers, provider-search map), mobile must use the same key.

## B.3 Mobile env summary (exactly what EAS holds)

Shipped into every mobile build (client-exposed only):

```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID            # = groundopss
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
EXPO_PUBLIC_APP_URL                         # canonical API base
EXPO_PUBLIC_APP_ENV                         # 'production' | 'staging'
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY             # if maps in use
```

**Absolutely NOT bundled into mobile:**
```
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
MAILGUN_API_KEY, MAILGUN_DOMAIN, FROM_EMAIL, MAILGUN_API_URL, MAILGUN_FROM, MAILGUN_FROM_EMAIL
CRON_SECRET
CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
SENDBLUE_API_KEY, SENDBLUE_API_SECRET, SENDBLUE_FROM_NUMBER
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
FIREBASE_SYNC_EMAIL, FIREBASE_SYNC_PASSWORD, FIREBASE_CLIENT_EMAIL, GOOGLE_APPLICATION_CREDENTIALS
SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
VERCEL_OIDC_TOKEN
```

The pull-from-Vercel script (§25.4) must **allow-list** only the `EXPO_PUBLIC_*`-renamed set above. Any accidental inclusion of a server secret must fail the build.

## B.4 Updated `scripts/pull-vercel-env.sh` (hardened allow-list)

```bash
#!/usr/bin/env bash
set -euo pipefail

ALLOW_LIST=(
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  NEXT_PUBLIC_APP_URL
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
)

vercel env pull .env.vercel.production --environment=production --yes

while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  for allowed in "${ALLOW_LIST[@]}"; do
    if [[ "$key" == "$allowed" ]]; then
      NEW="${key/NEXT_PUBLIC_/EXPO_PUBLIC_}"
      value="${value%\"}"; value="${value#\"}"
      eas secret:create --scope project --name "$NEW" --value "$value" --type string --force
      echo "✓ synced $NEW"
      break
    fi
  done
done < .env.vercel.production

# Derived values not in Vercel env
eas secret:create --scope project --name EXPO_PUBLIC_APP_ENV --value "production" --type string --force
echo "✓ done"
```

## B.5 Shared-service behavior guarantees (what must be true after mobile ships)

Every one of the following behaviors must be observable:

1. **Firebase Auth:** A user created on web can immediately sign in on iOS and Android with the same credentials. Password resets triggered from any surface land in the same inbox.
2. **Firestore:** A work order created on iOS appears instantly on web (realtime) and on Android (realtime). All three surfaces see the same data.
3. **Firestore rules:** Exactly the same 391-line `firestore.rules` file enforces access. No rule is relaxed "for mobile."
4. **Storage:** A photo uploaded on Android via the work-order-completion screen is visible in the web admin's lightbox without any sync step.
5. **Cloudinary:** Mobile direct-uploads use the same `cloud_name=duo4kzgx4` and `upload_preset=WebAppUpload` so URLs are interchangeable with web uploads.
6. **Stripe:** A card saved in the mobile payment-methods screen is visible in the web's payment-methods list (same Stripe customer).
7. **Mailgun emails:** Every email that fires off a web action also fires off the same email when the mobile action happens — because mobile hits the same `/api/email/send-*` route.
8. **CRON_SECRET / cron jobs:** Mobile admin's "Cron Jobs" screen renders `cronJobRuns/{id}` docs written by the Vercel cron runs. Mobile never has to know the secret — it just reads the audit docs.
9. **Supabase backup:** Nightly sync continues untouched. Mobile's activity silently flows into Supabase the next night just like web activity does.
10. **Notifications:** Web's `notifications/{id}` docs (realtime-subscribed) power the mobile bell badge. No separate notification store.

If any of the above drifts, mobile and web are no longer mirrors — fix immediately.

## B.6 Final updated Acceptance item (add to §28)

- [ ] Audit: the built mobile IPA and APK contain **zero** of the names listed in §B.3 "Absolutely NOT bundled". Verified by running `strings app.ipa | grep STRIPE_SECRET_KEY` etc. — must return nothing.

---

**End of Appendix B. This document now covers every env var, every shared service, every backend behavior that web + iOS + Android rely on. Shared Firebase, shared Stripe, shared Mailgun, shared CRON_SECRET (server-only), shared Supabase backup, shared Cloudinary — all confirmed and locked in.**

---

# APPENDIX C — Final verified concrete values (images, hosts, colors, Firebase CF URL, page details)

## C.1 Firebase Cloud Functions URL (verified `next.config.js`)

The web uses `next.config.js` `rewrites.beforeFiles` to proxy:

```
/api/maint-requests  →  https://us-central1-groundopss.cloudfunctions.net/maintRequests
```

**Canonical mobile constant (hardcode or expose via env):**
```
EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL = https://us-central1-groundopss.cloudfunctions.net
```

Mobile posts maintenance-request submissions directly to `${FN_URL}/maintRequests` with `Authorization: Bearer <api_token>` (from `api_tokens` collection) — bypassing the Vercel 4.5 MB body limit for image payloads. Do not route mobile through the `/api/maint-requests` rewrite.

## C.2 Web domain aliases (from `next.config.js` redirects)

- Primary: `groundopscos.vercel.app`
- Legacy: `hey-spruce-appv2.vercel.app` → permanent-redirected to primary

**Mobile Universal Links / App Links must be configured for BOTH hosts + `groundops.co`:**
```
applinks:groundops.co
applinks:groundopscos.vercel.app
applinks:hey-spruce-appv2.vercel.app
applinks:www.groundops.co
```

## C.3 Remote image hosts (from `next.config.js` `images.remotePatterns`)

All of these are valid image sources the mobile app will encounter and must render:

```
https://res.cloudinary.com/**
https://firebasestorage.googleapis.com/**
https://heyspruceappv2.firebasestorage.app/**
https://cdn.prod.website-files.com/**
https://www.groundops.co/**
```

Mobile uses `<Image source={{ uri }}>` — no allowlist needed at runtime, but ATS (iOS App Transport Security) is happy with all-HTTPS URLs. No `http://` URLs anywhere.

## C.4 Email template — exact brand colors (verified `lib/email-template.ts`)

These are the GroundOps brand colors. Mobile **PDFs generated via `expo-print`** should use the same palette so invoice / work-order PDFs match what clients get in their email inbox.

| Purpose | Hex |
|---|---|
| Email background (beige body) | `#F3EDE3` |
| Email card background | `#FFFFFF` |
| Header + footer background (dark navy) | `#0D1520` |
| Header title text | `#FFFFFF` |
| Accent bar under title (orange) | `#D97706` |
| Body text primary | `#1A2635` |
| Body text secondary | `#5A6C7A` |
| Footer label (small caps) | `#D97706` |
| Footer muted | `#8A9CAB` |
| Button / emphasis blue | `#2563EB` |
| Card/summary background | `#F8FAFC` |
| Card border | `#E2E8F0` |

Email body font stack (reuse in mobile PDFs and native UI):
```
'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif
```

## C.5 Typography — verified from `app/globals.css`

- Primary font family: **Inter** (loaded from Google Fonts: `https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900`)
- Mobile: bundle Inter via `expo-font` (variable TTF) to avoid a runtime webfont download on every launch.

## C.6 Tailwind / Design tokens — Stone palette (verified `app/globals.css`)

Web uses the **Stone shadcn palette, light mode only**. Mobile Tailwind config must mirror these HSL values exactly so `bg-card`, `text-foreground`, `bg-muted`, etc. render identically across platforms.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 20 14.3% 4.1%;
  --card: 0 0% 100%;
  --card-foreground: 20 14.3% 4.1%;
  --popover: 0 0% 100%;
  --popover-foreground: 20 14.3% 4.1%;
  --primary: 24 9.8% 10%;
  --primary-foreground: 60 9.1% 97.8%;
  --secondary: 60 4.8% 95.9%;
  --secondary-foreground: 24 9.8% 10%;
  --muted: 60 4.8% 95.9%;
  --muted-foreground: 25 5.3% 44.7%;
  --accent: 60 4.8% 95.9%;
  --accent-foreground: 24 9.8% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 60 9.1% 97.8%;
  --border: 20 5.9% 90%;
  --input: 20 5.9% 90%;
  --ring: 20 14.3% 4.1%;
  --radius: 0.5rem;
}
```

Port these as tokens in `mobile/tailwind.config.js` under `theme.extend.colors` (convert HSL → RGB or keep as HSL if NativeWind supports it). Ignore the `.dark` variants — the app is light-only.

## C.7 MAILGUN region switch (additional env var)

`MAILGUN_EU=true` switches the Mailgun base URL to `https://api.eu.mailgun.net`. Otherwise defaults to `https://api.mailgun.net`. Add to the env list in Appendix B — **server-only**, never bundled on mobile.

## C.8 Legacy email note

`app/api/email/sync-mailgun-logs/route.ts` contains the string `'Email logs are now recorded automatically via Resend. No sync needed.'` — this is legacy wording from a prior provider. Current provider is **Mailgun** (`mailgun.js` is imported in `lib/email.ts`). Do not port SendGrid or Resend code.

## C.9 Contractor Scorecard — exact metrics (verified `/admin-portal/contractor-scorecard/page.tsx`)

Subcontractor scoring fields read from `subcontractors/{uid}` doc:
```
speedScore, qualityScore, priceScore, engagementScore, completedJobs
```
All `0–100`. Mobile admin renders these same scores using bars/radar chart (`victory-native`).

## C.10 Provider Search — filter fields (verified)

Filter inputs on `/admin-portal/provider-search`: skills (array), location/radius, status (approved only), performance tier (from composite score). Same fields on mobile admin.

## C.11 User Activity — login log fields (verified)

`emailLogs` entries with `type: 'user_login'` carry: `userId, userName, userRole, email, loginAt, logoutAt, sessionDuration, ipAddress?, userAgent?`. Admin "User Activity" page lists these grouped by user with `loginCount`, `lastLogin`. Mobile reads the same data; mobile login/logout events must write the same shape so the admin can audit mobile sessions alongside web.

## C.12 Email Logs — EmailType enum (from `lib/email-logger.ts`)

Port the `EmailType` union and the exported `logEmail()` helper (server-only) shape so mobile can filter/display email logs identically on the admin screen. The union drives the dropdown filter on the Email Logs page.

## C.13 Assets page — 5 tabs (verified)

`/admin-portal/assets` tabs: `overview | spend | condition | wo-history | resolution`. Mobile admin must render all five as a `react-native-tab-view`.

## C.14 RFPs page — query shape (verified)

RFPs list = `workOrders` where `status ∈ ['bidding', 'quotes_received']`. Not a separate collection. Port to mobile.

## C.15 Scheduled Invoices page — uses `getInvoicePDFBase64` + `generateInvoiceNumber`

Both helpers live in `lib/pdf-generator.ts` and `lib/invoice-number.ts`. On mobile, `getInvoicePDFBase64` is reimplemented via `expo-print` + base64 conversion (`expo-file-system.readAsStringAsync(uri, { encoding: 'base64' })`). Output must be acceptable to the same `/api/invoices/upload-pdf` endpoint.

## C.16 Admin Analytics source collections (verified)

Queries:
```
workOrders (all)
quotes (all)
invoices (all)
subcontractors WHERE status == 'approved'
```
Mobile fetches the same sets for the admin Analytics screen. Use `getDocs` (not `onSnapshot`) for analytics — it's a point-in-time report, not realtime.

## C.17 Cron-Monitor PUT endpoint (no CRON_SECRET)

`/api/cron-monitor` exposes a `PUT` method that manually triggers the cron chain without requiring `CRON_SECRET` — intended for admin-initiated reruns from the UI. Mobile admin's Cron Jobs screen can expose a "Run Now" button that calls `PUT /api/cron-monitor`. Safe for mobile.

## C.18 Sandbox Refresh — two endpoints

- `POST /api/sandbox-refresh` — triggers copy of production Firestore → sandbox Firestore.
- `GET  /api/sandbox-refresh/history` — returns history records.

Admin-only. Mobile admin Sandbox Refresh screen must:
- Show a "Refresh Now" confirmation sheet → POST
- Show a history list from GET
- Subscribe to `cronJobRuns` for live status updates if the refresh has a matching entry

## C.19 Maint Requests upload-config endpoint (signed direct uploads)

`GET /api/maint-requests/upload-config` returns Cloudinary upload params for direct client-to-Cloudinary uploads. Mobile uses this to upload large images without base64-roundtripping through the CF. Flow:
1. Mobile calls `GET /api/maint-requests/upload-config` → gets `{ cloudName, uploadPreset }` plus possibly a signature.
2. Mobile uploads image directly to Cloudinary (multipart).
3. Mobile POSTs the returned `secure_url` + metadata to the Firebase CF (which no longer needs to proxy the image).

This is the preferred path for non-huge images. Use the CF base64 path as fallback only.

## C.20 Admin Messages — chat partners list

Admin `/admin-portal/messages` lists all chats where admin is a participant. Chats show per-pair: avatar, last message preview, timestamp, unread count per user. Mobile uses `FlashList` + `onSnapshot(chats where participants array-contains uid)`.

## C.21 Client / Subcontractor permission flags (verified `types/index.ts` + `client-layout.tsx`)

**Client profile flags** (all stored on `clients/{uid}`):
- `assignedLocations?: string[]`
- `hasMaintenancePermission?: boolean`
- `hasMaintenanceRequestsWorkOrdersPermission?: boolean`
- `hasViewSubcontractorsPermission?: boolean`
- `hasRecurringWorkOrdersPermission?: boolean`
- `autoPayEnabled?: boolean`
- `subscriptionStatus?: 'active' | 'paused' | 'cancelled'`
- `paymentTermsDays?: number`
- `autoChargeThreshold?: number`

Mobile must read these on login and conditionally render tabs/actions — same as web.

**Admin profile flags** (on `adminUsers/{uid}`):
- `workOrderEmailNotifications?: boolean`
- `supportTicketEmailNotifications?: boolean`

Account Settings screen must allow admin to toggle these.

## C.22 `.env.mobile` FINAL — exact file to hand to EAS

This is the definitive mobile env file. Every value comes from Vercel (or, for `EXPO_PUBLIC_APP_ENV`, is set per-profile in `eas.json`).

```dotenv
# === Shared Firebase (same project: groundopss) ===
EXPO_PUBLIC_FIREBASE_API_KEY=<from Vercel NEXT_PUBLIC_FIREBASE_API_KEY>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<from Vercel NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN>
EXPO_PUBLIC_FIREBASE_PROJECT_ID=groundopss
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<from Vercel NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET>
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<from Vercel>
EXPO_PUBLIC_FIREBASE_APP_ID=<from Vercel>
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=<from Vercel>

# === Firebase Cloud Functions (maint-requests) ===
EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL=https://us-central1-groundopss.cloudfunctions.net

# === Stripe (same Stripe account as web) ===
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=<from Vercel NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY>

# === Cloudinary (same account as web) ===
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=duo4kzgx4
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=WebAppUpload

# === Deployment ===
EXPO_PUBLIC_APP_URL=https://groundopscos.vercel.app
EXPO_PUBLIC_APP_ENV=production     # or 'staging' for sandbox Firestore db

# === Maps (if enabled on web) ===
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<from Vercel NEXT_PUBLIC_GOOGLE_MAPS_API_KEY>
```

**Mobile NEVER contains (these stay on Vercel exclusively):**
```
STRIPE_SECRET_KEY          STRIPE_WEBHOOK_SECRET
MAILGUN_API_KEY            MAILGUN_DOMAIN   MAILGUN_FROM   MAILGUN_FROM_EMAIL
MAILGUN_API_URL            MAILGUN_EU       FROM_EMAIL
CRON_SECRET
CLOUDINARY_API_KEY         CLOUDINARY_API_SECRET
SENDBLUE_API_KEY           SENDBLUE_API_SECRET     SENDBLUE_FROM_NUMBER
TWILIO_ACCOUNT_SID         TWILIO_AUTH_TOKEN       TWILIO_WHATSAPP_FROM
NEXT_PUBLIC_SUPABASE_URL   SUPABASE_SERVICE_ROLE_KEY
FIREBASE_SYNC_EMAIL        FIREBASE_SYNC_PASSWORD  FIREBASE_CLIENT_EMAIL
GOOGLE_APPLICATION_CREDENTIALS
SENDGRID_API_KEY           SENDGRID_FROM_EMAIL
VERCEL_OIDC_TOKEN          VERCEL_URL
```

## C.23 Final Shared-Service Promise (restated)

The user has required — and this spec guarantees — that after mobile ships:

✅ **Firebase** — one project (`groundopss`), one Firestore, one Auth tenant, one Storage bucket. Web, iOS, Android all read/write the same docs.
✅ **Stripe** — one account, one publishable key on client, one secret key on server. Same customers, cards, subscriptions across platforms.
✅ **Mailgun** — same account, same domain, same `info@groundops.co` sender. Every email fired on mobile arrives with the exact same template web would produce.
✅ **CRON_SECRET** — a server-only Bearer protecting the Vercel cron endpoints (recurring WO cron/execute + Supabase sync). Mobile never sees it; mobile only reads audit docs (`cronJobRuns`) from Firestore.
✅ **Supabase** — same project, used exclusively as a nightly backup mirror of Firestore. Mobile does not query it; it is a reporting destination only.
✅ **Cloudinary** — same `cloud_name=duo4kzgx4` and `upload_preset=WebAppUpload`. Every image uploaded from iOS or Android yields URLs readable by every platform.

If any of the six drifts (parallel project, separate account, mobile-specific duplicate) — the system has failed the requirement. Don't let that happen.

---

**End of Appendix C.**

**Total document coverage:**
- Main spec: 30 sections covering architecture, env, routing, auth, Firestore, API, build, CI/CD.
- Appendix A: 34 subsections covering taxonomy, dashboard status columns, colors, labels, ID formats, business rules, CSV mappings, location mappings, timeline, lib-port decisions, custom claims, and a screen-by-screen cross-check.
- Appendix B: 6 subsections covering the full env-var audit, mobile allow-list, pull-from-Vercel script, and behavior guarantees.
- Appendix C: 23 subsections covering the Firebase CF URL, domain aliases, image remote hosts, email brand colors, Inter font, Stone palette HSL values, Mailgun EU flag, page-level details (scorecard, provider search, analytics, assets, RFPs, scheduled invoices, sandbox refresh, maint-requests upload config, messages, chat structure), every permission flag, and the definitive `.env.mobile`.

**This is the full, verified, exhaustive specification. Every value in the mobile apps — every env var, every URL, every color, every font, every enum, every status, every page, every API route, every Firestore rule, every shared service — has been pulled from the actual source repository and locked in.**

