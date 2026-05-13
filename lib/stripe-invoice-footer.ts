import { doc, getDoc, type Firestore } from 'firebase/firestore';

/** Stripe invoice footer max length (stay under Stripe limits). */
const MAX_FOOTER = 4500;

/**
 * Footer on Stripe-hosted invoices / PDFs: invoice number + optional
 * service provider (subcontractor name + company from profile).
 */
export async function buildStripeHostedInvoiceFooter(
  db: Firestore,
  inv: Record<string, unknown>,
  invoiceNumber: string,
): Promise<string> {
  const base = `Invoice ${invoiceNumber}`.trim();
  let name = String(inv.subcontractorName || '').trim();
  let company = '';
  const sid = inv.subcontractorId as string | undefined;
  if (sid) {
    try {
      const sd = await getDoc(doc(db, 'subcontractors', sid));
      if (sd.exists()) {
        const d = sd.data() as { fullName?: string; businessName?: string; companyName?: string };
        if (!name) {
          name = String(d.fullName || d.businessName || '').trim();
        }
        company = String(d.companyName || d.businessName || '').trim();
      }
    } catch {
      /* non-fatal */
    }
  }
  if (!name && !company) {
    return base.slice(0, MAX_FOOTER);
  }
  const prov = name && company ? `${name} — ${company}` : name || company;
  return `${base}\nService provider: ${prov}`.slice(0, MAX_FOOTER);
}
