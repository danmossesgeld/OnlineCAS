<script lang="ts">
  import { goto } from '$app/navigation';
  
  export let title = '';
  export let backPath = '';
</script>

<div class="flex flex-col h-full w-full p-2 sm:p-4 md:p-6 lg:p-8 bg-gray-50">
  <div class="flex items-center mb-4 md:mb-6 px-2">
    {#if backPath}
      <button 
        on:click={() => goto(backPath)}
        class="flex items-center justify-center w-9 h-9 mr-3 bg-white hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-lg shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-200" 
        aria-label="Back"
      >
        <iconify-icon icon="material-symbols:arrow-back-rounded" width="20" height="20"></iconify-icon>
      </button>
    {/if}
    <h1 class="text-2xl md:text-3xl font-bold text-gray-800">{title}</h1>
  </div>
  
  <form on:submit|preventDefault class="flex flex-col flex-1 h-full w-full">
    <div class="bg-white rounded-xl shadow-sm p-4 flex flex-col flex-1">
      <slot></slot>
    </div>
  </form>
</div>
