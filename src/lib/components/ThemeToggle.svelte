<script lang="ts">
  import { theme } from '$lib/stores/themeStore';

  // Compact segmented light/dark switch. Placement is up to the page that uses it.
  export let compact = false;
</script>

<div
  class="inline-flex items-center rounded-lg border p-0.5 text-sm"
  style="background: var(--color-neutral-50); border-color: var(--color-neutral-200);"
  role="group"
  aria-label="Theme"
>
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors"
    style={$theme === 'light'
      ? 'background: var(--color-neutral-0); color: var(--color-primary-700); box-shadow: var(--shadow-sm);'
      : 'color: var(--color-neutral-500);'}
    on:click={() => theme.set('light')}
    aria-pressed={$theme === 'light'}
  >
    <iconify-icon icon="material-symbols:light-mode-outline" width="16" height="16"></iconify-icon>
    {#if !compact}<span>Light</span>{/if}
  </button>
  <button
    type="button"
    class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors"
    style={$theme === 'dark'
      ? 'background: var(--color-neutral-0); color: var(--color-primary-700); box-shadow: var(--shadow-sm);'
      : 'color: var(--color-neutral-500);'}
    on:click={() => theme.set('dark')}
    aria-pressed={$theme === 'dark'}
  >
    <iconify-icon icon="material-symbols:dark-mode-outline" width="16" height="16"></iconify-icon>
    {#if !compact}<span>Dark</span>{/if}
  </button>
</div>
