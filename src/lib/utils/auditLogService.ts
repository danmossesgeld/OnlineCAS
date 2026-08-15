import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit as fbLimit, serverTimestamp } from 'firebase/firestore';
import { get } from 'svelte/store';
import { app } from './firebase';
import { userProfile } from '../stores/userProfile';

/**
 * The one append-only record of who created/edited/deleted what and when — the BIR CAS
 * "non-resettable, cumulative audit trail" requirement (BLUEPRINT.md §8.3), previously absent
 * from the entire codebase. Written from firestoreCrud.ts's three primitives (the choke point
 * nearly every create/update/delete already flows through) plus a handful of bypass sites that
 * call Firestore directly. `firestore.rules` makes this collection create-only — not even an
 * admin can update or delete an entry once written.
 */
export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditLogEntry {
  id?: string;
  action: AuditAction;
  collectionPath: string;
  docId: string;
  data?: Record<string, unknown>; // full pre-delete snapshot — only set for action:'delete'
  performedByUid: string;
  performedByEmail: string;
  performedByDisplayName: string;
  performedAt: unknown;
}

/**
 * Fire this after the real write has already succeeded — a logging failure must never roll back
 * or block the operation it's describing. Errors are caught and logged, not rethrown.
 */
export async function writeAuditLog(entry: {
  action: AuditAction;
  collectionPath: string;
  docId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getFirestore(app);
    const actor = get(userProfile);
    await addDoc(collection(db, 'auditLogs'), {
      action: entry.action,
      collectionPath: entry.collectionPath,
      docId: entry.docId,
      ...(entry.data !== undefined ? { data: entry.data } : {}),
      performedByUid: actor?.uid || '',
      performedByEmail: actor?.email || '',
      performedByDisplayName: actor?.displayName || '',
      performedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to write audit log entry (the underlying operation still succeeded):', error);
  }
}

export async function getAuditLogs(maxResults = 500): Promise<AuditLogEntry[]> {
  const db = getFirestore(app);
  const q = query(collection(db, 'auditLogs'), orderBy('performedAt', 'desc'), fbLimit(maxResults));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) }));
}
