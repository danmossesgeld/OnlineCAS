import { readable } from 'svelte/store';
import { getFirestore, collection, onSnapshot, query, QueryConstraint } from 'firebase/firestore';
import { app } from './firebase';

/**
 * Determine the root collection based on the parent collection name
 * @param parentCollection - The parent collection name
 */
function getRootCollectionName(parentCollection: string): string {
  // Map parent collections to their root collections
  const rootCollectionMap: Record<string, string> = {
    'masterlist': 'listdatabase',
    'otherlist': 'listdatabase',
    'customerCenter': 'transactions',
    'vendorCenter': 'transactions'
  };
  
  return rootCollectionMap[parentCollection] || 'listdatabase';
}

/**
 * Returns a Svelte readable store that keeps an array of documents from a Firestore collection,
 * updating in real time.
 * @param parentCollection - The parent collection name or full path
 * @param subCollectionName - The subcollection name (optional for full paths)
 * @param queryOptions - Additional Firebase query constraints
 * @param rootCollection - Optional root collection name
 * @returns A Svelte readable store with the collection data
 */
export function collectionStore(parentCollection: string, subCollectionName: string, queryOptions: QueryConstraint[] = [], rootCollection?: string) {
  const db = getFirestore(app);
  let colRef;
  
  try {
    // Case 1: Three-level structure with explicit root collection
    if (rootCollection && parentCollection && subCollectionName) {
      colRef = collection(db, rootCollection, parentCollection, subCollectionName);
    } 
    // Case 2: Two-level structure with implicit root collection
    else if (parentCollection && subCollectionName) {
      const defaultRoot = getRootCollectionName(parentCollection);
      colRef = collection(db, defaultRoot, parentCollection, subCollectionName);
    } 
    // Case 3: Path string format
    else if (parentCollection.includes('/')) {
      const segments = parentCollection.split('/');
      
      if (segments.length === 3) {
        // Full path 'rootCollection/parentCollection/subCollection'
        colRef = collection(db, segments[0], segments[1], segments[2]);
      } else if (segments.length === 2) {
        // Path 'parentCollection/subCollection'
        const defaultRoot = getRootCollectionName(segments[0]);
        colRef = collection(db, defaultRoot, segments[0], segments[1]);
      }
    } 
    // Case 4: Simple path
    else {
      const fullPath = subCollectionName ? `${parentCollection}/${subCollectionName}` : parentCollection;
      colRef = collection(db, fullPath);
    }
    
    // Error handling for undefined collection reference
    if (!colRef) {
      console.error('Failed to create collection reference');
      return readable<any[]>([], () => {});
    }
  } catch (error) {
    console.error('Error creating collection reference:', error);
    return readable<any[]>([], () => {});
  }

  // Apply any query constraints and create the store
  const q = query(colRef, ...queryOptions);

  return readable<any[]>([], set => {
    // Set up real-time listener that automatically updates when data changes
    const unsub = onSnapshot(q, (snapshot) => {
      // Map documents to objects with id and data
      set(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error('Firestore snapshot error:', error);
      set([]);
    });
    
    // Return unsubscribe function for cleanup
    return unsub;
  });
}