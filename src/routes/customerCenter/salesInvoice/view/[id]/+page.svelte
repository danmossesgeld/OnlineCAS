<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  
  // Redirect to the form page with query parameters for viewing
  onMount(() => {
    // Extract ID from the current URL path
    const id = window.location.pathname.split('/').pop();
    
    // Redirect to the form with ID and viewMode parameters
    // This uses our formModeStore pattern
    goto(`/customerCenter/salesInvoice/form?id=${id}&viewMode=true`);
  });
</script>

<div class="flex justify-center items-center h-screen w-full">
  <div class="animate-pulse text-center">
    <div class="inline-block rounded-full bg-blue-100 p-4 mb-4">
      <iconify-icon icon="material-symbols:visibility-outline-rounded" width="32" height="32" class="text-blue-600"></iconify-icon>
    </div>
    <p class="text-gray-600">Loading invoice details...</p>
  </div>
</div>
