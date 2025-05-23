<script context="module" lang="ts">
  export type ListButton = {
    label: string;
    color?: string; // e.g. 'primary', 'secondary', 'accent', 'ghost', 'outline', or custom
    icon?: string; // iconify icon name
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    disabled?: boolean;
  };
</script>
<script lang="ts">
  export let buttons: ListButton[] = [];
</script>

<div class="flex flex-wrap gap-2 justify-end">
  {#each buttons as btn}
    <button
      class={`btn btn-xs rounded-md px-4 py-1 font-semibold flex items-center gap-2 transition ${btn.color ? `btn-${btn.color}` : 'btn-outline'} ${btn.class ?? ''}`}
      type={btn.type ?? 'button'}
      disabled={btn.disabled}
      on:click={btn.onClick}
    >
      {#if btn.icon}
        <iconify-icon icon={btn.icon} width="18" height="18"></iconify-icon>
      {/if}
      {btn.label}
    </button>
  {/each}
  <slot />
</div> 