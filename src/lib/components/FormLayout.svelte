<script lang="ts">
  import { goto } from '$app/navigation';
  
  export let title = '';
  export let backPath = '';
</script>

<div class="flex flex-col flex-1 w-full min-h-0">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form on:submit|preventDefault on:keydown class="flex flex-col flex-1 min-h-0 w-full">
    <div
      class="rounded-lg border p-4 sm:p-5 flex flex-col flex-1 min-h-0"
      style="background: var(--color-neutral-0); border-color: var(--color-neutral-200);"
    >
      <!-- Header lives inside the card now, not floating above it. header-actions is
           sized to comfortably hold a compact memo/notes box (QuickBooks-style), not
           just a small icon button — see TxnFields' docblock for the pattern. -->
      <div class="flex items-start mb-4 gap-3 shrink-0 flex-wrap">
        <div class="flex items-center gap-3">
          {#if backPath}
            <button
              on:click={() => goto(backPath)}
              class="flex items-center justify-center w-9 h-9 rounded-lg border transition-colors focus:outline-none focus:ring-2 shrink-0"
              style="background: var(--color-neutral-50); border-color: var(--color-neutral-200); color: var(--color-neutral-600);"
              aria-label="Back"
            >
              <iconify-icon icon="material-symbols:arrow-back-rounded" width="20" height="20"></iconify-icon>
            </button>
          {/if}
          <slot name="title">
            <h1 class="text-xl md:text-2xl font-semibold" style="color: var(--color-neutral-800);">{title}</h1>
          </slot>
        </div>
        <div class="ml-auto flex items-start gap-3 w-full sm:w-auto">
          <slot name="header-actions"></slot>
        </div>
      </div>

      <slot></slot>
    </div>
  </form>
</div>
