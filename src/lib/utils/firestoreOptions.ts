import { derived } from 'svelte/store';
import { collectionStore } from './firestoreStores';

// Returns a derived Svelte store of options ({label, value}) for a Firestore collection, for use in select fields.
export function firestoreOptionsStore(collectionName: string, labelKey = 'name', valueKey = 'id') {
  return derived(collectionStore(collectionName), ($items) =>
    $items.map(item => ({
      label: item[labelKey] ?? item.id,
      value: item[valueKey] ?? item.id
    }))
  );
} 