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
  import { getFirestore, collection, query, getDocs, where, orderBy } from 'firebase/firestore';
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
  // Use const for reference-only values
  export const primaryColorClass = 'indigo'; // Used in header styling
  
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
  let filteredQueryOptions = [...queryOptions];
  
  // Load data count on mount
  onMount(async () => {
    await loadTotalCount();
  });
  
  // Update query options when search term changes
  $: {
    if (searchTerm && searchTerm.trim() !== '') {
      // Find searchable columns (typically name, code, or title fields)
      const searchableColumns = columns
        .filter(col => [
          'name', 'title', 'code', 'description', 'number', 'reference',
          'email', 'phone', 'address', 'contact'
        ].some(searchField => col.key.toLowerCase().includes(searchField)))
        .map(col => col.key);
        
      if (searchableColumns.length > 0) {
        // Create a filtered query that searches across the searchable columns
        // First remove any existing search constraints
        const baseOptions = queryOptions.filter(opt => {
          // This is a simplified way to check if an option is a search constraint
          // Actual implementation might need to be more sophisticated depending on how your queries are structured
          return typeof opt !== 'object' || !('fieldPath' in opt);
        });
        
        // Add search constraints for each searchable column
        // Use case-insensitive search if supported by your Firestore instance
        filteredQueryOptions = [
          ...baseOptions,
          // The first searchable column is usually the most important (like name)
          // We're using startsWith for better performance but could use contains if needed
          where(searchableColumns[0], '>=', searchTerm),
          where(searchableColumns[0], '<=', searchTerm + '\uf8ff'),
          // Add ordering to make search results more predictable
          orderBy(searchableColumns[0])
        ];
      }
    } else {
      // Reset to original query options when search is cleared
      filteredQueryOptions = [...queryOptions];
    }
  }
  
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

<div class="flex flex-col h-full w-full p-0 sm:p-2 md:p-4 lg:p-6 bg-gray-50">
  <div class="bg-white rounded-xl shadow-sm p-4 sm:p-6 lg:p-8">
    <!-- Header section with title and buttons -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-1 border-l-4 pl-3 border-indigo-500">{title}</h1>
        <p class="text-gray-500">{subtitle}</p>
      </div>
      <div>
        <!-- Modernized Button Styling -->
        <div class="flex flex-wrap gap-3 justify-end">
          {#each buttons as btn}
            {@const variant = btn.variant || 'filled'}
            {@const colorClass = btn.color || 'primary'}
            <button
              class={`
                ${variant === 'filled' && colorClass === 'primary' ? 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white' : ''}
                ${variant === 'filled' && colorClass === 'secondary' ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white' : ''}
                ${variant === 'filled' && colorClass === 'accent' ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-600 hover:to-yellow-500 text-white' : ''}
                ${variant === 'filled' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-gray-700 hover:bg-gray-800 text-white' : ''}
                
                ${variant === 'outline' && colorClass === 'primary' ? 'bg-transparent border-2 border-indigo-500 text-indigo-600 hover:bg-indigo-50' : ''}
                ${variant === 'outline' && colorClass === 'secondary' ? 'bg-transparent border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50' : ''}
                ${variant === 'outline' && colorClass === 'accent' ? 'bg-transparent border-2 border-amber-500 text-amber-600 hover:bg-amber-50' : ''}
                ${variant === 'outline' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-transparent border-2 border-gray-400 text-gray-700 hover:bg-gray-50' : ''}
                
                ${variant === 'soft' && colorClass === 'primary' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border border-indigo-200' : ''}
                ${variant === 'soft' && colorClass === 'secondary' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200' : ''}
                ${variant === 'soft' && colorClass === 'accent' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200' : ''}
                ${variant === 'soft' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200' : ''}
                
                ${variant === 'ghost' && colorClass === 'primary' ? 'bg-transparent text-indigo-600 hover:bg-indigo-50' : ''}
                ${variant === 'ghost' && colorClass === 'secondary' ? 'bg-transparent text-emerald-600 hover:bg-emerald-50' : ''}
                ${variant === 'ghost' && colorClass === 'accent' ? 'bg-transparent text-amber-600 hover:bg-amber-50' : ''}
                ${variant === 'ghost' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'bg-transparent text-gray-700 hover:bg-gray-50' : ''}
                
                px-4 py-2.5 rounded-lg font-medium flex items-center gap-2.5 
                transition-all duration-200 ease-in-out 
                shadow-sm hover:shadow-md 
                focus:outline-none focus:ring-2 focus:ring-opacity-50 
                ${colorClass === 'primary' ? 'focus:ring-indigo-300' : ''}
                ${colorClass === 'secondary' ? 'focus:ring-emerald-300' : ''}
                ${colorClass === 'accent' ? 'focus:ring-amber-300' : ''}
                ${!['primary', 'secondary', 'accent'].includes(colorClass) ? 'focus:ring-gray-300' : ''}
                ${btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} 
                ${btn.class ?? ''}
              `}
              type={btn.type ?? 'button'}
              disabled={btn.disabled}
              on:click={btn.onClick}
            >
              {#if btn.icon}
                <iconify-icon 
                  icon={btn.icon} 
                  width="20" 
                  height="20" 
                  class={`
                    ${variant === 'filled' ? 'text-white' : ''}
                    ${variant === 'outline' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'outline' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'outline' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'outline' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                    ${variant === 'soft' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'soft' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'soft' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'soft' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                    ${variant === 'ghost' && colorClass === 'primary' ? 'text-indigo-600' : ''}
                    ${variant === 'ghost' && colorClass === 'secondary' ? 'text-emerald-600' : ''}
                    ${variant === 'ghost' && colorClass === 'accent' ? 'text-amber-600' : ''}
                    ${variant === 'ghost' && !['primary', 'secondary', 'accent'].includes(colorClass) ? 'text-gray-600' : ''}
                  `}
                ></iconify-icon>
              {/if}
              {btn.label}
            </button>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- Search and filter toolbar -->
    <div class="flex flex-col sm:flex-row gap-3 mb-6 items-start sm:items-center">
      <div class="relative w-full sm:w-1/2 md:w-1/3">
        <iconify-icon icon="material-symbols:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" width="20" height="20"></iconify-icon>
        <input 
          class="w-full pl-10 py-2.5 rounded-lg border border-gray-300 bg-white shadow-sm
                 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none
                 transition-all duration-200" 
          placeholder={searchPlaceholder}
          bind:value={searchTerm}
        />
      </div>
      
      {#if showFilters && customFilters.length > 0}
        {#each customFilters as filter}
          <select class="input input-bordered w-full sm:w-auto bg-gray-50 border-gray-300 text-gray-700">
            <option value="">{filter.label}</option>
            {#each filter.options as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/each}
      {/if}
    </div>
    
    <!-- Data table -->
    <div class="rounded-lg overflow-hidden border border-gray-200">
      <FireTable 
        {rootCollection} 
        {parentCollection} 
        {subCollectionName} 
        {columns} 
        queryOptions={filteredQueryOptions}
      >
        <!-- Pass through actions from parent -->
        <svelte:fragment slot="actions" let:row>
          <slot name="additionalActions" row={row}></slot>
          
          {#if allowDelete}
            <button 
              class="btn btn-ghost btn-xs text-gray-600 hover:text-red-600 transition-colors duration-200 p-1 rounded-full hover:bg-red-50" 
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
</div>
