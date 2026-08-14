<script context="module" lang="ts">
  export type ListButton = {
    label: string;
    color?: string; // e.g. 'primary', 'secondary', 'accent', 'ghost', 'outline', or custom
    icon?: string; // iconify icon name
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    disabled?: boolean;
    variant?: 'filled' | 'outline' | 'soft' | 'ghost';
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import FireTable from '$lib/components/FireTable.svelte';
  import { deleteDocFromCollection } from '$lib/utils/firestoreCrud';
  import { getFirestore, collection, query, getDocs } from 'firebase/firestore';
  import { app } from '$lib/utils/firebase';

  // Props for collection path
  export let rootCollection: string;
  export let parentCollection: string;
  export let subCollectionName: string;
  
  // Props for document type and configuration
  export let documentType: string = 'item';
  
  // Props for display customization
  export let title: string;
  export let subtitle: string = `Manage your ${documentType}s`;
  // Accent color for this list's header (each masterlist/otherlist page picks its own,
  // e.g. 'green' for Categories, 'amber' for Discounts) — was a `const` (silently
  // ignoring whatever the page passed in); now a real prop, rendered as a left-border
  // accent on the title.
  export let primaryColorClass: string = 'indigo';

  const accentColorMap: Record<string, string> = {
    indigo: '#6366f1', blue: '#3b82f6', green: '#22c55e', emerald: '#10b981',
    amber: '#f59e0b', purple: '#a855f7', teal: '#14b8a6', red: '#ef4444'
  };
  $: accentColor = accentColorMap[primaryColorClass] || accentColorMap.indigo;
  
  // Props for search and filter
  export let searchPlaceholder: string = `Search ${documentType}s...`;
  export let showFilters: boolean = false;
  export let customFilters: Array<{label: string, options: Array<{value: string, label: string}>}> = [];
  
  // Props for buttons
  export let buttons: ListButton[] = [];
  export let defaultButtons: boolean = false;
  export let newButtonPath: string = '';
  // Export constants for paths that might be used in the future
  export const viewButtonPath: string = '';
  export const editButtonPath: string = '';
  export let allowDelete: boolean = false;
  
  // Props for columns
  export let columns: Array<{label: string, key: string}> = [];
  export let queryOptions: any[] = [];

  // State variables
  let totalCount = 0;
  let isLoading = true;
  let searchTerm = '';

  // Columns whose values are reasonable to search across (name/code/description/etc.) \u2014
  // matched client-side in FireTable against the already-loaded rows. See FireTable.svelte
  // for why this isn't done as a Firestore query.
  $: searchKeys = columns
    .filter(col => [
      'name', 'title', 'code', 'description', 'number', 'reference',
      'email', 'phone', 'address', 'contact'
    ].some(searchField => col.key.toLowerCase().includes(searchField)))
    .map(col => col.key);

  // Load data count on mount
  onMount(async () => {
    await loadTotalCount();
  });

  // Function to load total count
  async function loadTotalCount() {
    isLoading = true;
    try {
      const db = getFirestore(app);
      const collRef = collection(db, rootCollection, parentCollection, subCollectionName);
      
      // Get total count
      const totalQuery = query(collRef);
      const totalSnapshot = await getDocs(totalQuery);
      totalCount = totalSnapshot.size;
    } catch (error) {
      console.error('Error loading total count:', error);
    } finally {
      isLoading = false;
    }
  }
  
  // Default buttons if enabled
  $: {
    if (defaultButtons && buttons.length === 0) {
      buttons = [
        {
          label: `New ${documentType[0].toUpperCase() + documentType.slice(1)}`,
          color: 'primary',
          icon: 'material-symbols:add',
          variant: 'filled',
          onClick: () => newButtonPath && goto(newButtonPath)
        }
      ];
    }
  }
</script>

<div class="flex flex-col h-full w-full">
  <div class="rounded-lg border p-4 sm:p-5" style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);">
    <!-- Header section with title and buttons -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
      <div style="border-left: 3px solid {accentColor}; padding-left: 0.75rem;">
        <h1 class="text-xl md:text-2xl font-semibold mb-0.5" style="color: var(--color-neutral-800);">{title}</h1>
        <p class="text-sm" style="color: var(--color-neutral-500);">{subtitle}</p>
      </div>
      <div>
        <div class="flex flex-wrap gap-3 justify-end">
          {#each buttons as btn}
            {@const variant = btn.variant || 'filled'}
            {@const colorClass = btn.color || 'primary'}
            {@const accent = colorClass === 'secondary' ? '--color-success-600' : colorClass === 'accent' ? '--color-warning-600' : colorClass === 'primary' ? '--color-primary-600' : '--color-neutral-600'}
            <button
              class="px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors focus:outline-none focus:ring-2
                {variant === 'filled' ? 'text-white' : ''}
                {btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                {btn.class ?? ''}"
              style={variant === 'filled'
                ? `background: var(${accent}); --tw-ring-color: var(${accent});`
                : variant === 'outline'
                  ? `background: transparent; border: 1px solid var(${accent}); color: var(${accent}); --tw-ring-color: var(${accent});`
                  : variant === 'soft'
                    ? `background: color-mix(in srgb, var(${accent}) 14%, transparent); color: var(${accent}); --tw-ring-color: var(${accent});`
                    : `background: transparent; color: var(${accent}); --tw-ring-color: var(${accent});`}
              type={btn.type ?? 'button'}
              disabled={btn.disabled}
              on:click={btn.onClick}
            >
              {#if btn.icon}
                <iconify-icon icon={btn.icon} width="18" height="18"></iconify-icon>
              {/if}
              {btn.label}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Search and filter toolbar -->
    <div class="flex flex-col sm:flex-row gap-2.5 mb-5 items-start sm:items-center">
      <div class="relative w-full sm:w-1/2 md:w-1/3">
        <iconify-icon icon="material-symbols:search" class="absolute left-3 top-1/2 transform -translate-y-1/2" style="color: var(--color-neutral-400);" width="18" height="18"></iconify-icon>
        <input
          class="w-full pl-9 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors"
          style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700); --tw-ring-color: var(--color-primary-300);"
          placeholder={searchPlaceholder}
          bind:value={searchTerm}
        />
      </div>

      {#if showFilters && customFilters.length > 0}
        {#each customFilters as filter}
          <select
            class="w-full sm:w-auto py-2 px-3 rounded-lg border text-sm"
            style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-700);"
          >
            <option value="">{filter.label}</option>
            {#each filter.options as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/each}
      {/if}
    </div>

    <!-- Data table -->
    <FireTable
      {rootCollection}
      {parentCollection}
      {subCollectionName}
      {columns}
      {queryOptions}
      {searchTerm}
      {searchKeys}
    >
      <!-- Pass through actions from parent -->
      <svelte:fragment slot="actions" let:row>
        <slot name="additionalActions" row={row}></slot>

        {#if allowDelete}
          <button
            class="p-1.5 rounded-md transition-colors"
            style="color: var(--color-neutral-500);"
            aria-label={`Delete ${documentType}`}
            on:click={() => {
              if (confirm(`Are you sure you want to delete this ${documentType}?`)) {
                deleteDocFromCollection(`${parentCollection}/${subCollectionName}`, row.id);
              }
            }}
          >
            <iconify-icon icon="material-symbols:delete-outline" width="20" height="20"></iconify-icon>
          </button>
        {/if}
      </svelte:fragment>

      <!-- We'll only use the actions slot, keeping this simple -->
      <!-- Custom columns are not needed for masterlist/otherlist pages -->
    </FireTable>
  </div>
</div>
