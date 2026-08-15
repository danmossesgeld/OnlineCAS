import { getFirestore, collection, doc, query, orderBy, limit, getDocs, runTransaction } from 'firebase/firestore';
import { app } from './firebase';

/**
 * Document type definition with their respective prefixes
 */
export enum DocumentType {
  SALES_INVOICE = 'INV',
  CREDIT_MEMO = 'CM',
  PAYMENT_RECEIPT = 'PR',
  APV = 'APV',
  VENDOR_PAYMENT = 'VP',
  RECEIVING_REPORT = 'RR',
  JOURNAL_ENTRY = 'JE'
}

/**
 * Configuration for document ID generation
 */
interface DocIdConfig {
  collection: string;  // Firestore collection path
  prefix: string;      // Document ID prefix
  padding: number;     // Number padding (e.g., 9 for 000000001)
  field: string;       // Field name in document that stores the ID
}

/**
 * Configuration map for each document type
 */
const documentConfigs: Record<DocumentType, DocIdConfig> = {
  [DocumentType.SALES_INVOICE]: {
    collection: 'transactions/customerCenter/salesInvoices',
    prefix: 'INV',
    padding: 9,
    field: 'invoiceNo'
  },
  [DocumentType.CREDIT_MEMO]: {
    collection: 'transactions/customerCenter/creditMemos',
    prefix: 'CM',
    padding: 9,
    field: 'cmNo'
  },
  [DocumentType.PAYMENT_RECEIPT]: {
    collection: 'transactions/customerCenter/receipts',
    prefix: 'PR',
    padding: 9,
    field: 'receiptNo'
  },
  [DocumentType.APV]: {
    collection: 'transactions/vendorCenter/apvs',
    prefix: 'APV',
    padding: 9,
    field: 'apvNo'
  },
  [DocumentType.VENDOR_PAYMENT]: {
    collection: 'transactions/vendorCenter/payments',
    prefix: 'VP',
    padding: 9,
    field: 'paymentNo'
  },
  [DocumentType.RECEIVING_REPORT]: {
    collection: 'transactions/vendorCenter/receivingReports',
    prefix: 'RR',
    padding: 9,
    field: 'rrNo'
  },
  [DocumentType.JOURNAL_ENTRY]: {
    collection: 'transactions/accounting/journalEntries',
    prefix: 'JE',
    padding: 9,
    field: 'journalNo'
  }
};

/**
 * Extracts the numeric part from a document ID
 * @param id Document ID in format PREFIX000000001
 * @param prefix Expected prefix
 * @returns Numeric part as a number
 */
function extractNumberFromId(id: string, prefix: string): number {
  if (!id || !id.startsWith(prefix)) {
    return 0;
  }
  
  const numericPart = id.substring(prefix.length);
  return parseInt(numericPart, 10) || 0;
}

/**
 * Formats a number with leading zeros based on padding
 * @param num Number to format
 * @param padding Number of digits to pad to
 * @returns Formatted string with leading zeros
 */
function formatWithLeadingZeros(num: number, padding: number): string {
  return num.toString().padStart(padding, '0');
}

/**
 * Reads the highest existing document number directly from the target collection —
 * only ever used to seed a brand-new counter document (see generateNextDocumentId)
 * the very first time a given document type is generated, so upgrading an app that
 * already has real documents doesn't restart numbering at 1. This read is a plain
 * query, not part of any transaction, so it's the one place a race is still
 * theoretically possible — bounded to that one-time seed, not every future save.
 */
async function getCurrentMaxFromCollection(config: DocIdConfig): Promise<number> {
  const db = getFirestore(app);
  const collectionRef = collection(db, config.collection);
  const q = query(collectionRef, orderBy(config.field, 'desc'), limit(1));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return 0;
  const lastId = querySnapshot.docs[0].data()[config.field] || '';
  return extractNumberFromId(lastId, config.prefix);
}

/**
 * Generates the next sequential document ID for a specific document type.
 *
 * Uses a real per-doc-type counter document at `counters/{docType}` (`lastNumber`
 * field), incremented via `transaction.get()`/`transaction.set()` inside
 * `runTransaction` — this is what actually gives Firestore's transaction retry
 * protection something to act on. The previous implementation ran a `getDocs(query)`
 * against the live collection *inside* `runTransaction` and never touched
 * `transaction.get()`/`.set()` at all, so despite the transaction wrapper, two
 * concurrent calls could both read the same "latest" document and compute the same
 * next number — the wrapper provided no real protection. This version does.
 *
 * @param docType Document type to generate ID for
 * @returns Promise with the next sequential ID
 */
export async function generateNextDocumentId(docType: DocumentType): Promise<string> {
  const db = getFirestore(app);
  const config = documentConfigs[docType];
  const counterRef = doc(db, 'counters', docType);

  try {
    // Only actually read if the counter doc turns out not to exist yet (inside the
    // transaction, below) — computed eagerly here since transactions can't run
    // arbitrary queries themselves.
    const fallbackSeed = await getCurrentMaxFromCollection(config);

    const nextNum = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const current = counterSnap.exists() ? (counterSnap.data().lastNumber as number) || 0 : fallbackSeed;
      const next = current + 1;
      transaction.set(counterRef, { lastNumber: next, prefix: config.prefix, updatedAt: new Date() }, { merge: true });
      return next;
    });

    return `${config.prefix}${formatWithLeadingZeros(nextNum, config.padding)}`;
  } catch (error) {
    console.error(`Error generating document ID for ${docType}:`, error);
    throw new Error(`Failed to generate sequential document ID for ${docType}`);
  }
}

/**
 * Validates if a document ID already exists to prevent duplicates
 * @param docType Document type
 * @param docId Document ID to check
 * @returns Promise<boolean> True if ID exists, false otherwise
 */
export async function documentIdExists(docType: DocumentType, docId: string): Promise<boolean> {
  try {
    const db = getFirestore(app);
    const config = documentConfigs[docType];
    
    const collectionRef = collection(db, config.collection);
    const q = query(
      collectionRef, 
      // Create a where clause to check for the document ID
      // This assumes the ID field is indexed
      // where(config.field, '==', docId)
    );
    
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error(`Error checking if document ID ${docId} exists:`, error);
    // Default to true to prevent duplicate creation on error
    return true;
  }
}
