<script lang="ts">
  export let columns: Array<{ label: string; key: string; type?: string; width?: string }>;
  export let rows: Array<Record<string, any>> = [];
  export let editable: boolean = true;
  export let onRemove: (idx: number) => void = () => {};
  export let onUpdate: (idx: number, key: string, value: any) => void = () => {};
  export let onAdd: () => void = () => {};
  export let showAddButton: boolean = false; // Set to false by default to avoid duplicate buttons

  const DEFAULT_ROWS_COUNT = 1;

  // Auto-add a default row if empty
  if (rows.length === 0) {
    for (let i = 0; i < DEFAULT_ROWS_COUNT; i++) {
      const newRow: Record<string, any> = {};
      columns.forEach(col => {
        newRow[col.key] = (col.type === 'number' || col.key === 'amount' || col.key === 'qty' || col.key === 'price' || col.key === 'dsc') ? 0 : '';
      });
      rows = [...rows, newRow];
    }
  }

  const handleAdd = () => onAdd();
  const handleRemove = (idx: number) => onRemove(idx);
</script>

<div class="w-full">
  <table class="w-full text-sm border-collapse">
    <thead>
      <tr class="bg-gray-100 text-gray-600">
        {#each columns as col, colIndex}
          <th class="py-2 font-semibold tracking-wide border-b border-gray-200 text-left" style="width: {col.key === 'item' ? '25%' : col.key === 'description' ? '30%' : col.width || 'auto'}; padding: 0.25rem;">
            {col.label}
          </th>
        {/each}
        {#if editable}
          <th class="py-2 border-b border-gray-200 w-10 text-center"></th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx}
        <tr class="hover:bg-blue-50/30">
          {#each columns as col, colIndex}
            <td class="align-middle border-b border-gray-100" style="padding: 0.25rem 0.5rem;">
              {#if editable && col.type === 'select'}
                <select class="w-full bg-transparent text-gray-700 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 px-2 py-1.5 text-sm" bind:value={(row as Record<string, any>)[col.key]}>
                  <option value="" disabled selected>{col.label}</option>
                  {#if (col as any).options?.length}
                    {#each (col as any).options as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  {/if}
                </select>
              {:else if editable && col.type === 'number'}
                <input class="w-full text-center bg-transparent text-gray-700 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 py-1.5 text-sm" 
                       type="number" 
                       step="any" 
                       placeholder="0" 
                       bind:value={(row as Record<string, any>)[col.key]} 
                       on:input={(e) => onUpdate(idx, col.key, parseFloat((e.target as HTMLInputElement).value) || 0)}>
              {:else if editable && col.type === 'text'}
                <input class="w-full bg-transparent text-gray-700 border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 px-2 py-1.5 text-sm" 
                       type="text" 
                       placeholder={col.label} 
                       bind:value={(row as Record<string, any>)[col.key]} 
                       on:input={(e) => onUpdate(idx, col.key, (e.target as HTMLInputElement)?.value)}>
              {:else}
                <!-- Display readable values for reference fields in non-editable mode -->
                {#if col.key === 'item' && (row as Record<string, any>)['itemName']}
                  <span class="text-gray-700">{(row as Record<string, any>)['itemName']}</span>
                {:else if col.key === 'unit' && (row as Record<string, any>)['unitName']}
                  <span class="text-gray-700">{(row as Record<string, any>)['unitName']}</span>
                {:else if col.key === 'taxType' && (row as Record<string, any>)['taxTypeName']}
                  <span class="text-gray-700">{(row as Record<string, any>)['taxTypeName']}</span>
                {:else}
                  <span class="text-gray-700">{(row as Record<string, any>)[col.key]}</span>
                {/if}
              {/if}
            </td>
          {/each}
          {#if editable}
            <td class="text-center border-b border-gray-100" style="padding: 0.25rem;">
              <button class="p-1 hover:text-red-500 text-gray-400 transition-colors" type="button" on:click={() => handleRemove(idx)} aria-label="Delete item">
                <iconify-icon icon="material-symbols:delete" width="16" height="16"></iconify-icon>
              </button>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if editable && showAddButton}
    <div class="flex w-full justify-start mt-4">
      <button
        class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
        type="button"
        on:click={handleAdd}
        aria-label="Add item"
      >
        <iconify-icon icon="material-symbols:add" width="18" height="18"></iconify-icon>
        Add Item
      </button>
    </div>
  {/if}
  <slot />
</div> 