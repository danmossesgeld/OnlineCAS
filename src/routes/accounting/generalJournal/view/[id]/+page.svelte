<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  onMount(() => {
    // Extract the ID from the route params
    const id = $page.params.id;
    
    // Redirect to the form page with the ID as a query parameter and viewMode=true
    goto(`/accounting/generalJournal/form?id=${id}&viewMode=true`);
  });
</script>

<div class="flex items-center justify-center h-screen">
  <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  <span class="ml-3 text-gray-700">Redirecting...</span>
</div>
