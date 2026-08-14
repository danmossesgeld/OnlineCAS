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

  // When true, this section claims the leftover vertical space in the form (flex-1)
  // instead of just wrapping to its content height. Use on the line-items section so
  // it — not the header fields or summary — dominates the page.
  export let grow = false;
</script>

{#if withSeparator}
  <hr class="my-3 {grow ? 'shrink-0' : ''}" style="border-color: var(--color-neutral-200);" />
{/if}

<div class="{marginBottom ? 'mb-4' : ''} {grow ? 'flex-1 min-h-0 flex flex-col' : ''}">
  {#if title}
    <div class="flex justify-between items-center mb-3 {grow ? 'shrink-0' : ''}">
      <h2 class="text-base font-semibold" style="color: var(--color-neutral-800);">{title}</h2>

      {#if actionButton}
        <button
          type="button"
          class="flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md transition-colors"
          style="color: var(--color-primary-700); background: var(--color-primary-50);"
          on:click={onAction}
        >
          <iconify-icon icon={actionIcon} width="16" height="16"></iconify-icon>
          {actionLabel}
        </button>
      {/if}
    </div>
  {/if}

  <div class="{fullWidth ? 'w-full' : ''} {grow ? 'flex-1 min-h-0 flex flex-col' : ''}">
    {#if isItemTable && columns && items}
      <div class="overflow-x-auto w-full {grow ? 'flex-1 min-h-0' : ''}">
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
