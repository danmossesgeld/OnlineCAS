import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc, getDoc, getDocs, query, where, type CollectionReference, type DocumentReference, type WhereFilterOp } from 'firebase/firestore';
import { app } from './firebase';
import { writeAuditLog } from './auditLogService';

// Root collection mapping for different data categories
const ROOT_COLLECTION_MAP: Record<string, string> = {
  'masterlist': 'listdatabase',
  'otherlist': 'listdatabase',
  'customerCenter': 'transactions',
  'vendorCenter': 'transactions',
  'accounting': 'transactions'
};

/**
 * Determines the appropriate root collection based on the parent collection name.
 * @param parentCollection - The parent collection name
 * @returns The root collection name
 */
function getRootCollection(parentCollection: string): string {
  return ROOT_COLLECTION_MAP[parentCollection] || 'listdatabase';
}

/**
 * Add a document to a Firestore collection
 * @param collectionPath - The path to the collection or root collection name
 * @param dataOrSubCollection - Either data to add or subcollection name
 * @param optionalDataOrDocId - Either data to add or document ID for nested collections
 * @param fourthParam - Data when using root/parent/subcollection format
 * @returns Promise with the document reference
 */
export async function addDocToCollection(collectionPath: string, dataOrSubCollection: any, optionalDataOrDocId?: any, fourthParam?: any) {
  const db = getFirestore(app);

  // Case 1: Three-level format (root, parent, subcollection, data)
  if (fourthParam !== undefined) {
    const rootCollection = collectionPath;
    const parentCollection = dataOrSubCollection;
    const subCollectionName = optionalDataOrDocId;
    const data = fourthParam;

    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const ref = await addDoc(subColRef, data);
    await writeAuditLog({ action: 'create', collectionPath: subColRef.path, docId: ref.id });
    return ref;
  }

  // Case 2: Two-level format (parent, subcollection, data)
  if (optionalDataOrDocId !== undefined) {
    const parentCollection = collectionPath;
    const subCollectionName = dataOrSubCollection;
    const data = optionalDataOrDocId;

    const rootCollection = getRootCollection(parentCollection);
    const collectionRef = collection(db, rootCollection);
    const docRef = doc(collectionRef, parentCollection);
    const subCollectionRef = collection(docRef, subCollectionName);
    const ref = await addDoc(subCollectionRef, data);
    await writeAuditLog({ action: 'create', collectionPath: subCollectionRef.path, docId: ref.id });
    return ref;
  }

  // Case 3: Path string format (full path, data)
  const data = dataOrSubCollection;
  const segments = collectionPath.split('/');

  if (segments.length === 2) {
    // Handle 'parentCollection/subCollection' format
    const [parentCollection, subCollectionName] = segments;
    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const ref = await addDoc(subColRef, data);
    await writeAuditLog({ action: 'create', collectionPath: subColRef.path, docId: ref.id });
    return ref;
  }

  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const ref = await addDoc(subColRef, data);
    await writeAuditLog({ action: 'create', collectionPath: subColRef.path, docId: ref.id });
    return ref;
  }

  // Default: Simple collection
  const colRef = collection(db, collectionPath);
  const ref = await addDoc(colRef, data);
  await writeAuditLog({ action: 'create', collectionPath: colRef.path, docId: ref.id });
  return ref;
}

/**
 * Update a document in a Firestore collection
 * @param collectionPath - The collection path or root collection name
 * @param idOrSubCollection - Either document ID or subcollection name
 * @param dataOrId - Either data to update or document ID for nested collections
 * @param optionalData - Data to update when using parent/subcollection format
 * @returns Promise with the update result
 */
export async function updateDocInCollection(collectionPath: string, idOrSubCollection: string, dataOrId: any, optionalData?: any) {
  const db = getFirestore(app);

  // Case 1: Three-level format (parent, subcollection, id, data)
  if (optionalData !== undefined) {
    const parentCollection = collectionPath;
    const subCollectionName = idOrSubCollection;
    const id = dataOrId;
    const data = optionalData;

    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const result = await setDoc(docRef, data, { merge: true });
    await writeAuditLog({ action: 'update', collectionPath: subColRef.path, docId: id });
    return result;
  }

  // Case 2: Path string format with ID and data
  const id = idOrSubCollection;
  const data = dataOrId;
  const segments = collectionPath.split('/');

  if (segments.length === 2) {
    // Handle 'parentCollection/subCollection' format
    const [parentCollection, subCollectionName] = segments;
    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const result = await setDoc(docRef, data, { merge: true });
    await writeAuditLog({ action: 'update', collectionPath: subColRef.path, docId: id });
    return result;
  }

  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const result = await setDoc(docRef, data, { merge: true });
    await writeAuditLog({ action: 'update', collectionPath: subColRef.path, docId: id });
    return result;
  }

  // Default: Simple collection with document ID
  const docRef = doc(db, collectionPath, id);
  const result = await setDoc(docRef, data, { merge: true });
  await writeAuditLog({ action: 'update', collectionPath, docId: id });
  return result;
}

/**
 * Delete a document from a Firestore collection. Captures a full snapshot of the document
 * before deleting it and attaches that snapshot to the audit log entry — the record itself is
 * still gone from the live collection, but nothing is truly lost from the (immutable,
 * create-only) audit trail. See BLUEPRINT.md §8.3/auditLogService.ts.
 * @param collectionPath - The collection path or root collection name
 * @param idOrSubCollection - Either document ID or subcollection name
 * @param optionalId - Document ID when using parent/subcollection format
 * @returns Promise with the delete result
 */
export async function deleteDocFromCollection(collectionPath: string, idOrSubCollection: string, optionalId?: string) {
  const db = getFirestore(app);

  async function deleteAndLog(docRef: DocumentReference) {
    const snap = await getDoc(docRef);
    const result = await deleteDoc(docRef);
    await writeAuditLog({
      action: 'delete',
      collectionPath: docRef.parent.path,
      docId: docRef.id,
      data: snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
    });
    return result;
  }

  // Case 1: Three-level format (parent, subcollection, id)
  if (optionalId !== undefined) {
    const parentCollection = collectionPath;
    const subCollectionName = idOrSubCollection;
    const id = optionalId;

    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    return deleteAndLog(docRef);
  }

  // Case 2: Path string format with ID
  const id = idOrSubCollection;
  const segments = collectionPath.split('/');

  if (segments.length === 2) {
    // Handle 'parentCollection/subCollection' format
    const [parentCollection, subCollectionName] = segments;
    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    return deleteAndLog(docRef);
  }

  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    return deleteAndLog(docRef);
  }

  // Default: Simple collection with document ID
  const docRef = doc(db, collectionPath, id);
  return deleteAndLog(docRef);
}

/**
 * Get a document from a Firestore collection
 * @param collectionPath - The collection path or root collection name
 * @param idOrSubCollection - Either document ID or subcollection name
 * @param optionalId - Document ID when using parent/subcollection format
 * @returns Promise with the document data (or null if not found)
 */
export async function getDocFromCollection(collectionPath: string, idOrSubCollection: string, optionalId?: string) {
  const db = getFirestore(app);

  // Case 1: Three-level format (parent, subcollection, id)
  if (optionalId !== undefined) {
    const parentCollection = collectionPath;
    const subCollectionName = idOrSubCollection;
    const id = optionalId;

    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  }

  // Case 2: Path string format with ID
  const id = idOrSubCollection;
  const segments = collectionPath.split('/');

  if (segments.length === 2) {
    // Handle 'parentCollection/subCollection' format
    const [parentCollection, subCollectionName] = segments;
    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  }

  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
  }

  // Default: Simple collection with document ID
  const docRef = doc(db, collectionPath, id);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Filter condition for Firestore queries
 */
export interface FilterCondition {
  field: string;
  operator: WhereFilterOp;
  value: any;
}

/**
 * Query a Firestore collection with optional filter conditions
 * @param collectionPath - The collection path or root collection name
 * @param filters - Array of filter conditions to apply to the query
 * @returns Promise with an array of document data
 */
export async function queryCollectionDocs(collectionPath: string, filters: FilterCondition[] = []) {
  const db = getFirestore(app);
  let colRef;
  const segments = collectionPath.split('/');

  // Handle different path formats
  if (segments.length === 1) {
    // Simple collection
    colRef = collection(db, collectionPath);
  } else if (segments.length === 2) {
    // Handle 'parentCollection/subCollection' format
    const [parentCollection, subCollectionName] = segments;
    const rootCollection = getRootCollection(parentCollection);
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    colRef = collection(parentDocRef, subCollectionName);
  } else if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    colRef = collection(parentDocRef, subCollectionName);
  } else {
    throw new Error(`Invalid collection path format: ${collectionPath}`);
  }

  try {
    // Create a query with all filter conditions
    let q = query(colRef);

    // Apply each filter condition
    if (filters && filters.length > 0) {
      const whereConditions = filters.map(filter =>
        where(filter.field, filter.operator, filter.value)
      );
      q = query(colRef, ...whereConditions);
    }

    // Execute the query
    const querySnapshot = await getDocs(q);

    // Convert query results to array of objects with id and data
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error querying collection:', error);
    return [];
  }
}
