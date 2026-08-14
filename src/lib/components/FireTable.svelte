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
  export let columns: Array<{ label: string; key: string; width?: string; type?: string; render?: (row: any) => string }> = [];
  export let queryOptions: QueryConstraint[] = [];
  // Hierarchy support (auto-detected by default). If rows contain parentId, we order parent -> children and add _depth and parentName
  export let enableHierarchy: boolean = true;
  export let hierarchyField: string = 'parentId';
  export let nameField: string = 'name';
  // Client-side search — filters the already-loaded rows rather than rewriting the Firestore
  // query. A server-side range query (where >=/<= term) is case-sensitive and prefix-only (so
  // "cash" never matches "Cash" or "Petty Cash"), and for hierarchical data it silently drops
  // matching child rows whose parent didn't also match. Filtering client-side after the full
  // collection is loaded avoids both problems and needs no composite Firestore index.
  export let searchTerm: string = '';
  export let searchKeys: string[] = [];

  // Provided for external reference - not used in this component
  export const actions = () => null;

  // Internal state
  let rows: any[] = [];
  let unsub: Unsubscriber | null = null;

  $: filteredRows = (() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term || searchKeys.length === 0) return rows;
    return rows.filter(row =>
      searchKeys.some(key => String(row[key] ?? '').toLowerCase().includes(term))
    );
  })();

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
          .subscribe(data => { rows = processRows(data); });
      } 
      else if (effectiveParent && effectiveSub) {
        // Two-level collection structure with implicit root
        unsub = collectionStore(effectiveParent, effectiveSub, queryOptions)
          .subscribe(data => { rows = processRows(data); });
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

  function processRows(data: any[]): any[] {
    if (!Array.isArray(data)) return [];
    if (!enableHierarchy) return data;
    // Auto-enable only if some row has a non-empty parent id
    const hasParent = data.some(r => !!r?.[hierarchyField]);
    if (!hasParent) return data;
    const byId: Record<string, any> = {};
    const children: Record<string, any[]> = {};
    for (const r of data) {
      byId[r.id] = r;
      const p = r[hierarchyField];
      if (p) {
        if (!children[p]) children[p] = [];
        children[p].push(r);
      }
    }
    const roots = data.filter(r => !r[hierarchyField]);
    // Sort by code or name if code missing
    const sortKey = (x: any) => String(x.code ?? x[nameField] ?? '');
    roots.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const result: any[] = [];
    const visit = (node: any, depth = 0) => {
      const parentId = node[hierarchyField];
      if (parentId && byId[parentId]) {
        node.parentName = byId[parentId]?.[nameField] ?? node.parentName;
      }
      result.push({ ...node, _depth: depth });
      const kids = (children[node.id] || []).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      for (const k of kids) visit(k, depth + 1);
    };
    for (const r of roots) visit(r, 0);
    return result;
  }
</script>

<div class="overflow-x-auto w-full">
  <table class="w-full text-sm border-collapse">
    <thead>
      <tr>
        {#each columns as col}
          <th
            class="px-3 py-2.5 font-medium text-left text-xs uppercase tracking-wide"
            style="color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200); {col.width ? `width:${col.width}` : ''}"
          >{col.label}</th>
        {/each}
        <th class="px-3 py-2.5 w-20" style="border-bottom: 1px solid var(--color-neutral-200);"></th>
      </tr>
    </thead>
    <tbody>
      {#each filteredRows as row, idx}
        <tr class="transition-colors duration-100 hover:[background:var(--color-primary-50)]">
          {#each columns as col}
            <td class="px-3 py-2.5 align-middle" style="border-bottom: 1px solid var(--color-neutral-100);">
              {#if col.render}
                {@html col.render(row)}
              {:else if col.type === 'date' || col.key.toLowerCase().includes('date')}
                {#if row[col.key]}
                  <span style="color: var(--color-neutral-600);">
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
                  <span style="color: var(--color-neutral-400);">-</span>
                {/if}
              {:else if typeof row[col.key] === 'number' && (col.key === 'amount' || col.key === 'totalDue' || col.key === 'grossAmount' || col.key === 'netSales')}
                <span class="font-medium" style="color: var(--color-neutral-800);">{row[col.key].toLocaleString('en-US', { style: 'currency', currency: 'PHP' })}</span>
              {:else if col.key === 'status'}
                {@const statusColor = row[col.key] === 'Posted' ? '--color-success-600' : row[col.key] === 'Pending' ? '--color-warning-600' : row[col.key] === 'Overdue' ? '--color-error-600' : '--color-neutral-500'}
                <span
                  class="inline-flex px-2 py-0.5 text-xs font-medium rounded-full"
                  style={`color: var(${statusColor}); background: color-mix(in srgb, var(${statusColor}) 14%, transparent);`}
                >
                  {row[col.key]}
                </span>
              {:else if col.key === 'remarks' && !row[col.key] && row['memo']}
                <span style="color: var(--color-neutral-700);">{row['memo']}</span>
              {:else}
                <span style="color: var(--color-neutral-700);">{row[col.key] || '-'}</span>
              {/if}
            </td>
          {/each}
          <td class="px-3 py-2.5 text-center" style="border-bottom: 1px solid var(--color-neutral-100);">
            <div class="flex items-center justify-center space-x-1">
              <slot name="actions" {row} />
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div> 