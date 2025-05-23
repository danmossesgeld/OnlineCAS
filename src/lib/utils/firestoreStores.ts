import { readable } from 'svelte/store';
import { getFirestore, collection, onSnapshot, query, QueryConstraint } from 'firebase/firestore';
import { app } from './firebase';

// Returns a Svelte readable store that keeps an array of documents from the given Firestore collection path, updating in real time.
export function collectionStore(path: string, queryOptions: QueryConstraint[] = []) {
  const db = getFirestore(app);
  const colRef = collection(db, path);
  const q = query(colRef, ...queryOptions);

  return readable<any[]>([], set => {
    const unsub = onSnapshot(q, (snapshot) => {
      set(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  });
} 