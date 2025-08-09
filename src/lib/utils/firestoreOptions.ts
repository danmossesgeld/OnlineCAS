import { derived } from 'svelte/store';
import { collectionStore } from './firestoreStores';

// Option type definition for use in selects
export type FirestoreOption = {
  label: string;
  value: string;
  raw?: Record<string, any>;
};

// Create stores for frequently accessed collections
export const customerOptionsStore = derived(collectionStore('masterlist', 'customers'), mapToOptions('name', 'id'));
export const itemOptionsStore = derived(collectionStore('masterlist', 'items'), mapToOptions('name', 'id'));
export const vendorOptionsStore = derived(collectionStore('masterlist', 'vendors'), mapToOptions('name', 'id'));
export const accountOptionsStore = derived(collectionStore('masterlist', 'accounts'), mapToOptions('name', 'id'));
export const categoryOptionsStore = derived(collectionStore('otherlist', 'categories'), mapToOptions('name', 'id'));

// Legacy format for backward compatibility (avoid using this format in new code)
export const firestoreOptionsStore = {
  customers: customerOptionsStore,
  items: itemOptionsStore,
  vendors: vendorOptionsStore,
  accounts: accountOptionsStore,
  categories: categoryOptionsStore
};

// Returns a derived Svelte store of options ({label, value}) for a Firestore collection, for use in select fields.
export function createFirestoreOptionsStore(collectionName: string, labelKey = 'name', valueKey = 'id', includeRawData = false) {
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
  
  return derived(collectionStore(parentCollection, subCollectionName), mapToOptions(labelKey, valueKey, includeRawData));
}

// Helper function to map collection items to options format
function mapToOptions(labelKey = 'name', valueKey = 'id', includeRawData = false) {
  return ($items: any[]) => $items.map(item => {
    const option: FirestoreOption = {
      label: item[labelKey] ?? item.id,
      value: item[valueKey] ?? item.id
    };
    
    // Include the raw item data if requested
    if (includeRawData) {
      option.raw = item;
    }
    
    return option;
  });
}