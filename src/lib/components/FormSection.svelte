<script lang="ts">
  import TxnItemTable from './TxnItemTable.svelte';

  // Section properties
  export let title = '';
  export let withSeparator = true;
  export let marginBottom = true;
  export let fullWidth = false;
  
  // Action button properties
  export let actionButton = false;
  export let actionLabel = 'Add';
  export let actionIcon = 'material-symbols:add';
  export let onAction = () => {};
  
  // For transaction item tables
  export let isItemTable = false;
  export let columns: Array<any> | null = null;
  export let items: Array<any> | null = null;
  export let onRemove: ((idx: number) => void) | null = null;
  export let onUpdate: ((idx: number, key: string, value: any) => void) | null = null;
  export let onAdd: (() => void) | null = null;
  export let editable: boolean = true; // Controls whether items can be edited
</script>

{#if withSeparator}
  <hr class="my-3 border-t border-gray-200" />
{/if}

<div class={marginBottom ? 'mb-4' : ''}>
  {#if title}
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-lg font-semibold text-gray-800">{title}</h2>
      
      {#if actionButton}
        <button 
          type="button"
          class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
          on:click={onAction}
        >
          <iconify-icon icon={actionIcon} width="18" height="18"></iconify-icon>
          {actionLabel}
        </button>
      {/if}
    </div>
  {/if}
  
  <div class={fullWidth ? 'w-full' : ''}>
    {#if isItemTable && columns && items}
      <div class="overflow-x-auto w-full">
        <TxnItemTable
          columns={columns}
          rows={items}
          onRemove={onRemove || (() => {})}
          onUpdate={onUpdate || ((idx, key, value) => {})}
          onAdd={onAdd || (() => {})}
          showAddButton={false}
          {editable}
        />
      </div>
    {:else}
      <slot></slot>
    {/if}
  </div>
</div>
