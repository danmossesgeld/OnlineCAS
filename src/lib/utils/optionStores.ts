import { firestoreOptionsStore } from './firestoreOptions';

// Central registry for commonly used Firestore option stores
export const categoryOptions = firestoreOptionsStore('categories');
export const unitOptions = firestoreOptionsStore('units');
export const customerOptions = firestoreOptionsStore('customers', 'name', 'id');
export const termsOptions = firestoreOptionsStore('terms');
export const paymentMethodOptions = firestoreOptionsStore('paymentmethods');
export const itemOptions = firestoreOptionsStore('items', 'name', 'id');
export const taxTypeOptions = firestoreOptionsStore('tax', 'name', 'id'); 