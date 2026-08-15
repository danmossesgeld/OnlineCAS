import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as authSignOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, collection, getDocs, writeBatch, type Firestore } from 'firebase/firestore';
import { app } from '../firebase';
import type { UserRole } from '../stores/userProfile';

// Mirrors src/lib/utils/firebase.ts's config — needed here to spin up a throwaway secondary
// Firebase app instance (see createUserAccount below).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/**
 * Creates a brand-new Firebase Auth account + Firestore profile without disturbing the
 * currently-signed-in admin's own session. `createUserWithEmailAndPassword` on the *default*
 * app instance would sign the admin out and sign in as the newly created user instead (the
 * Firebase Auth client SDK holds exactly one active session per app instance) — so this runs
 * against a throwaway secondary app instance, which is torn down immediately after.
 *
 * There's no Firebase Admin SDK / backend here, so this is the only client-only way to create
 * a real login for someone else without hijacking your own session.
 */
export async function createUserAccount(params: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  createdByUid: string;
}): Promise<string> {
  const { email, password, displayName, role, createdByUid } = params;
  const secondaryApp = initializeApp(firebaseConfig, `admin-create-user-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = credential.user.uid;
    await authSignOut(secondaryAuth);

    const db = getFirestore(app);
    await setDoc(doc(db, 'users', newUid), {
      email,
      displayName: displayName || email.split('@')[0],
      role,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: createdByUid
    });

    return newUid;
  } finally {
    // Only tears down the throwaway app instance's in-memory session — the Auth account and
    // Firestore profile just created both persist normally.
    await deleteApp(secondaryApp);
  }
}

/**
 * Updates a user's role/active-status/display name. Cannot touch their Auth credential itself
 * (email/password) — only the Firebase Console or an Admin SDK can do that. Setting
 * isActive:false blocks them at the app's next auth-state check (src/routes/+layout.svelte)
 * and, once firestore.rules is deployed with the matching rule, at the data layer too — but
 * their Firebase Auth login itself still exists and isn't disabled or deleted.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<{ role: UserRole; isActive: boolean; displayName: string }>
): Promise<void> {
  const db = getFirestore(app);
  await updateDoc(doc(db, 'users', uid), { ...updates, updatedAt: new Date() });
}

/** Sends a normal Firebase Auth password-reset email — safe to call for any account, doesn't touch the caller's session. */
export async function sendUserPasswordReset(email: string): Promise<void> {
  const auth = getAuth(app);
  await sendPasswordResetEmail(auth, email);
}

export interface ResetSummary {
  label: string;
  deleted: number;
}

// Every collection Reset Transactions wipes. Deliberately excludes listdatabase/masterlist/*,
// listdatabase/otherlist/*, and users — those are the "except Chart of Accounts, Master List,
// Other List, and users" the feature is scoped to preserve. Segments are the full explicit
// path (see BLUEPRINT.md §2.2/§3 for why: 3+ segment paths are used literally, avoiding the
// ROOT_COLLECTION_MAP silent-fallback trap that a 2-segment shorthand could hit here).
const TRANSACTION_COLLECTIONS: Array<{ label: string; path: string }> = [
  { label: 'Sales Invoices', path: 'transactions/customerCenter/salesInvoices' },
  { label: 'Credit Memos', path: 'transactions/customerCenter/creditMemos' },
  { label: 'Receipts', path: 'transactions/customerCenter/receipts' },
  { label: 'APVs', path: 'transactions/vendorCenter/apvs' },
  { label: 'Vendor Payments', path: 'transactions/vendorCenter/payments' },
  { label: 'Receiving Reports', path: 'transactions/vendorCenter/receivingReports' },
  { label: 'Journal Entries', path: 'transactions/accounting/journalEntries' },
  { label: 'Fiscal Periods', path: 'transactions/accounting/fiscalPeriods' },
  { label: 'Inventory Adjustments', path: 'inventory/transactions/adjustments' }
];

const BATCH_LIMIT = 400; // stay comfortably under Firestore's 500-write-per-batch cap

async function deleteAllDocsInCollection(db: Firestore, path: string): Promise<number> {
  const colRef = collection(db, path);
  const snap = await getDocs(colRef);
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }

  return docs.length;
}

/**
 * Deletes every document in every transactional collection — irreversible. Chart of Accounts,
 * Customers/Vendors/Items/Others, every otherlist collection (including Cost Centers), and
 * `users` are never touched. Reports run purely off `transactions/accounting/journalEntries`
 * (see BLUEPRINT.md §5.4), so once this finishes every report reads as a clean, empty ledger.
 */
export async function resetAllTransactions(
  onProgress?: (result: ResetSummary) => void
): Promise<ResetSummary[]> {
  const db = getFirestore(app);
  const results: ResetSummary[] = [];
  for (const { label, path } of TRANSACTION_COLLECTIONS) {
    const deleted = await deleteAllDocsInCollection(db, path);
    const result = { label, deleted };
    results.push(result);
    onProgress?.(result);
  }
  return results;
}
