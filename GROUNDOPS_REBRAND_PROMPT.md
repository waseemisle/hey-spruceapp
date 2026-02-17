# GroundOps Rebrand — Prompt for Claude

Use this prompt when working on the HeySpruce app codebase. It describes what the app is, the rebrand to GroundOps, and the required UI/theme changes.

---

## What This App Is

This is a **facility maintenance and work order management platform** (formerly “Hey Spruce”). It is a Next.js 14 (App Router) application with Firebase (Auth, Firestore, Storage), TypeScript, Tailwind CSS, and shadcn/ui.

### Core purpose
- **Clients**: Request and manage facility maintenance (locations, work orders, quotes, invoices, recurring work orders, maintenance requests).
- **Admins**: Approve clients/subcontractors/locations, manage work orders, quotes, invoices, scheduled invoices, recurring work orders, maintenance requests, companies, and messaging.
- **Subcontractors**: See bidding opportunities, submit quotes, view assigned jobs, mark work complete.

### Main areas of the codebase
- **Portals**: `/admin-portal`, `/client-portal`, `/subcontractor-portal`
- **Auth**: `/portal-login`, `/register-client`, `/register-subcontractor`, `/forgot-password`, `/set-password`, `/reset-password`
- **Public**: `/` (landing with portal cards)
- **API**: `/app/api/` — email (invites, quotes, invoices, review requests, approvals, scheduled service, etc.), Stripe, recurring work orders, maintenance requests, auth, etc.
- **Layouts**: `components/admin-layout.tsx`, `components/client-layout.tsx`, `components/subcontractor-layout.tsx` (each with sidebar, logo, notifications, theme toggle)
- **Branding**: `components/ui/logo.tsx`, `lib/logo-base64.ts`, `lib/pdf-generator.ts`, and all email templates in `app/api/email/`

### Tech stack (relevant to rebrand)
- Next.js 14, React 18, TypeScript, Tailwind, next-themes (light/dark), Radix/shadcn, Firebase, Stripe, Resend (email), jsPDF for invoices.

---

## Rebrand: HeySpruce → GroundOps

**HeySpruce is being renamed to GroundOps.** All user-facing and internal references should use GroundOps (and groundops.co) instead of HeySpruce/heyspruce.

### References to update everywhere
- **Brand name**: “Hey Spruce” / “HeySpruce” / “heyspruce” → **GroundOps** / **GroundOps** / **groundops** (as appropriate; e.g. “GroundOps” in UI and copy, “groundops” in URLs/domains).
- **Website**: Use **https://www.groundops.co** (and specifically **https://www.groundops.co/deck.html** as the design reference).
- **Logo**: Use **https://www.groundops.co/deck/logo.png** for the app logo (replace any Hey Spruce logo URL in the app and in emails).
- **Contact**: Replace heyspruce.com / info@heyspruce.com with groundops.co / info@groundops.com (or whatever contact details are on the GroundOps site) in:
  - UI footers and contact sections
  - All email templates under `app/api/email/`
  - PDF invoices in `lib/pdf-generator.ts`
  - Any scripts or config that reference heyspruce (e.g. test email scripts, next.config.js base URL if you change production URL to groundops).

Apply this consistently in:
- `app/layout.tsx` (metadata title/description)
- `components/ui/logo.tsx` (logo URL and alt text)
- `lib/logo-base64.ts` and `lib/pdf-generator.ts` (PDF branding and contact info)
- Every file under `app/api/email/` (subject lines, body copy, footer links, logo img src)
- `app/admin-portal/invoices/page.tsx` (e.g. “HeySpruce branding” → “GroundOps branding”)
- `scripts/test-all-email-flows.js` and any other scripts that mention HeySpruce/heyspruce
- README, ALL_REQUIREMENTS.md, newreq.md, and other docs (so the codebase is coherent for future work)

---

## Theme and Font: Match GroundOps Deck

**Remove dark theme entirely.** The app should be **light-only**, and the **theme and font should match the GroundOps deck page**: **https://www.groundops.co/deck.html**.

### What to do

1. **Remove dark theme**
   - Remove the theme toggle from all layouts (admin, client, subcontractor). Delete or stop rendering `ThemeToggle` in:
     - `components/admin-layout.tsx`
     - `components/client-layout.tsx`
     - `components/subcontractor-layout.tsx`
   - In `app/layout.tsx`: use a light-only setup (e.g. force `defaultTheme="light"` and consider removing `enableSystem` so the UI never switches to dark; or remove next-themes and use a single light theme).
   - In `app/globals.css`: remove the `.dark { ... }` block (or leave it unused) so only light CSS variables apply.
   - In `tailwind.config.ts`: you can leave `darkMode: ["class"]` for now or remove it; no class should toggle dark anymore.
   - Remove or simplify `components/theme-toggle.tsx` and `components/theme-provider.tsx` as needed (e.g. no switching, just light).
   - Search the repo for `dark:` Tailwind classes (e.g. in `app/admin-portal/locations/page.tsx` and elsewhere) and remove them so styling is light-only.

2. **Match GroundOps deck look and feel**
   - **Font**: The deck page uses a clean, modern sans-serif. Inspect https://www.groundops.co/deck.html and use the **same font family** (and similar weights) in the app. If the deck uses a custom font (e.g. from Google Fonts or a custom asset), add that font in `app/globals.css` and in `tailwind.config.ts` (e.g. `fontFamily.sans`) so the whole app matches.
   - **Colors and spacing**: Use the deck page as the visual reference for:
     - Background and card colors
     - Primary/accent colors (buttons, links, headers)
     - Text color and hierarchy
     - Border radius and spacing where relevant
   - Update `app/globals.css` (and Tailwind theme if needed) so that `:root` variables align with the deck’s light theme (no dark variables needed).
   - Landing page (`app/page.tsx`): Replace the current purple/violet gradient and card styling with a look that matches the GroundOps deck (hero, typography, CTA style, and overall “Facility Maintenance Infrastructure” feel).

3. **Logo**
   - Use **https://www.groundops.co/deck/logo.png** everywhere the app or emails show the product logo (including PDFs and email HTML). Update `components/ui/logo.tsx` and any email templates / PDF generator that embed a logo.

---

## Summary Checklist for Claude

- [ ] Replace all HeySpruce/heyspruce references with GroundOps/groundops (brand name, domain, contact, copy).
- [ ] Set app logo URL to **https://www.groundops.co/deck/logo.png** (and update PDF/email logos accordingly).
- [ ] Remove dark theme: no theme toggle, light-only layout and CSS, remove `dark:` classes.
- [ ] Match theme and font to **https://www.groundops.co/deck.html** (font family, colors, overall look).
- [ ] Update landing page to align with GroundOps deck style and messaging.
- [ ] Update docs (README, requirements, etc.) to describe the app as GroundOps and reference groundops.co.

Use **https://www.groundops.co/deck.html** as the single source of truth for branding, theme, and font when making these changes.
