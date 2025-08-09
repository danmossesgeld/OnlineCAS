<script lang="ts">
  import { collectionStore } from '$lib/utils/firestoreStores';
  import { onDestroy } from 'svelte';
  import type { Unsubscriber } from 'svelte/store';
  import type { QueryConstraint } from 'firebase/firestore';

  /**
   * Component props
   * Supports both path string and individual collection segments
   */
  export let collectionPath: string = '';       // Full path format (alternative to individual segments)
  export let rootCollection: string = '';      // Root collection name (e.g., 'transactions')
  export let parentCollection: string = '';    // Parent collection name (e.g., 'customerCenter')
  export let subCollectionName: string = '';   // Subcollection name (e.g., 'salesInvoices')
  export let columns: Array<{ label: string; key: string; width?: string; type?: string }> = [];
  export let queryOptions: QueryConstraint[] = [];
  
  // Provided for external reference - not used in this component
  export const actions = () => null;

  // Internal state
  let rows: any[] = [];
  let unsub: Unsubscriber | null = null;

  $: {
    // Clean up previous subscription if it exists
    if (unsub) unsub();
    
    // Handle collection path resolution
    let effectiveRoot = rootCollection;
    let effectiveParent = parentCollection;
    let effectiveSub = subCollectionName;
    
    // Parse collectionPath if provided (overrides individual segments)
    if (collectionPath) {
      const segments = collectionPath.split('/');
      if (segments.length === 2) {
        // Path format: 'parentCollection/subCollection'
        effectiveParent = segments[0];
        effectiveSub = segments[1];
      } else if (segments.length === 3) {
        // Path format: 'rootCollection/parentCollection/subCollection'
        effectiveRoot = segments[0];
        effectiveParent = segments[1];
        effectiveSub = segments[2];
      }
    }
    
    // Subscribe to the collection store
    try {
      if (effectiveRoot && effectiveParent && effectiveSub) {
        // Three-level collection structure with explicit root
        unsub = collectionStore(effectiveParent, effectiveSub, queryOptions, effectiveRoot)
          .subscribe(data => { rows = data; });
      } 
      else if (effectiveParent && effectiveSub) {
        // Two-level collection structure with implicit root
        unsub = collectionStore(effectiveParent, effectiveSub, queryOptions)
          .subscribe(data => { rows = data; });
      }
      else {
        console.error('Invalid collection path configuration');
        rows = [];
      }
    } catch (error) {
      console.error('Error subscribing to collection:', error);
      rows = [];
    }
  }
  onDestroy(() => { if (unsub) unsub(); });
</script>

<div class="overflow-x-auto w-full">
  <table class="w-full text-sm border-collapse bg-white rounded-lg shadow-sm">
    <thead>
      <tr>
        {#each columns as col}
          <th class="px-4 py-3 font-semibold text-gray-700 bg-gray-50 border-b-2 border-gray-200 text-left" style={col.width ? `width:${col.width}` : ''}>{col.label}</th>
        {/each}
        <th class="px-4 py-3 bg-gray-50 border-b-2 border-gray-200 w-20"></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx}
        <tr class="{idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-blue-50 transition-colors duration-150">
          {#each columns as col}
            <td class="px-4 py-3 align-middle border-b border-gray-100">
              {#if col.type === 'date' || col.key.toLowerCase().includes('date')}
                {#if row[col.key]}
                  <span class="text-gray-600">
                    {#if row[col.key] instanceof Date}
                      {row[col.key].toLocaleDateString()}
                    {:else if row[col.key] && row[col.key].seconds}
                      {new Date(row[col.key].seconds * 1000).toLocaleDateString()}
                    {:else if typeof row[col.key] === 'number'}
                      {new Date(parseInt(row[col.key])).toLocaleDateString()}
                    {:else if typeof row[col.key] === 'string' && !isNaN(Date.parse(row[col.key]))}
                      {new Date(row[col.key]).toLocaleDateString()}
                    {:else}
                      {row[col.key]}
                    {/if}
                  </span>
                {:else}
                  <span class="text-gray-600">-</span>
                {/if}
              {:else if typeof row[col.key] === 'number' && (col.key === 'amount' || col.key === 'totalDue' || col.key === 'grossAmount' || col.key === 'netSales')}
                <span class="font-medium text-gray-900">{row[col.key].toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
              {:else if col.key === 'status'}
                <span class="inline-flex px-2 py-1 text-xs font-medium rounded-full" class:bg-green-100={row[col.key] === 'Posted'} class:text-green-800={row[col.key] === 'Posted'} class:bg-yellow-100={row[col.key] === 'Pending'} class:text-yellow-800={row[col.key] === 'Pending'} class:bg-gray-100={row[col.key] === 'Draft'} class:text-gray-800={row[col.key] === 'Draft'} class:bg-red-100={row[col.key] === 'Overdue'} class:text-red-800={row[col.key] === 'Overdue'}>
                  {row[col.key]}
                </span>
              {:else if col.key === 'remarks' && !row[col.key] && row['memo']}
                <span class="text-gray-700">{row['memo']}</span>
              {:else}
                <span class="text-gray-700">{row[col.key] || '-'}</span>
              {/if}
            </td>
          {/each}
          <td class="px-4 py-3 text-center border-b border-gray-100">
            <div class="flex items-center justify-center space-x-1">
              <slot name="actions" {row} />
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div> 