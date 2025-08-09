<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  
  // Extract the ID parameter from the URL
  const id = $page.params.id;
  
  onMount(() => {
    // Redirect to the main form page with the ID as a query parameter
    goto(`/vendorCenter/apv/form?id=${id}`);
  });
</script>

<!-- Display a loading indicator while redirecting -->
<div class="flex justify-center items-center h-screen">
  <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  <p class="ml-3 text-lg text-gray-600">Redirecting...</p>
</div>
