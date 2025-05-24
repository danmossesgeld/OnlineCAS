import { derived } from 'svelte/store';
import { collectionStore } from './firestoreStores';

// Returns a derived Svelte store of options ({label, value}) for a Firestore collection, for use in select fields.
export function firestoreOptionsStore(collectionName: string, labelKey = 'name', valueKey = 'id') {
  // Determine if the collection belongs to masterlist or otherlist
  let parentCollection = '';
  let subCollectionName = '';
  
  // Parse the collection name to handle different formats
  if (collectionName.includes('/')) {
    // Case 1: Path provided as 'parent/subcollection'
    const segments = collectionName.split('/');
    parentCollection = segments[0];
    subCollectionName = segments[1];
  } else {
    // Case 2: Collection name provided without path
    // Check if it's a known masterlist collection
    const masterlistCollections = ['customers', 'items', 'vendors', 'othernames'];
    if (masterlistCollections.includes(collectionName)) {
      parentCollection = 'masterlist';
      subCollectionName = collectionName;
    } else {
      // Assume it's in otherlist if not in masterlist
      parentCollection = 'otherlist';
      subCollectionName = collectionName;
    }
  }
  
  return derived(collectionStore(parentCollection, subCollectionName), ($items) =>
    $items.map(item => ({
      label: item[labelKey] ?? item.id,
      value: item[valueKey] ?? item.id
    }))
  );
}