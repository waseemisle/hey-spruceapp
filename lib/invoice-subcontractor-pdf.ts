import { doc, getDoc, type Firestore } from 'firebase/firestore';

/**
 * Names for generated invoice PDFs: prefer invoice snapshot, then subcontractor profile.
 */
export async function resolveSubcontractorForInvoicePdf(
  db: Firestore,
  subcontractorId: string | undefined,
  invoiceSubcontractorName: string | undefined,
): Promise<{ vendorName?: string; vendorCompany?: string }> {
  let vendorName = String(invoiceSubcontractorName || '').trim();
  let vendorCompany = '';
  if (!subcontractorId) {
    return { vendorName: vendorName || undefined, vendorCompany: undefined };
  }
  try {
    const sd = await getDoc(doc(db, 'subcontractors', subcontractorId));
    if (!sd.exists()) {
      return { vendorName: vendorName || undefined, vendorCompany: undefined };
    }
    const d = sd.data() as { fullName?: string; businessName?: string; companyName?: string };
    if (!vendorName) {
      vendorName = String(d.fullName || d.businessName || '').trim();
    }
    vendorCompany = String(d.companyName || d.businessName || '').trim();
  } catch {
    /* non-fatal */
  }
  return {
    vendorName: vendorName || undefined,
    vendorCompany: vendorCompany || undefined,
  };
}
