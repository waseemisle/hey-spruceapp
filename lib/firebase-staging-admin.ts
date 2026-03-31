/**
 * Sandbox Firestore helpers.
 *
 * Both production and staging share the same Firebase project.
 * Data isolation is achieved using Firestore's multi-database feature:
 *   - Production → '(default)' database
 *   - Sandbox     → 'sandbox'   database  (must be created in Firebase Console first)
 *
 * No separate Firebase project or credentials are needed.
 */
import { getSandboxAdminFirestore } from './firebase-admin';

export function getStagingFirestore() {
  return getSandboxAdminFirestore();
}

/** Always true — the sandbox database lives in the same Firebase project. */
export function isStagingConfigured(): boolean {
  return true;
}
