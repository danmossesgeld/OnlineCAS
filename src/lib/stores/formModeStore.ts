/**
 * Form Mode Store
 * ---------------
 * A reusable Svelte store that handles form modes (create, edit, view)
 * based on URL parameters and path segments.
 * 
 * How to use:
 * 1. Import: import { createFormModeStore } from '$lib/stores/formModeStore';
 * 2. Create instance: const formMode = createFormModeStore();
 * 3. Subscribe: $: ({ docId, isViewMode, isEditMode, isCreateMode, mode } = $formMode);
 * 
 * URL handling:
 * - ID can come from path params (/form/[id]) or query params (?id=123)
 * - View mode is active when URL contains '/view/' or ?viewMode=true
 */

import { derived } from 'svelte/store';
import { page } from '$app/stores';
import type { Readable } from 'svelte/store';

// Type definition for form modes
export type FormMode = 'create' | 'edit' | 'view';

// Interface for form mode state
export interface FormModeState {
  docId: string;         // Document ID (empty for create mode)
  isViewMode: boolean;   // True in view-only mode
  isEditMode: boolean;   // True when editing existing document
  isCreateMode: boolean; // True when creating new document
  mode: FormMode;        // String representation of current mode
}

/**
 * Creates a reactive store that tracks form mode based on URL parameters.
 * @returns A readable store containing form mode state
 */
export function createFormModeStore(): Readable<FormModeState> {
  return derived(page, ($page) => {
    // Extract document ID from URL parameters or query string
    const docId = $page.params.id || $page.url.searchParams.get('id') || '';
    
    // Determine view mode from URL path or viewMode parameter
    const viewModeParam = $page.url.searchParams.get('viewMode');
    const isViewMode = $page.url.pathname.includes('/view/') || viewModeParam === 'true';
    
    // Edit mode requires an ID and not being in view mode
    const isEditMode = Boolean(docId) && !isViewMode;
    
    // Create mode when there's no ID
    const isCreateMode = !Boolean(docId);
    
    // Mode string for easy reference
    const mode = isViewMode ? 'view' : isEditMode ? 'edit' : 'create' as FormMode;
    
    return { docId, isViewMode, isEditMode, isCreateMode, mode };
  });
}
