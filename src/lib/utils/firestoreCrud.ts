import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc, getDoc, getDocs, query, where, type CollectionReference, type DocumentReference, type WhereFilterOp } from 'firebase/firestore';
import { app } from './firebase';

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
    return addDoc(subColRef, data);
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
    return addDoc(subCollectionRef, data);
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
    return addDoc(subColRef, data);
  } 
  
  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    return addDoc(subColRef, data);
  }
  
  // Default: Simple collection
  return addDoc(collection(db, collectionPath), data);
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
    return setDoc(docRef, data, { merge: true });
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
    return setDoc(docRef, data, { merge: true });
  } 
  
  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    return setDoc(docRef, data, { merge: true });
  }
  
  // Default: Simple collection with document ID
  return setDoc(doc(db, collectionPath, id), data, { merge: true });
}

/**
 * Delete a document from a Firestore collection
 * @param collectionPath - The collection path or root collection name
 * @param idOrSubCollection - Either document ID or subcollection name
 * @param optionalId - Document ID when using parent/subcollection format
 * @returns Promise with the delete result
 */
export async function deleteDocFromCollection(collectionPath: string, idOrSubCollection: string, optionalId?: string) {
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
    return deleteDoc(docRef);
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
    return deleteDoc(docRef);
  } 
  
  if (segments.length === 3) {
    // Handle 'rootCollection/parentCollection/subCollection' format
    const [rootCollection, parentCollection, subCollectionName] = segments;
    const rootColRef = collection(db, rootCollection);
    const parentDocRef = doc(rootColRef, parentCollection);
    const subColRef = collection(parentDocRef, subCollectionName);
    const docRef = doc(subColRef, id);
    return deleteDoc(docRef);
  }
  
  // Default: Simple collection with document ID
  return deleteDoc(doc(db, collectionPath, id));
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