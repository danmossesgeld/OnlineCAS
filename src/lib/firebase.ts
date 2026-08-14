// Re-exported from the single source of truth to avoid two independent Firebase
// initializations drifting apart. Prefer importing from '$lib/utils/firebase' in new code.
export { app } from './utils/firebase';
