<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  // Redirect to dashboard by default
  onMount(() => {
    goto('/main/dashboard');
  });
</script>

<div class="p-6 md:p-8 space-y-6">
  <div class="text-center py-10">
    <div class="text-gray-500">Redirecting to dashboard...</div>
  </div>
</div>