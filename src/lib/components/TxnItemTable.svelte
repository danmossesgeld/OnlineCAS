<script lang="ts">
  export let columns: Array<{ label: string; key: string; type?: string; width?: string }>;
  export let rows: Array<Record<string, any>> = [];
  export let editable: boolean = true;
  export let onRemove: (idx: number) => void = () => {};
  export let onUpdate: (idx: number, key: string, value: any) => void = () => {};
  export let onAdd: () => void = () => {};

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

<div class="overflow-x-auto w-full">
  <table class="w-full text-xs border-separate border-spacing-0">
    <thead>
      <tr class="bg-base-200 text-gray-500">
        {#each columns as col}
          <th class="px-2 py-2 font-bold tracking-wide border-b border-gray-200 uppercase text-left">{col.label}</th>
        {/each}
        {#if editable}
          <th class="px-2 py-2 border-b border-gray-200"></th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx}
        <tr class="bg-transparent">
          {#each columns as col}
            <td class="px-2 py-1 align-middle">
              {#if editable && col.type === 'select'}
                <select class="w-full bg-transparent text-gray-700 border-0 focus:ring-0 focus:border-b focus:border-[#8B1F3B] px-0 py-0 text-xs placeholder-gray-400" bind:value={(row as Record<string, any>)[col.key]}>
                  <option value="" disabled selected>{col.label}</option>
                  {#if (col as any).options?.length}
                    {#each (col as any).options as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  {/if}
                </select>
              {:else if editable && (col.type === 'number' || col.type === 'text')}
                <input class="w-full bg-transparent text-gray-700 border-0 focus:ring-0 focus:border-b focus:border-[#8B1F3B] px-0 py-0 text-xs placeholder-gray-400" type={col.type ?? 'text'} placeholder={col.label} bind:value={(row as Record<string, any>)[col.key]} on:input={(e) => onUpdate(idx, col.key, (e.target as HTMLInputElement)?.value)} />
              {:else}
                {(row as Record<string, any>)[col.key]}
              {/if}
            </td>
          {/each}
          {#if editable}
            <td class="px-2 py-1 text-center">
              <button class="p-0 m-0 bg-transparent hover:text-red-500 text-gray-400" type="button" on:click={() => handleRemove(idx)} aria-label="Delete item">
                <iconify-icon icon="material-symbols:delete" width="18" height="18" />
              </button>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if editable}
    <div class="flex w-full justify-start mt-2">
      <button
        class="flex items-center gap-1 text-sm text-gray-500 hover:text-[#8B1F3B] font-medium px-0 py-0 bg-transparent border-0 shadow-none min-h-0 h-6"
        type="button"
        on:click={handleAdd}
        aria-label="Add item"
      >
        <iconify-icon icon="material-symbols:add" width="16" height="16" />
        Add Item
      </button>
    </div>
  {/if}
  <slot />
</div> 