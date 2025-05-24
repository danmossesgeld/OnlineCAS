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

<div class="flex flex-wrap gap-3 justify-end">
  {#each buttons as btn}
    <button
      class={`${btn.color === 'primary' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'} px-4 py-2 rounded-md font-medium flex items-center gap-2 transition-colors shadow-sm hover:shadow ${btn.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${btn.class ?? ''}`}
      type={btn.type ?? 'button'}
      disabled={btn.disabled}
      on:click={btn.onClick}
    >
      {#if btn.icon}
        <iconify-icon icon={btn.icon} width="18" height="18" class={btn.color === 'primary' ? 'text-white' : 'text-gray-500'}></iconify-icon>
      {/if}
      {btn.label}
    </button>
  {/each}
  <slot />
</div>