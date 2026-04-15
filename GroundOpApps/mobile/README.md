# GroundOps Mobile

React Native (Expo) app — one codebase, two apps: **iOS** and **Android**. Mirrors the web portal at `/home/waseem/Desktop/hey-spruceapp` with 1:1 feature parity. Backend is 100% shared with the web: **same Firebase project (`groundopss`), same Firestore, same Auth, same Storage, same Cloudinary, same Stripe, same Mailgun, same SendBlue, same Twilio, same Supabase (backup mirror), same CRON_SECRET** (server-only).

Spec is in `../MOBILE_APP_BUILD_PROMPT.md`. Read it before changing anything architectural.

---

## Quickstart

```bash
cd /home/waseem/Desktop/hey-spruceapp/GroundOpApps/mobile

# 1. Install deps
npm install --legacy-peer-deps

# 2. Pull env from Vercel (requires vercel login + eas login first)
npm i -g vercel eas-cli
vercel link
eas login
../scripts/pull-vercel-env.sh      # syncs EXPO_PUBLIC_* → EAS secrets
cp .env.example .env               # fill in local dev values for `expo start`

# 3. Verbatim sync from web repo (types, problem taxonomy, invoice number, APPY, sub ids)
node ../scripts/sync-from-web.js

# 4. Run
npx expo start --dev-client        # requires a development build
# or quick sanity check:
npx expo start
```

---

## First-time EAS setup

```bash
eas init                                       # creates project id → paste into app.config.ts > extra.eas.projectId
eas build:configure                             # verifies eas.json
npx expo prebuild --clean                       # generates ios/ and android/
eas build --profile preview --platform ios     # TestFlight-style
eas build --profile preview --platform android # APK
```

Preview profile points at **sandbox** Firestore via `EXPO_PUBLIC_APP_ENV=staging`. Production profile writes to `(default)` Firestore. Both share the same Firebase project.

---

## What's in this repo

### Runnable today
- ✅ Role-aware auth + session persistence (AsyncStorage)
- ✅ Role gate that routes admin / client / subcontractor into their own tab groups
- ✅ Complete design system (NativeWind + Stone palette, Inter font, shadcn-style primitives)
- ✅ Reference screens wired to live Firestore:
  - Login, register (client + subcontractor), forgot password
  - **Client:** dashboard, work orders list + create (with camera + Cloudinary upload), detail, quote accept/reject (rules-compliant diff), invoice list + detail (Stripe link payment), messages (realtime chat), support ticket list + detail
  - **Subcontractor:** dashboard, bidding + quote submission (with required proposedServiceDate/Time), assigned jobs (accept/reject + completion with photos), completed jobs (read-only vendor-payment summary, no internal notes)
  - **Admin:** ServiceChannel-style 3-section dashboard, work orders list + detail (approve/reject + quote/invoice/timeline tabs), invoices list + detail (send/charge), messages, support tickets, notifications
  - Notifications bell (realtime), Impersonation banner, Offline banner
- ✅ Shared backend — hitting the same `/api/*` routes the web uses
- ✅ CI pipeline (`GroundOpApps/.github/workflows/mobile-build-on-web-change.yml`) that auto-OTAs JS changes and auto-builds+submits native changes
- ✅ Hardened `pull-vercel-env.sh` (allow-list only; server secrets can't slip in)

### Stubbed (scaffolded — ready to implement)
Every remaining screen has a `<StubScreen>` placeholder pointing at the web equivalent + the exact section of `MOBILE_APP_BUILD_PROMPT.md` to follow. Grep for `StubScreen` to find them — 47 total covering recurring WOs, CSV import, analytics, reports, scorecard, provider search, assets, RFPs, location/client/subcontractor management, etc. They follow identical patterns to the reference screens.

---

## Architecture checklist (verified)

- Firebase project: **groundopss** (same as web)
- Firestore DB: `(default)` in prod, `sandbox` in staging
- Auth: Firebase JS SDK, AsyncStorage persistence, role-detection order matches web verbatim
- Role-gated routing via `expo-router` route groups
- API base: `${EXPO_PUBLIC_APP_URL}` with `Authorization: Bearer <idToken>` retry-on-401
- Firestore rules identical to web — no mobile-specific bypass
- Cloudinary: unsigned upload with `cloud_name=duo4kzgx4`, `preset=WebAppUpload`
- Stripe: `@stripe/stripe-react-native` + web `/api/stripe/*` routes
- Cron (Vercel) unchanged; mobile never sees `CRON_SECRET`
- Supabase backup mirror continues nightly at 23:55

---

## Testing accounts

You should have web demo accounts already (admin / client / subcontractor).
Sign in with the same email+password on the mobile app — same UID, same data.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Firebase index required" at runtime | Drop the `where` + `orderBy` combo, filter client-side (see web workaround in project memory) |
| Auth session lost on reload | Ensure `getReactNativePersistence(AsyncStorage)` wire-up — see `lib/firebase.ts` |
| Stripe sheet not opening | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` not set in EAS secrets |
| Maint request upload fails with 413 | Route through Firebase CF (`EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL`), NOT Vercel |
| Permission-denied writing quote (client) | You wrote a field outside the allow-list: `status, acceptedAt, rejectedAt, rejectionReason, timeline, systemInformation, updatedAt` |
| Permission-denied writing WO (subcontractor) | Outside allow-list: `status, scheduledServiceDate/Time/TimeEnd, completedAt, completionDetails, completionNotes, completionImages, timeline, updatedAt` + status must be in `accepted_by_subcontractor|rejected_by_subcontractor|pending_invoice|completed` |

---

## What NOT to add

- Don't create a parallel Firebase project "just for mobile."
- Don't bundle any of: `STRIPE_SECRET_KEY`, `MAILGUN_API_KEY`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDINARY_API_SECRET`, `SENDBLUE_*`, `TWILIO_*`, `FIREBASE_SYNC_*`, `FIREBASE_PRIVATE_KEY`, or any service-account JSON.
- Don't invent new enum values for statuses/priorities/categories/timeline types.
- Don't weaken Firestore rules for mobile.
- Don't port `lib/firebase-admin.ts`, `lib/firebase-server.ts`, `lib/email.ts`, `lib/email-logger.ts`, `lib/sendblue.ts`, `lib/twilio.ts`, `lib/supabase-admin.ts`, `lib/api-verify-firebase.ts`, `lib/auto-charge-email.ts`, `lib/firebase-staging-admin.ts` — all server-only.

---

## License
Private. © GroundOps.
