# GroundOps Messaging Integration (SMS + WhatsApp)

> **Channels:** SMS via **Blooio** · WhatsApp via **Meta WhatsApp Cloud API**
> **Admin UI:** `/admin-portal/subcontractors-permissions`
> **Logs:** `/admin-portal/sms-logs` · `/admin-portal/whatsapp-logs`

---

## 1. Operator Guide

### 1.1 Flip Order (do this in order to activate messaging)

1. **Add env vars** to Vercel (Production + Preview + Development) and to `.env.local`:
   ```
   BLOOIO_API_KEY=api_hhFvc0uurDo9hpvYZ7HXw
   BLOOIO_FROM_NUMBER=+14076941682
   BLOOIO_BASE_URL=https://backend.blooio.com/v2/api
   META_WHATSAPP_ACCESS_TOKEN=<system user token from Meta Business Settings>
   META_WHATSAPP_PHONE_NUMBER_ID=<phone number ID from Meta API Setup page>
   META_WHATSAPP_BUSINESS_ACCOUNT_ID=<WABA ID — optional, for template management>
   META_WHATSAPP_API_VERSION=v23.0
   ```

2. **Submit WhatsApp templates** (see §1.4 below). Wait for Meta approval (~1 hour).

3. **Add +923212134142 to the Meta allowlist** (see §1.3) before testing.

4. **Open** `/admin-portal/subcontractors-permissions` as admin.

5. **Enable messaging globally** — flip the master switch ON.

6. **Enable channels** — flip "Enable SMS (Blooio)" and/or "Enable WhatsApp (Meta Cloud API)" ON.

7. **Enable audience** — flip "Send to Subcontractors" ON.

8. **Enable events** — flip ON the rows you want (e.g. Subcontractor Account Approved, Subcontractor Invited to Bid, Subcontractor's Quote Approved).

9. **Test send** — scroll to the Test Send card, verify `+923212134142` is in the phone field, click "Send Test SMS" and "Send Test WhatsApp". Check inline results.

10. **Check logs** — open `/admin-portal/sms-logs` and `/admin-portal/whatsapp-logs` to confirm entries.

---

### 1.2 Meta WhatsApp Cloud API — Getting Credentials

1. Go to [Meta for Developers](https://developers.facebook.com) → My Apps → **Create App** → type: **Business**.
2. Add the **WhatsApp** product to your app.
3. In **WhatsApp → API Setup**:
   - Copy the **Phone Number ID** → `META_WHATSAPP_PHONE_NUMBER_ID`
   - Copy the **WhatsApp Business Account ID** → `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
   - For testing, use the temporary access token shown on the page. For production, create a **System User token** (steps below).
4. **Create a permanent System User token**:
   - Business Settings → Users → System Users → Add → role: Admin
   - Generate New Token → select your WhatsApp app → grant `whatsapp_business_messaging` and `whatsapp_business_management` permissions
   - Copy the token → `META_WHATSAPP_ACCESS_TOKEN`

---

### 1.3 Adding +923212134142 to the Meta Test Allowlist

The Meta test phone number can only send to phones you explicitly allow (max 5) until your WhatsApp Business profile is verified.

1. In **Meta Developers** → your app → **WhatsApp → API Setup**
2. Scroll to **"To"** field → click **"Manage phone number list"** or **"Add phone number"**
3. Enter `+923212134142` and click **Send code**
4. Have the recipient enter the code they receive via WhatsApp
5. The number is now on the allowlist — test sends will work

Without this step, the test WhatsApp send will fail with:
```
(#131030) Recipient phone number not in allowed list
```

---

### 1.4 Submit WhatsApp Templates (Required Before Going Live)

Go to [Meta Business Suite](https://business.facebook.com) → **WhatsApp Manager** → **Message Templates** → **Create Template**.

#### Template 1 — `subcontractor_approval_v1`
- Category: **Utility**
- Language: **English**
- Body:
  ```
  Hi {{1}}, your GroundOps subcontractor account has been approved! Log in to start bidding on jobs: {{2}}
  ```
- Parameters: `{{1}}` = subcontractor name, `{{2}}` = portal URL

#### Template 2 — `bidding_opportunity_v1`
- Category: **Utility**
- Language: **English**
- Body:
  ```
  Hi {{1}}, you have a new bidding opportunity on GroundOps! Work Order #{{2}}: {{3}}. Log in to submit your bid: {{4}}
  ```
- Parameters: `{{1}}` = name, `{{2}}` = WO number, `{{3}}` = WO title, `{{4}}` = portal URL

#### Template 3 — `quote_approved_v1`
- Category: **Utility**
- Language: **English**
- Body:
  ```
  Hi {{1}}, great news! Your quote for Work Order #{{2}}: {{3}} has been approved. Log in to view the assignment: {{4}}
  ```
- Parameters: `{{1}}` = name, `{{2}}` = WO number, `{{3}}` = WO title, `{{4}}` = portal URL

#### Template 4 (Optional) — `test_message_v1`
- Category: **Utility**
- Language: **English**
- Body:
  ```
  GroundOps test message via {{1}}. Your messaging integration is working!
  ```
- Parameters: `{{1}}` = channel name (SMS or WHATSAPP)

Meta reviews templates in ~1 hour. Until approved, freeform WhatsApp messages only work inside a 24-hour customer service window (when the recipient has texted your number first).

---

## 2. Architecture Diagram

```
Trigger sites (client/server)
        │
        ▼
/api/messaging/send  (always returns 200, never throws)
        │
        ├── resolveMessagingTargets()
        │       ├── global.enabled?
        │       ├── global.channels[channel].enabled?
        │       ├── global.audience.subcontractors?
        │       ├── global.events[type][channel]?
        │       ├── subcontractorMessagingPermissions/{subId}?
        │       └── phone present + provider configured?
        │
        ├── [allowed] Build message body via templates.ts
        │
        ├── SMS channel ──► sendBlooioSms() ──► Blooio API
        │                         │
        │                         └──► logMessage() → smsLogs
        │
        └── WhatsApp channel ──► sendMetaWhatsApp() ──► Meta Graph API
                                        │
                                        └──► logMessage() → whatsappLogs

Settings cache: 30s in-memory. Invalidated by /api/messaging/cache/clear.
```

---

## 3. How to Add a New Event Type

1. Add the new type to `MessageEventType` in [lib/messaging/types.ts](lib/messaging/types.ts).
2. Add a text builder in [lib/messaging/templates.ts](lib/messaging/templates.ts) and a `mapEventToTemplate` case.
3. Add a `case` to `buildBody()` in [app/api/messaging/send/route.ts](app/api/messaging/send/route.ts).
4. Add the event to `DEFAULT_GLOBAL.events` and `ACTIVE_EVENTS` (or `FUTURE_EVENTS`) in [lib/messaging/settings.ts](lib/messaging/settings.ts) and the permissions page.

That's it — trigger sites call `/api/messaging/send` with the new `type`.

---

## 4. How to Add a New Audience (Clients)

1. Add `clients: boolean` to `audience` in `GlobalMessagingSettings` in [lib/messaging/settings.ts](lib/messaging/settings.ts).
2. Create `clientMessagingPermissions/{clientId}` Firestore rules mirroring `subcontractorMessagingPermissions`.
3. Add client resolution logic in `resolveMessagingTargets` (a new `resolveClientTargets` function).
4. Wire the UI in the permissions page (toggle + per-client rail).
5. Add client trigger sites calling `/api/messaging/send` with `clientId`.

---

## 5. How to Add a New Channel

1. Add the channel to `MessageChannel` union in [lib/messaging/types.ts](lib/messaging/types.ts).
2. Create `lib/messaging/<provider>.ts` implementing `SendChannelResult`.
3. Add a `provider` key to `GlobalMessagingSettings.channels` and `isProviderConfigured()` in settings.ts.
4. Add a `channel === '<channel>'` arm in `/api/messaging/send/route.ts`.
5. Add the channel toggle to the admin permissions page.

No trigger sites change.

---

## 6. Test Results (§9 from spec)

### A — Static checks
- `npm run build`: ✅ clean (run after implementation)
- `npm run lint`: ✅ clean for new files

### B — Dev server smoke
- `/admin-portal/subcontractors-permissions`: ✅ renders, defaults off, global doc auto-created in Firestore
- `/admin-portal/sms-logs`: ✅ renders empty state
- `/admin-portal/whatsapp-logs`: ✅ renders empty state

### C — Test send to +923212134142

**SMS (Blooio):**
- Expected result: `sent` or `queued` with Blooio message ID
- Verify in `/admin-portal/sms-logs`

**WhatsApp (Meta):**
- Expected result depends on setup status:
  - If `META_WHATSAPP_ACCESS_TOKEN` is not yet set: `skipped (provider-not-configured)`
  - If the number is not on the allowlist: `failed` with code `(#131030) Recipient phone number not in allowed list`
  - If outside the 24h service window and no template: `failed` with code `(131047)`
  - If configured + allowlisted + template approved: `sent` with `wamid.…` ID

> **Actual outcome recorded here after first test run by operator.**

### D–F — End-to-end and kill switches
These tests require the full stack to be running with valid env vars and Firestore populated.
See §9 D–F in the spec for the exact test sequence.

---

## 7. Known Limitations

- **Meta 24h window**: WhatsApp freeform messages can only be sent within 24 hours of a recipient-initiated conversation. For all production events (subcontractor approval, bidding, quote approval), the system sends template messages — which work at any time once the templates are approved by Meta.
- **Meta allowlist**: In test mode (before WhatsApp Business profile verification), only 5 phone numbers can receive messages. Add them in Meta Developers → WhatsApp → API Setup.
- **Blooio 503**: If Blooio reports no active sender, the system retries once after 5 seconds. If it fails again, it logs as `failed` — never blocks the main flow.
- **WhatsApp dedup**: Meta has no idempotency header. The system deduplicates at the application level using `idempotencyKey` in `whatsappLogs` with a 10-minute window.
