<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  
  // Redirect to the form page with the ID as a query parameter
  // The formModeStore will detect that we're in edit mode
  onMount(() => {
    const id = $page.params.id;
    
    // Redirect to the form page with the ID as a query parameter
    // No viewMode=true means we're in edit mode
    goto(`/customerCenter/salesInvoice/form?id=${id}`);
  });
</script>

<div class="flex justify-center items-center h-screen w-full">
  <div class="animate-pulse text-center">
    <div class="inline-block rounded-full bg-blue-100 p-4 mb-4">
      <iconify-icon icon="material-symbols:edit-outline-rounded" width="32" height="32" class="text-blue-600"></iconify-icon>
    </div>
    <p class="text-gray-600">Loading invoice editor...</p>
  </div>
</div>
