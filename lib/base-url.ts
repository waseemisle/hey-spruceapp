/**
 * Single source of truth for the app's public base URL across server
 * routes (Stripe success/cancel URLs, email CTAs, links in
 * notifications, etc).
 *
 * The codebase had two competing env vars for this — NEXT_PUBLIC_APP_URL
 * and NEXT_PUBLIC_BASE_URL — used inconsistently across routes. That
 * means a deployment with one var set but not the other can:
 *   • land users on the wrong host after Stripe checkout, or
 *   • make Stripe Dashboard webhook URLs not match deployment, or
 *   • break email CTA links for some flows but not others.
 *
 * This helper resolves a single canonical URL. All future code should
 * use `getBaseUrl()` instead of reading either env var directly.
 *
 * Resolution order (highest priority wins):
 *   1. NEXT_PUBLIC_APP_URL  — explicit, what most newer routes prefer
 *   2. NEXT_PUBLIC_BASE_URL — explicit, what older routes prefer
 *   3. VERCEL_URL           — Vercel-set, no protocol — we add https://
 *   4. Hardcoded production URL — last-resort safety net
 *
 * Always returns a URL without a trailing slash.
 */
export function getBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'https://groundopscos.vercel.app';
}
