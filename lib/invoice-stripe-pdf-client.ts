/**
 * Client-side helper: download the official Stripe invoice PDF via our
 * server proxy (avoids CORS and works even when Firestore has no
 * `stripeInvoicePdf` URL cached yet).
 */
export async function tryDownloadStripeInvoicePdf(
  invoiceId: string,
  fileBaseName: string,
  getIdToken: () => Promise<string | null | undefined>,
): Promise<boolean> {
  let token: string | null | undefined;
  try {
    token = await getIdToken();
  } catch {
    token = null;
  }
  const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/download-stripe-pdf`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return false;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/pdf')) return false;
  const blob = await res.blob();
  if (blob.size < 64) return false;
  const url = URL.createObjectURL(blob);
  try {
    const safe = String(fileBaseName || 'invoice').replace(/[^\w.-]+/g, '_');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.pdf`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return true;
}
