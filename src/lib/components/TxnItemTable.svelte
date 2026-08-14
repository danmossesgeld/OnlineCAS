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
  <table class="w-full text-sm border-collapse" style="table-layout: fixed;">
    <thead>
      <tr>
        {#each columns as col, colIndex}
          <th
            class="py-2 font-medium text-xs uppercase tracking-wide text-left truncate"
            style="width: {col.width || 'auto'}; padding: 0.4rem 0.5rem; color: var(--color-neutral-500); border-bottom: 1px solid var(--color-neutral-200);"
          >
            {col.label}
          </th>
        {/each}
        {#if editable}
          <th class="py-2 w-10 text-center" style="border-bottom: 1px solid var(--color-neutral-200);"></th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx}
        <tr class="transition-colors hover:[background:var(--color-primary-50)]">
          {#each columns as col, colIndex}
            <td class="align-middle" style="padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--color-neutral-100); overflow-wrap: anywhere;">
              {#if editable && col.key === 'amount'}
                <div class="w-full text-right">
                  <input
                    class="w-full bg-transparent text-right font-mono rounded-md py-1.5 px-2 text-sm border focus:outline-none focus:ring-1"
                    style="color: var(--color-neutral-800); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-400);"
                    type="text"
                    placeholder="0.00"
                    value={new Intl.NumberFormat('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(Number((row as Record<string, any>)[col.key] || 0))}
                    on:blur={(e) => {
                      const value = parseFloat((e.target as HTMLInputElement).value.replace(/,/g, '')) || 0;
                      onUpdate(idx, col.key, value);
                    }}
                    on:focus={(e) => {
                      // Remove formatting on focus for easier editing
                      const value = parseFloat((e.target as HTMLInputElement).value.replace(/,/g, '')) || 0;
                      (e.target as HTMLInputElement).value = value.toString();
                    }}
                  >
                </div>
              {:else if editable && col.type === 'select'}
                <select
                  class="w-full bg-transparent rounded-md px-2 py-1.5 text-sm border focus:outline-none focus:ring-1"
                  style="color: var(--color-neutral-700); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-400);"
                  bind:value={(row as Record<string, any>)[col.key]}
                  on:change={(e) => onUpdate(idx, col.key, (e.target as HTMLSelectElement).value)}
                >
                  <!-- Do not force a disabled placeholder so that a valid empty option like 'N/A' can be selected -->
                  {#if typeof (col as any).options === 'function'}
                    <!-- Handle function-based options (like getEntityOptions) -->
                    {@const optionsArray = (col as any).options(row) || []}
                    {#each optionsArray as opt}
                      {#if opt && typeof opt === 'object' && 'value' in opt && 'label' in opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/if}
                    {/each}
                  {:else if Array.isArray((col as any).options)}
                    <!-- Handle static array options -->
                    {#each (col as any).options as opt}
                      {#if opt && typeof opt === 'object' && 'value' in opt && 'label' in opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/if}
                    {/each}
                  {/if}
                </select>
              {:else if editable && col.type === 'number'}
                <input
                  class="w-full text-center bg-transparent rounded-md py-1.5 text-sm border focus:outline-none focus:ring-1"
                  style="color: var(--color-neutral-700); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-400);"
                  type="number"
                  step="any"
                  placeholder="0"
                  bind:value={(row as Record<string, any>)[col.key]}
                  on:input={(e) => onUpdate(idx, col.key, parseFloat((e.target as HTMLInputElement).value) || 0)}
                >
              {:else if editable && col.type === 'text'}
                <input
                  class="w-full bg-transparent rounded-md px-2 py-1.5 text-sm border focus:outline-none focus:ring-1"
                  style="color: var(--color-neutral-700); border-color: var(--color-neutral-200); --tw-ring-color: var(--color-primary-400);"
                  type="text"
                  placeholder={col.label}
                  bind:value={(row as Record<string, any>)[col.key]}
                  on:input={(e) => onUpdate(idx, col.key, (e.target as HTMLInputElement)?.value)}>
              {:else}
                {#if col.key === 'amount'}
                  <!-- Format amount in accounting format with proper alignment -->
                  <div class="text-right w-full">
                    <span class="font-mono" style="color: var(--color-neutral-800); white-space: nowrap;">
                      {new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                        useGrouping: true
                      }).format(Number((row as Record<string, any>)[col.key] || 0))}
                    </span>
                  </div>
                {:else if (col as any).displayField && (row as Record<string, any>)[(col as any).displayField]}
                  <!-- If a display field is specified and has a value, use that -->
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)[(col as any).displayField]}</span>
                {:else if col.key === 'item' && (row as Record<string, any>)['itemName']}
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)['itemName']}</span>
                {:else if col.key === 'unit' && (row as Record<string, any>)['unitName']}
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)['unitName']}</span>
                {:else if col.key === 'taxType' && (row as Record<string, any>)['taxTypeName']}
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)['taxTypeName']}</span>
                {:else if col.key === 'nameId' && (row as Record<string, any>)['nameName']}
                  <!-- Specific fix for entity fields in journal entries -->
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)['nameName']}</span>
                {:else}
                  <span style="color: var(--color-neutral-700);">{(row as Record<string, any>)[col.key]}</span>
                {/if}
              {/if}
            </td>
          {/each}
          {#if editable}
            <td class="text-center" style="padding: 0.25rem; border-bottom: 1px solid var(--color-neutral-100);">
              <button class="p-1 transition-colors" style="color: var(--color-neutral-400);" type="button" on:click={() => handleRemove(idx)} aria-label="Delete item">
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
        class="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition-colors"
        style="color: var(--color-primary-700); background: var(--color-primary-50);"
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