import { getFirestore, collection, addDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { app } from './firebase';

/**
 * Add a document to a Firestore collection
 */
export async function addDocToCollection(collectionPath: string, data: any) {
  const db = getFirestore(app);
  return addDoc(collection(db, collectionPath), data);
}

/**
 * Update a document in a Firestore collection
 */
export async function updateDocInCollection(collectionPath: string, id: string, data: any) {
  const db = getFirestore(app);
  return setDoc(doc(db, collectionPath, id), data);
}

/**
 * Delete a document from a Firestore collection
 */
export async function deleteDocFromCollection(collectionPath: string, id: string) {
  const db = getFirestore(app);
  return deleteDoc(doc(db, collectionPath, id));
} 