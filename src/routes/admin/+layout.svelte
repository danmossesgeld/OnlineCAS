<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user } from '$lib/user';
  import { isAdmin, profileReady } from '$lib/stores/userProfile';

  // The root layout (src/routes/+layout.svelte) loads the profile on every auth-state change,
  // but on a hard refresh landing directly on an /admin/* URL, this layout mounts before that
  // first resolves — profileReady (unlike profileLoading, which starts false and is therefore
  // indistinguishable from "already finished") stays false until the first load has actually
  // completed at least once, so waiting on it here avoids bouncing a real admin off their own
  // refresh. This also redirects non-admins away outright, not just hides the sidebar link,
  // since that link alone doesn't stop someone from typing the URL directly.
  onMount(() => {
    const unsubscribe = profileReady.subscribe((ready) => {
      if (ready && !$isAdmin) {
        goto('/main/dashboard');
      }
    });
    return unsubscribe;
  });
</script>

{#if $profileReady && $isAdmin}
  <slot />
{:else if !$user}
  <div class="flex items-center justify-center h-64" style="color: var(--color-neutral-500);">Redirecting...</div>
{:else}
  <div class="flex items-center justify-center h-64" style="color: var(--color-neutral-500);">Checking access...</div>
{/if}
