/**
 * Firestore rules for bidding/assigned jobs compare subcontractorId to request.auth.uid.
 * Subcontractor profile docs may use auth uid as doc id or store uid on the document — use the value subs actually sign in with.
 */
export function subcontractorAuthId(sub: { id: string; uid?: string | null }): string {
  const u = sub.uid != null && String(sub.uid).trim() !== '' ? String(sub.uid).trim() : '';
  return u || sub.id;
}
