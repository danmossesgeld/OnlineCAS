import { createFirestoreOptionsStore } from './firestoreOptions';

// Central registry for commonly used Firestore option stores
export const categoryOptions = createFirestoreOptionsStore('categories');
export const unitOptions = createFirestoreOptionsStore('units');
export const customerOptions = createFirestoreOptionsStore('customers', 'name', 'id');
export const termsOptions = createFirestoreOptionsStore('terms');
export const paymentMethodOptions = createFirestoreOptionsStore('paymentmethods');
export const itemOptions = createFirestoreOptionsStore('items', 'name', 'id');
export const taxTypeOptions = createFirestoreOptionsStore('tax', 'name', 'id'); 